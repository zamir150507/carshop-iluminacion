import { db, auth } from './firebase.js';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  collection, 
  addDoc, 
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const BACKEND_URL = "http://localhost:3000";

// Elementos del DOM
const loginContainer = document.getElementById('login-container');
const adminContainer = document.getElementById('admin-container');
const formLogin = document.getElementById('form-login');
const btnLogout = document.getElementById('btn-logout');
const formNuevoItem = document.getElementById('form-nuevo-item');
const formVenta = document.getElementById('form-venta');
const selectVentaItem = document.getElementById('venta-item');
const tablaInventarioBody = document.getElementById('tabla-inventario-body');
const alertasContainer = document.getElementById('alertas-container');

// Elementos del Modal de Edición
const modalEditar = document.getElementById('modal-editar');
const formEditarItem = document.getElementById('form-editar-item');
const btnCerrarModal = document.getElementById('btn-cerrar-modal');

let inventarioProductos = [];

// Inicializador seguro
function iniciarApp() {
  initAuthListeners();
  initFormListeners();
  initModalListeners();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarApp);
} else {
  iniciarApp();
}

// Escuchador de Autenticación
function initAuthListeners() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      loginContainer.style.display = 'none';
      adminContainer.style.display = 'block';
      escucharInventario();
    } else {
      loginContainer.style.display = 'flex';
      adminContainer.style.display = 'none';
    }
  });

  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Error al ingresar:", error);
      alert("Credenciales incorrectas: " + error.message);
    }
  });

  btnLogout.addEventListener('click', () => signOut(auth));
}

// Escuchador de Formularios (Crear y Vender)
function initFormListeners() {
  // Cargar nuevo producto
  formNuevoItem.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      const nuevoItem = {
        nombre: document.getElementById('item-nombre').value.trim(),
        tipo: document.getElementById('item-tipo').value,
        categoria: document.getElementById('item-categoria').value.trim(),
        precioCompra: Number(document.getElementById('item-precio-compra').value),
        precioVenta: Number(document.getElementById('item-precio-venta').value),
        stock: Number(document.getElementById('item-stock').value),
        stockMinimo: Number(document.getElementById('item-stock-minimo').value),
        imagenUrl: document.getElementById('item-imagen-url').value.trim(),
        activo: true,
        fechaAlta: new Date().toISOString()
      };

      await addDoc(collection(db, "productos_servicios"), nuevoItem);
      alert('¡Item registrado correctamente!');
      formNuevoItem.reset();
    } catch (error) {
      console.error("Error al guardar item:", error);
      alert("Error al registrar el item.");
    }
  });

  // Registrar Venta
  formVenta.addEventListener('submit', async (e) => {
    e.preventDefault();

    const idProducto = selectVentaItem.value;
    const cantidad = Number(document.getElementById('venta-cantidad').value);
    const metodoPago = document.getElementById('venta-metodo').value;
    const emitirArca = document.getElementById('venta-arca').checked;

    if (!idProducto) {
      alert("Seleccioná un item válido.");
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/caja/registrar-venta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: idProducto, cantidad }],
          metodoPago,
          emitirArca
        })
      });

      const data = await res.json();
      if (res.ok) {
        alert('¡Venta registrada con éxito!');
        formVenta.reset();
      } else {
        alert('Error: ' + data.error);
      }
    } catch (error) {
      console.error("Error al conectar con el servidor de caja:", error);
      alert("Error de conexión con el backend.");
    }
  });
}

// Lógica del Modal de Edición
function initModalListeners() {
  btnCerrarModal.addEventListener('click', () => {
    modalEditar.style.display = 'none';
  });

  window.addEventListener('click', (e) => {
    if (e.target === modalEditar) {
      modalEditar.style.display = 'none';
    }
  });

  formEditarItem.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;

    try {
      const docRef = doc(db, "productos_servicios", id);
      await updateDoc(docRef, {
        nombre: document.getElementById('edit-nombre').value.trim(),
        tipo: document.getElementById('edit-tipo').value,
        categoria: document.getElementById('edit-categoria').value.trim(),
        precioCompra: Number(document.getElementById('edit-precio-compra').value),
        precioVenta: Number(document.getElementById('edit-precio-venta').value),
        stock: Number(document.getElementById('edit-stock').value),
        stockMinimo: Number(document.getElementById('edit-stock-minimo').value),
        imagenUrl: document.getElementById('edit-imagen-url').value.trim()
      });

      alert('¡Producto actualizado con éxito!');
      modalEditar.style.display = 'none';
    } catch (error) {
      console.error("Error al actualizar item:", error);
      alert("Error al intentar modificar el producto.");
    }
  });
}

