import { auth, db } from './firebase.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// URL del Backend en Render
const BACKEND_URL = "https://carshop-backend-2t7v.onrender.com";

// Estado global
let inventario = [];
let ticketVenta = [];

// Referencias DOM - Auth
const loginSection = document.getElementById('admin-login-section');
const panelWrapper = document.getElementById('admin-panel-wrapper');
const formLogin = document.getElementById('form-admin-login');
const btnCerrarSesion = document.getElementById('btn-cerrar-sesion');

// Referencias DOM - Formulario Inventario
const formNuevoItem = document.getElementById('form-nuevo-item');
const formItemTitulo = document.getElementById('form-item-titulo');
const editItemIdInput = document.getElementById('edit-item-id');
const btnGuardarItem = document.getElementById('btn-guardar-item');
const btnCancelarEdicion = document.getElementById('btn-cancelar-edicion');
const inventarioTbody = document.getElementById('inventario-tbody');

// Referencias DOM - Venta / Cobro / ARCA
const selectProducto = document.getElementById('venta-producto');
const inputPrecioUnitario = document.getElementById('venta-precio-unitario');
const inputCantidad = document.getElementById('venta-cantidad');
const btnAgregarTicket = document.getElementById('btn-agregar-al-ticket');
const ticketListaDiv = document.getElementById('ticket-lista');
const ticketTotalEl = document.getElementById('ticket-total-monto');
const selectMetodoPago = document.getElementById('venta-metodo-pago');
const checkEmitirArca = document.getElementById('venta-emitir-arca');
const arcaClientePanel = document.getElementById('arca-cliente-panel');
const selectArcaTipoFactura = document.getElementById('arca-tipo-factura');
const selectArcaDocTipo = document.getElementById('arca-doc-tipo');
const grupoArcaDocNro = document.getElementById('grupo-arca-doc-nro');
const inputArcaDocNro = document.getElementById('arca-doc-nro');
const btnRegistrarVenta = document.getElementById('btn-registrar-venta');

// ==========================================
// 1. AUTENTICACIÓN
// ==========================================
onAuthStateChanged(auth, (user) => {
  if (user) {
    if (loginSection) loginSection.classList.add('hidden');
    if (panelWrapper) panelWrapper.classList.remove('hidden');
    iniciarEscuchaInventario();
  } else {
    if (loginSection) loginSection.classList.remove('hidden');
    if (panelWrapper) panelWrapper.classList.add('hidden');
  }
});

if (formLogin) {
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      alert("Error al iniciar sesión: " + err.message);
    }
  });
}

if (btnCerrarSesion) {
  btnCerrarSesion.addEventListener('click', async () => {
    await signOut(auth);
  });
}

// ==========================================
// 2. INVENTARIO EN TIEMPO REAL
// ==========================================
let unsubscribeInventario = null;

function iniciarEscuchaInventario() {
  if (unsubscribeInventario) return;

  unsubscribeInventario = onSnapshot(collection(db, "productos_servicios"), (snapshot) => {
    inventario = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderizarTablaInventario();
    actualizarSelectProductos();
  }, (error) => {
    console.error("Error leyendo inventario:", error);
  });
}

