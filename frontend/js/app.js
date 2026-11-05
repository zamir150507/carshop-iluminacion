import { db } from './firebase.js';
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================
// CONFIGURACIÓN DE TU NÚMERO DE WHATSAPP
// ==========================================
const TELEFONO_WHATSAPP = "5492974114542";

// Estado global de productos y carrito
let productosColeccion = [];
let carrito = JSON.parse(localStorage.getItem('carshop_carrito')) || [];

// Elementos del DOM
const catalogoGrid = document.getElementById('catalogo-grid');
const inputBuscador = document.getElementById('input-buscador');
const btnAbrirCarrito = document.getElementById('btn-abrir-carrito');
const btnCerrarCarrito = document.getElementById('btn-cerrar-carrito');
const modalCarrito = document.getElementById('modal-carrito');
const carritoItemsDiv = document.getElementById('carrito-items');
const carritoTotalEl = document.getElementById('carrito-total');
const cartCountBadge = document.getElementById('cart-count');
const btnCheckoutWhatsapp = document.getElementById('btn-checkout-whatsapp');
const headerWhatsappLink = document.getElementById('header-whatsapp-link');
const formCotizador = document.getElementById('form-cotizador');

// Configurar enlace de WhatsApp en el Header
if (headerWhatsappLink) {
  headerWhatsappLink.href = `https://wa.me/${TELEFONO_WHATSAPP}`;
  headerWhatsappLink.textContent = `+${TELEFONO_WHATSAPP}`;
}

// 1. CARGAR PRODUCTOS DESDE FIRESTORE ('productos_servicios') EN TIEMPO REAL
onSnapshot(collection(db, "productos_servicios"), (snapshot) => {
  productosColeccion = [];
  snapshot.forEach(doc => {
    productosColeccion.push({ id: doc.id, ...doc.data() });
  });
  renderizarCatalogo(productosColeccion);
  actualizarUIBagde();
}, (err) => {
  console.error("Error al leer la colección productos_servicios:", err);
  if (catalogoGrid) {
    catalogoGrid.innerHTML = `<p class="loading-text">Error al cargar productos.</p>`;
  }
});

// 2. RENDERIZAR TARJETAS EN EL CATÁLOGO
function renderizarCatalogo(lista) {
  if (!catalogoGrid) return;
  
  if (lista.length === 0) {
    catalogoGrid.innerHTML = `<p class="loading-text">No se encontraron productos o servicios.</p>`;
    return;
  }

  catalogoGrid.innerHTML = '';
  const fallbackImg = "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?w=400&q=80";

  lista.forEach(p => {
    const precioNum = Number(p.precioVenta || p.precio || 0);
    const fotoDirecta = (p.urlFoto || p.imagen || p.foto || "").trim();
    const srcImagen = fotoDirecta !== "" ? fotoDirecta : fallbackImg;

    const card = document.createElement('div');
    card.className = 'card-producto';
    card.innerHTML = `
      <img src="${srcImagen}" alt="${p.nombre}" class="producto-img">
      <div class="card-body">
        <h3>${p.nombre}</h3>
        <p class="precio">$${precioNum.toLocaleString('es-AR')}</p>
        <p class="stock">Stock disponible: ${p.stock ?? 1}</p>
        <button class="btn btn-primary full-width btn-agregar">
          🛒 Agregar al Carrito
        </button>
      </div>
    `;

    // Manejo seguro de imagen rota o bloqueada
    const imgEl = card.querySelector('.producto-img');
    imgEl.addEventListener('error', () => {
      imgEl.src = fallbackImg;
    });

    // Evento para agregar producto al carrito
    card.querySelector('.btn-agregar').addEventListener('click', () => {
      agregarAlCarrito({ ...p, precio: precioNum });
    });

    catalogoGrid.appendChild(card);
  });
}

// 3. BUSCADOR EN TIEMPO REAL
if (inputBuscador) {
  inputBuscador.addEventListener('input', (e) => {
    const busqueda = e.target.value.toLowerCase().trim();
    const filtrados = productosColeccion.filter(p => 
      (p.nombre && p.nombre.toLowerCase().includes(busqueda)) || 
      (p.categoria && p.categoria.toLowerCase().includes(busqueda))
    );
    renderizarCatalogo(filtrados);
  });
}

// 4. LÓGICA DEL CARRITO DE COMPRAS
function agregarAlCarrito(producto) {
  const existe = carrito.find(item => item.id === producto.id);
  const stockDisponible = producto.stock ?? 99;

  if (existe) {
    if (existe.cantidad < stockDisponible) {
      existe.cantidad++;
    } else {
      alert("No hay más stock disponible de este producto.");
      return;
    }
  } else {
    carrito.push({
      id: producto.id,
      nombre: producto.nombre,
      precio: Number(producto.precio),
      cantidad: 1
    });
  }
  guardarCarrito();
  actualizarUIBagde();
  abrirModalCarrito();
}

