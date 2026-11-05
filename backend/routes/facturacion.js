const express = require('express');
const router = express.Router();
const Afip = require('@afipsdk/afip.js');
const { dbAdmin } = require('../config/firebaseAdmin');

// Inicializar SDK de AFIP / ARCA
const afip = new Afip({
  CUIT: process.env.ARCA_CUIT,
  cert: './certs/cert.crt',
  key: './certs/key.key',
  production: process.env.ARCA_PRODUCTION === 'true'
});

/**
 * POST /api/facturacion/emitir
 * Body expect: { ventaId: "vta_123", cuitDniCliente: "20398887776", tipoDoc: 80, tipoFactura: 6, total: 35000 }
 * Tipos de Comprobante: 1 = Factura A, 6 = Factura B, 11 = Factura C
 * Tipos de Documento: 80 = CUIT, 96 = DNI, 99 = Consumidor Final sin identificar
 */
router.post('/emitir', async (req, res) => {
  try {
    const { ventaId, cuitDniCliente, tipoDoc, tipoFactura, total } = req.body;

    const puntoVenta = parseInt(process.env.ARCA_PUNTO_VENTA, 10);

    // 1. Obtener el número del último comprobante emitido en ARCA
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(puntoVenta, tipoFactura);
    const nextVoucher = lastVoucher + 1;

    const fechaHoy = new Date().toISOString().split('T')[0].replace(/-/g, '');

    // 2. Estructura de la solicitud para el Web Service WSFE de ARCA
    const dataFactura = {
      'CantReg': 1,
      'PtoVta': puntoVenta,
      'CbteTipo': tipoFactura,
      'Concepto': 1, // 1 = Productos, 2 = Servicios, 3 = Productos y Servicios
      'DocTipo': tipoDoc,
      'DocNro': parseFloat(cuitDniCliente) || 0,
      'CbteDesde': nextVoucher,
      'CbteHasta': nextVoucher,
      'CbteFch': fechaHoy,
      'ImpTotal': total,
      'ImpTotConc': 0,
      'ImpNeto': total, // Si es Factura C o Exento, el ImpNeto equivale al ImpTotal
      'ImpOpEx': 0,
      'ImpIVA': 0,
      'ImpTrib': 0,
      'MonId': 'PES',
      'MonCot': 1
    };

    // 3. Solicitud del CAE (Código de Autorización Electrónico)
    const resARCA = await afip.ElectronicBilling.createVoucher(dataFactura);

    const datosFactura = {
      cae: resARCA.CAE,
      vencimientoCae: resARCA.CAEFchVto,
      numeroComprobante: nextVoucher,
      puntoVenta: puntoVenta,
      tipoFactura: tipoFactura,
      fechaEmision: new Date().toISOString()
    };

    // 4. Actualizar la venta en Firestore indicando que ya fue facturada
    if (ventaId) {
      await dbAdmin.collection('ventas').doc(ventaId).update({
        facturadoARCA: true,
        datosFactura: datosFactura
      });
    }

    res.status(200).json({
      success: true,
      message: 'Factura emitida correctamente con ARCA',
      datosFactura
    });

  } catch (error) {
    console.error('Error al facturar con ARCA:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error en comunicación con ARCA'
    });
  }
});

module.exports = router;