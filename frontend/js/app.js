import { db } from './firebase.js';
import { 
  collection, 
  onSnapshot,
  query,
  where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const gridContainer = document.getElementById('catalogo-grid');
const formCotizador = document.getElementById('form-cotizador');

function iniciarCatalogo() {
  cargarProductos();
  initCotizador();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciarCatalogo);
} else {
  iniciarCatalogo();
}

// Cargar catálogo de productos activos en tiempo real
function cargarProductos() {
  const q = query(collection(db, "productos_servicios"), where("activo", "==", true));

  onSnapshot(q, (snapshot) => {
    if (!gridContainer) return;
    gridContainer.innerHTML = '';

    snapshot.forEach((doc) => {
      const item = doc.data();
      const card = document.createElement('div');
      card.className = 'card-item';

      const stockBadge = item.tipo === 'producto' 
        ? `<span class="badge ${item.stock > 0 ? 'in-stock' : 'no-stock'}">${item.stock > 0 ? `Stock: ${item.stock}` : 'Sin Stock'}</span>`
        : `<span class="badge servicio">Servicio</span>`;

      const imgHtml = item.imagenUrl 
        ? `<img src="${item.imagenUrl}" alt="${item.nombre}" class="card-img">`
        : `<div class="no-img">Sin Imagen</div>`;

      card.innerHTML = `
        ${imgHtml}
        <div class="card-body">
          <div class="card-header">
            <h3>${item.nombre}</h3>
            ${stockBadge}
          </div>
          <p class="categoria">${item.categoria}</p>
          <p class="precio">$${item.precioVenta.toLocaleString('es-AR')}</p>
        </div>
      `;
      gridContainer.appendChild(card);
    });
  });
}

// Enviar presupuesto a WhatsApp
function initCotizador() {
  if (!formCotizador) return;

  formCotizador.addEventListener('submit', (e) => {
    e.preventDefault();
    const marca = document.getElementById('cotiz-marca').value.trim();
    const modelo = document.getElementById('cotiz-modelo').value.trim();
    const servicio = document.getElementById('cotiz-servicio').value;
    const notas = document.getElementById('cotiz-notas').value.trim();

    const telefonoTaller = "5492970000000"; // Reemplazar con el WhatsApp de CarShop
    const mensaje = `Hola CarShop Iluminación! Quisiera pedir un presupuesto:%0A%0A` +
      `🚗 *Vehículo:* ${marca} ${modelo}%0A` +
      `💡 *Servicio:* ${servicio}%0A` +
      `📝 *Notas:* ${notas || 'Ninguna'}`;

    window.open(`https://wa.me/${telefonoTaller}?text=${mensaje}`, '_blank');
  });
}