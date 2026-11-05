const express = require('express');
const router = express.Router();
const { dbAdmin } = require('../config/firebaseAdmin');

/**
 * POST /api/caja/venta
 * Procesa la venta, descuenta el stock de los productos y registra el movimiento de caja.
 */
router.post('/venta', async (req, res) => {
  try {
    const { items, metodoPago, cliente, total } = req.body;

    // Transacción atómica en Firestore para descontar stock de forma segura
    await dbAdmin.runTransaction(async (transaction) => {
      // 1. Verificar stock suficiente de cada item
      for (const item of items) {
        if (item.tipo === 'producto') {
          const prodRef = dbAdmin.collection('productos_servicios').doc(item.id);
          const prodDoc = await transaction.get(prodRef);

          if (!prodDoc.exists) {
            throw new Error(`El producto ${item.nombre} ya no existe.`);
          }

          const currentStock = prodDoc.data().stock || 0;
          if (currentStock < item.cantidad) {
            throw new Error(`Stock insuficiente para ${item.nombre}. Disponible: ${currentStock}`);
          }

          // Descontar la cantidad vendida
          transaction.update(prodRef, {
            stock: currentStock - item.cantidad
          });
        }
      }

      // 2. Registrar la venta en la colección 'ventas'
      const nuevaVentaRef = dbAdmin.collection('ventas').doc();
      transaction.set(nuevaVentaRef, {
        fecha: new Date().toISOString(),
        items,
        total,
        metodoPago, // 'efectivo' o 'transferencia'
        cliente: cliente || { nombre: 'Consumidor Final', cuitDni: '' },
        facturadoARCA: false,
        datosFactura: null
      });
    });

    res.status(201).json({ success: true, message: 'Venta registrada y stock actualizado correctamente.' });

  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/caja/resumen-dia
 * Calcula los totales cobrados en Efectivo vs. Transferencia en la fecha indicada.
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
    let cantidadVentas = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      cantidadVentas++;
      if (data.metodoPago === 'efectivo') {
        totalEfectivo += data.total;
      } else if (data.metodoPago === 'transferencia') {
        totalTransferencia += data.total;
      }
    });

    res.status(200).json({
      fecha: fechaInicio.toISOString().split('T')[0],
      totalEfectivo,
      totalTransferencia,
      totalGeneral: totalEfectivo + totalTransferencia,
      cantidadVentas
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;