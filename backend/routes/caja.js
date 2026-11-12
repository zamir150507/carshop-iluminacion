const express = require('express');
const router = express.Router();
const { dbAdmin } = require('../config/firebaseAdmin');

/**
 * POST /api/caja/venta
 * Procesa la venta multi-ítem, descuenta el stock de los productos y registra la venta.
 */
router.post('/venta', async (req, res) => {
  try {
    const { items, metodoPago, cliente, total } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'La venta debe tener al menos un ítem.' });
    }

    // Agrupar cantidades por producto por si se agregó el mismo ítem dos veces al ticket
    const cantidadesPorProducto = {};
    for (const item of items) {
      if (item.tipo === 'producto' && item.id) {
        if (!cantidadesPorProducto[item.id]) {
          cantidadesPorProducto[item.id] = {
            nombre: item.nombre,
            cantidadTotal: 0
          };
        }
        cantidadesPorProducto[item.id].cantidadTotal += Number(item.cantidad) || 0;
      }
    }

    let ventaIdCreada = null;

    // Transacción atómica en Firestore
    await dbAdmin.runTransaction(async (transaction) => {
      const idsProductos = Object.keys(cantidadesPorProducto);
      const lecturas = [];

      // 1. Leer primero todos los productos involucrados
      for (const prodId of idsProductos) {
        const prodRef = dbAdmin.collection('productos_servicios').doc(prodId);
        const prodDoc = await transaction.get(prodRef);
        lecturas.push({ prodId, prodRef, prodDoc });
      }

      // 2. Verificar stock y descontar
      for (const { prodId, prodRef, prodDoc } of lecturas) {
        const info = cantidadesPorProducto[prodId];

        if (!prodDoc.exists) {
          throw new Error(`El producto "${info.nombre}" ya no existe en el inventario.`);
        }

        const currentStock = Number(prodDoc.data().stock || 0);
        if (currentStock < info.cantidadTotal) {
          throw new Error(`Stock insuficiente para "${info.nombre}". Disponible: ${currentStock}`);
        }

        transaction.update(prodRef, {
          stock: currentStock - info.cantidadTotal
        });
      }

      // 3. Registrar la venta en la colección 'ventas'
      const nuevaVentaRef = dbAdmin.collection('ventas').doc();
      ventaIdCreada = nuevaVentaRef.id;

      transaction.set(nuevaVentaRef, {
        fecha: new Date().toISOString(),
        items,
        total: Number(total),
        metodoPago: metodoPago || 'Efectivo',
        cliente: cliente || { nombre: 'Consumidor Final', tipoDoc: 99, cuitDni: '' },
        facturadoARCA: false,
        datosFactura: null
      });
    });

    res.status(201).json({
      success: true,
      ventaId: ventaIdCreada,
      message: 'Venta registrada y stock actualizado correctamente.'
    });

  } catch (err) {
    console.error('Error en POST /api/caja/venta:', err);
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/caja/resumen-dia
 * Calcula los totales cobrados en el día.
 */
router.get('/resumen-dia', async (req, res) => {
  try {
    const fechaInicio = new Date();
    fechaInicio.setHours(0, 0, 0, 0);

    const snapshot = await dbAdmin.collection('ventas')
      .where('fecha', '>=', fechaInicio.toISOString())
      .get();

    let totalEfectivo = 0;
    let totalTransferencia = 0;
    let totalGeneral = 0;
    let cantidadVentas = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      const monto = Number(data.total || 0);
      cantidadVentas++;
      totalGeneral += monto;

      const metodo = (data.metodoPago || '').toLowerCase();
      if (metodo === 'efectivo') {
        totalEfectivo += monto;
      } else if (metodo === 'transferencia') {
        totalTransferencia += monto;
      }
    });

    res.status(200).json({
      fecha: fechaInicio.toISOString().split('T')[0],
      totalEfectivo,
      totalTransferencia,
      totalGeneral,
      cantidadVentas
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;