function renderizarTablaInventario() {
  if (!inventarioTbody) return;

  if (inventario.length === 0) {
    inventarioTbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#888;">No hay ítems cargados todavía.</td></tr>`;
    return;
  }

  inventarioTbody.innerHTML = '';

  inventario.forEach(item => {
    const pCompra = Number(item.precioCompra || 0);
    const pVenta = Number(item.precioVenta || item.precio || 0);
    const stock = Number(item.stock ?? 0);
    const stockMin = Number(item.stockMinimo ?? 1);
    const foto = (item.urlFoto || item.imagen || item.foto || "").trim();

    const esBajo = item.tipo !== 'servicio' && stock <= stockMin;
    const badgeHtml = item.tipo === 'servicio'
      ? `<span class="badge-ok">Servicio</span>`
      : (esBajo ? `<span class="badge-low">Stock Bajo</span>` : `<span class="badge-ok">Normal</span>`);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        ${foto ? `<img src="${foto}" alt="${item.nombre}" class="inv-thumb" referrerpolicy="no-referrer">` : `<div class="inv-thumb"></div>`}
      </td>
      <td><strong>${item.nombre}</strong></td>
      <td>${item.tipo || 'producto'}</td>
      <td>${item.categoria || '-'}</td>
      <td>$${pCompra.toLocaleString('es-AR')}</td>
      <td>$${pVenta.toLocaleString('es-AR')}</td>
      <td>${stock}</td>
      <td>${badgeHtml}</td>
      <td style="white-space:nowrap;">
        <button class="btn-edit" data-id="${item.id}">✏️ Editar</button>
        <button class="btn-del" data-id="${item.id}">🗑️ Borrar</button>
      </td>
    `;

    tr.querySelector('.btn-edit').addEventListener('click', () => cargarItemParaEditar(item));
    tr.querySelector('.btn-del').addEventListener('click', () => eliminarItem(item));

    inventarioTbody.appendChild(tr);
  });
}

// ==========================================
// 3. CREAR / EDITAR / BORRAR EN INVENTARIO
// ==========================================
if (formNuevoItem) {
  formNuevoItem.addEventListener('submit', async (e) => {
    e.preventDefault();

    const editId = editItemIdInput.value.trim();
    const urlFoto = document.getElementById('item-url-foto').value.trim();

    const datos = {
      nombre: document.getElementById('item-nombre').value.trim(),
      tipo: document.getElementById('item-tipo').value,
      categoria: document.getElementById('item-categoria').value.trim(),
      precioCompra: Number(document.getElementById('item-precio-compra').value),
      precioVenta: Number(document.getElementById('item-precio-venta').value),
      stock: Number(document.getElementById('item-stock').value),
      stockMinimo: Number(document.getElementById('item-stock-minimo').value),
      urlFoto: urlFoto,
      imagen: urlFoto
    };

    try {
      btnGuardarItem.disabled = true;
      btnGuardarItem.textContent = "Guardando...";

      if (editId) {
        await updateDoc(doc(db, "productos_servicios", editId), datos);
        resetearFormularioItem();
      } else {
        datos.creadoEn = serverTimestamp();
        await addDoc(collection(db, "productos_servicios"), datos);
        formNuevoItem.reset();
        document.getElementById('item-stock-minimo').value = 2;
      }
    } catch (err) {
      console.error("Error al guardar item:", err);
      alert("Error al guardar el ítem: " + err.message);
    } finally {
      btnGuardarItem.disabled = false;
      if (!editItemIdInput.value) {
        btnGuardarItem.textContent = "Guardar en Inventario";
      }
    }
  });
}

function cargarItemParaEditar(item) {
  editItemIdInput.value = item.id;
  document.getElementById('item-nombre').value = item.nombre || '';
  document.getElementById('item-tipo').value = item.tipo || 'producto';
  document.getElementById('item-categoria').value = item.categoria || '';
  document.getElementById('item-precio-compra').value = item.precioCompra ?? 0;
  document.getElementById('item-precio-venta').value = item.precioVenta ?? item.precio ?? 0;
  document.getElementById('item-stock').value = item.stock ?? 0;
  document.getElementById('item-stock-minimo').value = item.stockMinimo ?? 2;
  document.getElementById('item-url-foto').value = item.urlFoto || item.imagen || '';

  formItemTitulo.textContent = "Editando: " + item.nombre;
  btnGuardarItem.textContent = "Guardar Cambios";
  btnCancelarEdicion.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetearFormularioItem() {
  editItemIdInput.value = '';
  formNuevoItem.reset();
  document.getElementById('item-stock-minimo').value = 2;
  formItemTitulo.textContent = "Cargar Nuevo Item";
  btnGuardarItem.textContent = "Guardar en Inventario";
  btnCancelarEdicion.classList.add('hidden');
}

if (btnCancelarEdicion) {
  btnCancelarEdicion.addEventListener('click', resetearFormularioItem);
}

async function eliminarItem(item) {
  if (!confirm(`¿Seguro que querés eliminar "${item.nombre}" del inventario?`)) return;
  try {
    await deleteDoc(doc(db, "productos_servicios", item.id));
  } catch (err) {
    alert("Error al eliminar: " + err.message);
  }
}

// ==========================================
// 4. PUNTO DE VENTA (MULTI-ITEM + PRECIO EDITABLE)
// ==========================================
function actualizarSelectProductos() {
  if (!selectProducto) return;
  const seleccionPrevia = selectProducto.value;

  selectProducto.innerHTML = `<option value="">-- Seleccionar producto o servicio --</option>`;
  inventario.forEach(item => {
    const pVenta = Number(item.precioVenta || item.precio || 0);
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = `${item.nombre} - $${pVenta.toLocaleString('es-AR')} (Stock: ${item.stock ?? 0})`;
    selectProducto.appendChild(opt);
  });

  if (seleccionPrevia) {
    selectProducto.value = seleccionPrevia;
  }
}

if (selectProducto) {
  selectProducto.addEventListener('change', () => {
    const id = selectProducto.value;
    const prod = inventario.find(p => p.id === id);
    if (prod) {
      inputPrecioUnitario.value = Number(prod.precioVenta || prod.precio || 0);
    } else {
      inputPrecioUnitario.value = '';
    }
  });
}

if (btnAgregarTicket) {
  btnAgregarTicket.addEventListener('click', () => {
    const id = selectProducto.value;
    if (!id) {
      alert("Seleccioná primero un producto o servicio.");
      return;
    }

    const prod = inventario.find(p => p.id === id);
    if (!prod) return;

    const precioUnitario = Number(inputPrecioUnitario.value);
    const cantidad = Number(inputCantidad.value);

    if (isNaN(precioUnitario) || precioUnitario < 0) {
      alert("Ingresá un precio de venta válido.");
      return;
    }

    if (isNaN(cantidad) || cantidad < 1) {
      alert("La cantidad debe ser al menos 1.");
      return;
    }

    const yaEnTicket = ticketVenta
      .filter(i => i.id === id)
      .reduce((acc, i) => acc + i.cantidad, 0);

    if (prod.tipo !== 'servicio' && (yaEnTicket + cantidad) > Number(prod.stock || 0)) {
      alert(`Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock}`);
      return;
    }

    const existente = ticketVenta.find(i => i.id === id && i.precioUnitario === precioUnitario);
    if (existente) {
      existente.cantidad += cantidad;
      existente.subtotal = existente.cantidad * existente.precioUnitario;
    } else {
      ticketVenta.push({
        id: prod.id,
        nombre: prod.nombre,
        tipo: prod.tipo || 'producto',
        cantidad: cantidad,
        precioUnitario: precioUnitario,
        subtotal: cantidad * precioUnitario
      });
    }

    selectProducto.value = '';
    inputPrecioUnitario.value = '';
    inputCantidad.value = 1;

    renderizarTicketVenta();
  });
}

function renderizarTicketVenta() {
  if (!ticketListaDiv || !ticketTotalEl) return;

  if (ticketVenta.length === 0) {
    ticketListaDiv.innerHTML = `<p style="color:#777; font-size:0.85rem; margin:4px 0;">Todavía no agregaste ítems al ticket.</p>`;
    ticketTotalEl.textContent = "$0";
    return;
  }

  ticketListaDiv.innerHTML = '';
  let totalGeneral = 0;

  ticketVenta.forEach((item, index) => {
    totalGeneral += item.subtotal;

    const row = document.createElement('div');
    row.className = 'ticket-item';
    row.innerHTML = `
      <div class="ticket-item-info">
        <strong>${item.cantidad}x</strong> ${item.nombre}
        <div style="font-size:0.78rem; color:#999;">$${item.precioUnitario.toLocaleString('es-AR')} c/u</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="ticket-item-sub">$${item.subtotal.toLocaleString('es-AR')}</span>
        <button type="button" class="btn-quitar-item" title="Quitar">✖</button>
      </div>
    `;

    row.querySelector('.btn-quitar-item').addEventListener('click', () => {
      ticketVenta.splice(index, 1);
      renderizarTicketVenta();
    });

    ticketListaDiv.appendChild(row);
  });

  ticketTotalEl.textContent = `$${totalGeneral.toLocaleString('es-AR')}`;
}

// ==========================================
// 5. DATOS DE CLIENTE ARCA (DNI / CUIT)
// ==========================================
if (checkEmitirArca) {
  checkEmitirArca.addEventListener('change', () => {
    if (checkEmitirArca.checked) {
      arcaClientePanel.classList.remove('hidden');
    } else {
      arcaClientePanel.classList.add('hidden');
    }
  });
}

if (selectArcaDocTipo) {
  selectArcaDocTipo.addEventListener('change', () => {
    const tipo = selectArcaDocTipo.value;
    if (tipo === "99") {
      grupoArcaDocNro.classList.add('hidden');
      inputArcaDocNro.value = '';
    } else {
      grupoArcaDocNro.classList.remove('hidden');
      inputArcaDocNro.placeholder = tipo === "80" ? "Ej: 20471234567 (11 dígitos)" : "Ej: 47123456 (7 u 8 dígitos)";
    }
  });
}

// ==========================================
// 6. REGISTRAR VENTA (/api/caja/venta) + ARCA (/api/facturacion/emitir)
// ==========================================
if (btnRegistrarVenta) {
  btnRegistrarVenta.addEventListener('click', async () => {
    let itemsAFacturar = [...ticketVenta];

    if (itemsAFacturar.length === 0 && selectProducto.value) {
      const prod = inventario.find(p => p.id === selectProducto.value);
      const precioUnit = inputPrecioUnitario.value !== ""
        ? Number(inputPrecioUnitario.value)
        : Number(prod.precioVenta || 0);
      const cant = Number(inputCantidad.value || 1);

      if (prod.tipo !== 'servicio' && cant > Number(prod.stock || 0)) {
        alert(`Stock insuficiente para "${prod.nombre}". Disponible: ${prod.stock}`);
        return;
      }

      itemsAFacturar.push({
        id: prod.id,
        nombre: prod.nombre,
        tipo: prod.tipo || 'producto',
        cantidad: cant,
        precioUnitario: precioUnit,
        subtotal: cant * precioUnit
      });
    }

    if (itemsAFacturar.length === 0) {
      alert("Agregá al menos un producto o servicio al ticket para registrar la venta.");
      return;
    }

    const totalVenta = itemsAFacturar.reduce((acc, i) => acc + i.subtotal, 0);
    const metodoPago = selectMetodoPago.value;
    const emitirFactura = checkEmitirArca.checked;

    const tieneProductos = itemsAFacturar.some(i => i.tipo === 'producto');
    const tieneServicios = itemsAFacturar.some(i => i.tipo === 'servicio');
    let concepto = 1;
    if (tieneProductos && tieneServicios) concepto = 3;
    else if (tieneServicios) concepto = 2;

    let tipoDoc = 99;
    let cuitDniCliente = "";
    let tipoFactura = 11;

    if (emitirFactura) {
      tipoFactura = Number(selectArcaTipoFactura.value) || 11;
      tipoDoc = Number(selectArcaDocTipo.value) || 99;
      cuitDniCliente = (inputArcaDocNro.value || "").replace(/\D/g, '');

      if (tipoDoc === 96 && (cuitDniCliente.length < 7 || cuitDniCliente.length > 8)) {
        alert("Para facturar con DNI ingresá un número válido de 7 u 8 dígitos.");
        inputArcaDocNro.focus();
        return;
      }

      if (tipoDoc === 80 && cuitDniCliente.length !== 11) {
        alert("Para facturar con CUIT ingresá los 11 dígitos sin guiones.");
        inputArcaDocNro.focus();
        return;
      }

      if (tipoDoc === 99) {
        cuitDniCliente = "0";
      }
    }

    try {
      btnRegistrarVenta.disabled = true;
      btnRegistrarVenta.textContent = "Registrando venta en caja...";

      // PASO 1: Registrar la venta y descontar stock en /api/caja/venta
      const resCaja = await fetch(`${BACKEND_URL}/api/caja/venta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: itemsAFacturar,
          metodoPago,
          total: totalVenta,
          cliente: {
            nombre: tipoDoc === 99 ? "Consumidor Final" : `Doc ${cuitDniCliente}`,
            tipoDoc,
            cuitDni: cuitDniCliente
          }
        })
      });

      const textoCaja = await resCaja.text();
      let dataCaja;
      try {
        dataCaja = JSON.parse(textoCaja);
      } catch {
        throw new Error(`El servidor de caja devolvió una respuesta inesperada (${resCaja.status}).`);
      }

      if (!resCaja.ok || !dataCaja.success) {
        throw new Error(dataCaja.error || `Error al registrar venta (${resCaja.status})`);
      }

      const ventaId = dataCaja.ventaId;

      // PASO 2: Si está marcado ARCA, emitir factura electrónica en /api/facturacion/emitir
      if (emitirFactura) {
        btnRegistrarVenta.textContent = "Emitiendo factura en ARCA...";

        const resArca = await fetch(`${BACKEND_URL}/api/facturacion/emitir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ventaId,
            cuitDniCliente,
            tipoDoc,
            tipoFactura,
            total: totalVenta,
            concepto
          })
        });

        const textoArca = await resArca.text();
        let dataArca;
        try {
          dataArca = JSON.parse(textoArca);
        } catch {
          throw new Error(`La venta se guardó en caja, pero ARCA devolvió una respuesta inválida (${resArca.status}).`);
        }

        if (!resArca.ok || !dataArca.success) {
          throw new Error(`La venta se guardó en caja y se descontó stock, pero falló ARCA:\n${dataArca.error || 'Error desconocido'}`);
        }

        const f = dataArca.datosFactura || {};
        limpiarFormularioVenta();
        alert(
          `✅ ¡Venta registrada y Factura ARCA emitida!\n\n` +
          `Punto de Venta: ${f.puntoVenta || '-'}\n` +
          `Comprobante N°: ${f.numeroComprobante || '-'}\n` +
          `CAE: ${f.cae || '-'}\n` +
          `Vencimiento CAE: ${f.vencimientoCae || '-'}`
        );
      } else {
        limpiarFormularioVenta();
        alert(`✅ Venta registrada correctamente por $${totalVenta.toLocaleString('es-AR')}.`);
      }

    } catch (err) {
      console.error("Error al procesar la venta:", err);
      alert("❌ " + err.message);
    } finally {
      btnRegistrarVenta.disabled = false;
      btnRegistrarVenta.textContent = "Registrar Venta";
    }
  });
}

function limpiarFormularioVenta() {
  ticketVenta = [];
  renderizarTicketVenta();
  selectProducto.value = '';
  inputPrecioUnitario.value = '';
  inputCantidad.value = 1;
  inputArcaDocNro.value = '';
}