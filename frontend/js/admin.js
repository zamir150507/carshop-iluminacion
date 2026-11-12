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

// URL del Backend en Render (para emitir factura ARCA)
const BACKEND_URL = "https://carshop-backend-2t7v.onrender.com";

// Datos fiscales del comercio para el encabezado y QR de la factura
const DATOS_EMISOR = {
  nombreFantasia: "CarShop Iluminación",
  razonSocial: "Salomon Kevin Nicolas",
  cuit: 20394386813,
  cuitFormateado: "20-39438681-3",
  domicilio: "Cabo Benitez 2836 - Comodoro Rivadavia, Chubut",
  condicionIva: "Responsable Monotributo"
};

// Estado global
let inventario = [];
let historialVentas = [];
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
const ventasTbody = document.getElementById('ventas-tbody');

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

// Referencias DOM - Modal Factura PDF
const modalFacturaPrint = document.getElementById('modal-factura-print');
const facturaHojaContenido = document.getElementById('factura-hoja-contenido');
const btnImprimirFactura = document.getElementById('btn-imprimir-factura');
const btnCerrarModalFactura = document.getElementById('btn-cerrar-modal-factura');

// ==========================================
// 1. AUTENTICACIÓN
// ==========================================
onAuthStateChanged(auth, (user) => {
  if (user) {
    if (loginSection) loginSection.classList.add('hidden');
    if (panelWrapper) panelWrapper.classList.remove('hidden');
    iniciarEscuchaInventario();
    iniciarEscuchaVentas();
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
// 2. INVENTARIO Y VENTAS EN TIEMPO REAL
// ==========================================
let unsubscribeInventario = null;
let unsubscribeVentas = null;

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

function iniciarEscuchaVentas() {
  if (unsubscribeVentas) return;

  unsubscribeVentas = onSnapshot(collection(db, "ventas"), (snapshot) => {
    historialVentas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    // Ordenar de más reciente a más antigua
    historialVentas.sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    renderizarTablaVentas();
  }, (error) => {
    console.error("Error leyendo ventas:", error);
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

function renderizarTablaVentas() {
  if (!ventasTbody) return;

  if (historialVentas.length === 0) {
    ventasTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#888;">Todavía no hay ventas registradas.</td></tr>`;
    return;
  }

  ventasTbody.innerHTML = '';

  historialVentas.forEach(venta => {
    const fechaObj = venta.fecha ? new Date(venta.fecha) : new Date();
    const fechaStr = fechaObj.toLocaleDateString('es-AR') + ' ' + fechaObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    const resumenItems = (venta.items || []).map(i => `${i.cantidad}x ${i.nombre}`).join(', ');
    const clienteTxt = venta.cliente?.cuitDni && venta.cliente.cuitDni !== '0'
      ? `Doc: ${venta.cliente.cuitDni}`
      : 'Consumidor Final';

    const f = venta.datosFactura;
    const badgeArca = venta.facturadoARCA && f
      ? `<span class="badge-arca">PV ${String(f.puntoVenta).padStart(4, '0')}-${String(f.numeroComprobante).padStart(8, '0')} | CAE: ${f.cae}</span>`
      : `<span style="color:#888; font-size:0.82rem;">Sin factura fiscal</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="white-space:nowrap;">${fechaStr}</td>
      <td>${resumenItems || '-'}</td>
      <td>${clienteTxt}</td>
      <td>${venta.metodoPago || '-'}</td>
      <td><strong>$${Number(venta.total || 0).toLocaleString('es-AR')}</strong></td>
      <td>${badgeArca}</td>
      <td>
        <button class="btn-pdf">📄 Ver / PDF</button>
      </td>
    `;

    tr.querySelector('.btn-pdf').addEventListener('click', () => abrirModalFactura(venta));
    ventasTbody.appendChild(tr);
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
// 6. REGISTRAR VENTA EN FIRESTORE + FACTURA ARCA
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
      let datosFactura = null;

      // PASO 1: Si está marcado ARCA, emitir comprobante electrónico
      if (emitirFactura) {
        btnRegistrarVenta.textContent = "Emitiendo factura en ARCA...";

        const resArca = await fetch(`${BACKEND_URL}/api/facturacion/emitir`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ventaId: null,
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
          throw new Error(`El servidor ARCA devolvió una respuesta inválida (${resArca.status}).`);
        }

        if (!resArca.ok || !dataArca.success) {
          throw new Error(`Error al emitir factura en ARCA:\n${dataArca.error || 'Error desconocido'}`);
        }

        datosFactura = dataArca.datosFactura || null;
      }

      btnRegistrarVenta.textContent = "Actualizando stock y caja...";

      // PASO 2: Descontar stock en Firestore
      const cantidadesDescontar = {};
      for (const item of itemsAFacturar) {
        if (item.tipo !== 'servicio' && item.id) {
          cantidadesDescontar[item.id] = (cantidadesDescontar[item.id] || 0) + item.cantidad;
        }
      }

      for (const [prodId, cantVendida] of Object.entries(cantidadesDescontar)) {
        const prodActual = inventario.find(p => p.id === prodId);
        if (prodActual) {
          const nuevoStock = Math.max(0, Number(prodActual.stock || 0) - cantVendida);
          await updateDoc(doc(db, "productos_servicios", prodId), { stock: nuevoStock });
        }
      }

      // PASO 3: Guardar venta en Firestore
      const ventaObj = {
        fecha: new Date().toISOString(),
        items: itemsAFacturar,
        total: totalVenta,
        metodoPago,
        cliente: {
          nombre: tipoDoc === 99 ? "Consumidor Final" : `Doc ${cuitDniCliente}`,
          tipoDoc,
          cuitDni: cuitDniCliente
        },
        facturadoARCA: emitirFactura,
        datosFactura
      };

      await addDoc(collection(db, "ventas"), {
        ...ventaObj,
        creadoEn: serverTimestamp()
      });

      limpiarFormularioVenta();
      abrirModalFactura(ventaObj);

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

// ==========================================
// 7. GENERAR VISTA DE FACTURA / PDF + QR ARCA
// ==========================================
function abrirModalFactura(venta) {
  if (!modalFacturaPrint || !facturaHojaContenido) return;

  const esFiscal = Boolean(venta.facturadoARCA && venta.datosFactura);
  const f = venta.datosFactura || {};

  // Letra y código de comprobante
  let letra = "X";
  let codTexto = "COMPROBANTE DE VENTA";
  let tipoCmpNum = 11;

  if (esFiscal) {
    tipoCmpNum = Number(f.tipoFactura || 11);
    if (tipoCmpNum === 1) {
      letra = "A";
      codTexto = "COD. 001 - FACTURA A";
    } else if (tipoCmpNum === 6) {
      letra = "B";
      codTexto = "COD. 006 - FACTURA B";
    } else {
      letra = "C";
      codTexto = "COD. 011 - FACTURA C";
    }
  }

  const fechaObj = venta.fecha ? new Date(venta.fecha) : new Date();
  const fechaFormateada = fechaObj.toLocaleDateString('es-AR');
  const fechaIsoQr = fechaObj.toISOString().split('T')[0];

  const ptoVtaStr = esFiscal ? String(f.puntoVenta || 5).padStart(5, '0') : "00000";
  const nroCompStr = esFiscal ? String(f.numeroComprobante || 1).padStart(8, '0') : String(Date.now()).slice(-8);

  // Datos del receptor
  const docTipo = Number(venta.cliente?.tipoDoc || f.docTipo || 99);
  const docNro = String(venta.cliente?.cuitDni || f.docNro || "0");
  let docLabel = "Consumidor Final";
  if (docTipo === 80 && docNro !== "0") docLabel = `CUIT: ${docNro}`;
  else if (docTipo === 96 && docNro !== "0") docLabel = `DNI: ${docNro}`;

  // Generar Código QR oficial de ARCA (RG 4892)
  let bloqueArcaHtml = `<div style="margin-top:16px; color:#555; font-size:12px;">Documento no válido como factura fiscal.</div>`;

  if (esFiscal) {
    const payloadQr = {
      ver: 1,
      fecha: fechaIsoQr,
      cuit: DATOS_EMISOR.cuit,
      ptoVta: Number(f.puntoVenta || 5),
      tipoCmp: tipoCmpNum,
      nroCmp: Number(f.numeroComprobante || 1),
      importe: Number(venta.total || 0),
      moneda: "PES",
      ctz: 1,
      tipoDocRec: docTipo,
      nroDocRec: Number(docNro) || 0,
      tipoCodAut: "E",
      codAut: Number(f.cae) || String(f.cae)
    };

    const base64Qr = btoa(JSON.stringify(payloadQr));
    const urlArcaQr = `https://www.arca.gob.ar/fe/qr/?p=${base64Qr}`;
    const imgQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(urlArcaQr)}`;

    // Formatear vencimiento CAE (YYYYMMDD -> DD/MM/YYYY)
    let vtoCaeFmt = String(f.vencimientoCae || '');
    if (vtoCaeFmt.length === 8) {
      vtoCaeFmt = `${vtoCaeFmt.slice(6, 8)}/${vtoCaeFmt.slice(4, 6)}/${vtoCaeFmt.slice(0, 4)}`;
    }

    bloqueArcaHtml = `
      <div class="fac-footer-arca">
        <div style="display:flex; align-items:center; gap:14px;">
          <img src="${imgQrUrl}" alt="QR ARCA" class="fac-qr-img">
          <div style="font-size:11px; color:#333;">
            <strong>ARCA - Agencia de Recaudación y Control Aduanero</strong><br>
            Comprobante Autorizado Electrónicamente
          </div>
        </div>
        <div style="text-align:right; font-size:13px;">
          <div><strong>CAE N°:</strong> ${f.cae}</div>
          <div><strong>Fecha de Vto. de CAE:</strong> ${vtoCaeFmt}</div>
        </div>
      </div>
    `;
  }

  const filasItemsHtml = (venta.items || []).map(item => `
    <tr>
      <td>${item.cantidad}</td>
      <td>${item.nombre}</td>
      <td style="text-align:right;">$${Number(item.precioUnitario || 0).toLocaleString('es-AR')}</td>
      <td style="text-align:right;"><strong>$${Number(item.subtotal || 0).toLocaleString('es-AR')}</strong></td>
    </tr>
  `).join('');

  facturaHojaContenido.innerHTML = `
    <div style="text-align:center; font-weight:bold; border:1px solid #222; border-bottom:none; padding:4px; background:#f5f5f5;">
      ORIGINAL
    </div>
    <div class="fac-header">
      <div class="fac-col-izq">
        <div style="font-size:18px; font-weight:bold; margin-bottom:6px;">${DATOS_EMISOR.nombreFantasia}</div>
        <div><strong>Titular:</strong> ${DATOS_EMISOR.razonSocial}</div>
        <div><strong>Domicilio:</strong> ${DATOS_EMISOR.domicilio}</div>
        <div><strong>Condición frente al IVA:</strong> ${DATOS_EMISOR.condicionIva}</div>
      </div>
      <div class="fac-letra-box">
        <div class="fac-letra">${letra}</div>
        <div class="fac-cod">${codTexto.split(' - ')[0]}</div>
      </div>
      <div class="fac-col-der" style="padding-left:28px;">
        <div style="font-size:16px; font-weight:bold; margin-bottom:6px;">${esFiscal ? 'FACTURA' : 'RECIBO'}</div>
        <div><strong>Punto de Venta:</strong> ${ptoVtaStr} &nbsp; <strong>Comp. Nro:</strong> ${nroCompStr}</div>
        <div><strong>Fecha de Emisión:</strong> ${fechaFormateada}</div>
        <div><strong>CUIT:</strong> ${DATOS_EMISOR.cuitFormateado}</div>
      </div>
    </div>

    <div class="fac-cliente-box">
      <div><strong>Cliente:</strong> ${docLabel}</div>
      <div><strong>Condición de Venta:</strong> ${venta.metodoPago || 'Contado'}</div>
    </div>

    <table class="fac-tabla">
      <thead>
        <tr>
          <th style="width:65px;">Cant.</th>
          <th>Producto / Servicio</th>
          <th style="width:120px; text-align:right;">Precio Unit.</th>
          <th style="width:120px; text-align:right;">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${filasItemsHtml}
      </tbody>
    </table>

    <div class="fac-totales">
      Importe Total: $${Number(venta.total || 0).toLocaleString('es-AR')}
    </div>

    ${bloqueArcaHtml}
  `;

  modalFacturaPrint.classList.remove('hidden');
}

if (btnImprimirFactura) {
  btnImprimirFactura.addEventListener('click', () => {
    window.print();
  });
}

if (btnCerrarModalFactura) {
  btnCerrarModalFactura.addEventListener('click', () => {
    modalFacturaPrint.classList.add('hidden');
  });
}