// Función global para abrir modal de edición (invocada desde los botones de la tabla)
window.abrirModalEditar = (id) => {
  const item = inventarioProductos.find(p => p.id === id);
  if (!item) return;

  document.getElementById('edit-id').value = item.id;
  document.getElementById('edit-nombre').value = item.nombre;
  document.getElementById('edit-tipo').value = item.tipo;
  document.getElementById('edit-categoria').value = item.categoria;
  document.getElementById('edit-precio-compra').value = item.precioCompra;
  document.getElementById('edit-precio-venta').value = item.precioVenta;
  document.getElementById('edit-stock').value = item.stock;
  document.getElementById('edit-stock-minimo').value = item.stockMinimo;
  document.getElementById('edit-imagen-url').value = item.imagenUrl || '';

  modalEditar.style.display = 'flex';
};

// Función global para eliminar item de Firestore
window.eliminarItem = async (id, nombre) => {
  const confirmar = confirm(`¿Estás seguro de que querés eliminar "${nombre}" del inventario?`);
  if (!confirmar) return;

  try {
    await deleteDoc(doc(db, "productos_servicios", id));
    alert('Item eliminado correctamente.');
  } catch (error) {
    console.error("Error al eliminar item:", error);
    alert("Error al intentar borrar el producto.");
  }
};

// Escuchar cambios en la base de datos en tiempo real
function escucharInventario() {
  const q = query(collection(db, "productos_servicios"), orderBy("fechaAlta", "desc"));
  
  onSnapshot(q, (snapshot) => {
    tablaInventarioBody.innerHTML = '';
    selectVentaItem.innerHTML = '<option value="">Seleccionar Item...</option>';
    alertasContainer.innerHTML = '';
    inventarioProductos = [];

    snapshot.forEach((docSnap) => {
      const item = { id: docSnap.id, ...docSnap.data() };
      inventarioProductos.push(item);

      // 1. Renderizar fila con botones de Acción
      const fila = document.createElement('tr');
      const imgTd = item.imagenUrl 
        ? `<img src="${item.imagenUrl}" alt="${item.nombre}" class="table-thumb">`
        : `<span class="no-thumb">Sin foto</span>`;

      fila.innerHTML = `
        <td>${imgTd}</td>
        <td><strong>${item.nombre}</strong></td>
        <td>${item.tipo}</td>
        <td>${item.categoria}</td>
        <td>$${item.precioCompra.toLocaleString('es-AR')}</td>
        <td>$${item.precioVenta.toLocaleString('es-AR')}</td>
        <td>${item.stock}</td>
        <td>
          <span class="badge ${item.stock <= item.stockMinimo && item.tipo === 'producto' ? 'badge-danger' : 'badge-success'}">
            ${item.stock <= item.stockMinimo && item.tipo === 'producto' ? 'Stock Bajo' : 'Normal'}
          </span>
        </td>
        <td>
          <div class="actions-cell">
            <button class="btn-edit" onclick="abrirModalEditar('${item.id}')">✏️ Editar</button>
            <button class="btn-delete" onclick="eliminarItem('${item.id}', '${item.nombre.replace(/'/g, "\\'")}')">🗑️ Borrar</button>
          </div>
        </td>
      `;
      tablaInventarioBody.appendChild(fila);

      // 2. Cargar en el desplegable de ventas
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.nombre} ($${item.precioVenta}) - Stock: ${item.stock}`;
      selectVentaItem.appendChild(option);

      // 3. Generar Alerta si el stock es crítico
      if (item.tipo === 'producto' && item.stock <= item.stockMinimo) {
        const alerta = document.createElement('div');
        alerta.className = 'alert alert-warning';
        alerta.innerHTML = `⚠️ <strong>ALERTA DE STOCK:</strong> El producto <strong>${item.nombre}</strong> le quedan ${item.stock} unidades (Mínimo: ${item.stockMinimo}).`;
        alertasContainer.appendChild(alerta);
      }
    });
  });
}