function eliminarDelCarrito(id) {
  carrito = carrito.filter(item => item.id !== id);
  guardarCarrito();
  renderizarCarritoModal();
  actualizarUIBagde();
}

function cambiarCantidad(id, cambio) {
  const item = carrito.find(i => i.id === id);
  if (!item) return;

  item.cantidad += cambio;
  if (item.cantidad <= 0) {
    eliminarDelCarrito(id);
  } else {
    guardarCarrito();
    renderizarCarritoModal();
    actualizarUIBagde();
  }
}

function guardarCarrito() {
  localStorage.setItem('carshop_carrito', JSON.stringify(carrito));
}

function actualizarUIBagde() {
  const totalItems = carrito.reduce((acc, item) => acc + item.cantidad, 0);
  if (cartCountBadge) cartCountBadge.textContent = totalItems;
}

function renderizarCarritoModal() {
  if (!carritoItemsDiv) return;

  if (carrito.length === 0) {
    carritoItemsDiv.innerHTML = `<p style="color:#aaa; text-align:center; padding: 20px;">El carrito está vacío.</p>`;
    if (carritoTotalEl) carritoTotalEl.textContent = "$0";
    return;
  }

  carritoItemsDiv.innerHTML = '';
  let total = 0;

  carrito.forEach(item => {
    const subtotal = item.precio * item.cantidad;
    total += subtotal;

    const row = document.createElement('div');
    row.className = 'carrito-item';
    row.innerHTML = `
      <div class="item-info">
        <strong>${item.nombre}</strong>
        <span>$${item.precio.toLocaleString('es-AR')} c/u</span>
      </div>
      <div class="item-controles">
        <button class="btn-cant btn-restar">-</button>
        <span class="cant-num">${item.cantidad}</span>
        <button class="btn-cant btn-sumar">+</button>
        <button class="btn-eliminar">&times;</button>
      </div>
    `;

    row.querySelector('.btn-restar').addEventListener('click', () => cambiarCantidad(item.id, -1));
    row.querySelector('.btn-sumar').addEventListener('click', () => cambiarCantidad(item.id, 1));
    row.querySelector('.btn-eliminar').addEventListener('click', () => eliminarDelCarrito(item.id));

    carritoItemsDiv.appendChild(row);
  });

  if (carritoTotalEl) {
    carritoTotalEl.textContent = `$${total.toLocaleString('es-AR')}`;
  }
}

function abrirModalCarrito() {
  renderizarCarritoModal();
  if (modalCarrito) modalCarrito.classList.remove('hidden');
}

function cerrarModalCarrito() {
  if (modalCarrito) modalCarrito.classList.add('hidden');
}

if (btnAbrirCarrito) btnAbrirCarrito.addEventListener('click', abrirModalCarrito);
if (btnCerrarCarrito) btnCerrarCarrito.addEventListener('click', cerrarModalCarrito);

// 5. ENVIAR PEDIDO DEL CARRITO A WHATSAPP
if (btnCheckoutWhatsapp) {
  btnCheckoutWhatsapp.addEventListener('click', () => {
    if (carrito.length === 0) {
      alert("Agregá al menos un producto al carrito para continuar.");
      return;
    }

    let mensaje = "👋 Hola *CarShop Iluminación*, me interesa comprar los siguientes productos:\n\n";
    let total = 0;

    carrito.forEach((item, index) => {
      const subtotal = item.precio * item.cantidad;
      total += subtotal;
      mensaje += `${index + 1}. *${item.nombre}* x${item.cantidad} - $${subtotal.toLocaleString('es-AR')}\n`;
    });

    mensaje += `\n💰 *Total Estimado:* $${total.toLocaleString('es-AR')}\n\n`;
    mensaje += "¿Tienen disponibilidad y turno para coordinar?";

    const url = `https://wa.me/${TELEFONO_WHATSAPP}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  });
}

// 6. FORMULARIO DE PRESUPUESTO PERSONALIZADO POR WHATSAPP
if (formCotizador) {
  formCotizador.addEventListener('submit', (e) => {
    e.preventDefault();
    const marca = document.getElementById('cotiz-marca').value;
    const modelo = document.getElementById('cotiz-modelo').value;
    const servicio = document.getElementById('cotiz-servicio').value;
    const notas = document.getElementById('cotiz-notas').value;

    let mensaje = `👋 Hola *CarShop Iluminación*, quisiera cotizar un servicio:\n\n`;
    mensaje += `🚗 *Vehículo:* ${marca} ${modelo}\n`;
    mensaje += `🔧 *Servicio:* ${servicio}\n`;
    if (notas) mensaje += `📝 *Detalles:* ${notas}\n`;

    const url = `https://wa.me/${TELEFONO_WHATSAPP}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
  });
}