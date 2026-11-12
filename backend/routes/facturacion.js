const express = require('express');
const router = express.Router();
const Afip = require('@afipsdk/afip.js');
const { dbAdmin } = require('../config/firebaseAdmin');

function crearClienteAfip() {
  const cuit = parseInt(process.env.ARCA_CUIT, 10);
  const accessToken = (process.env.ARCA_ACCESS_TOKEN || '').trim();

  if (!cuit) {
    throw new Error('Falta configurar la variable ARCA_CUIT en Render.');
  }

  if (!accessToken) {
    throw new Error('Falta configurar la variable ARCA_ACCESS_TOKEN en Render.');
  }

  // Lee el certificado y clave privada desde Render (o desde ./certs en local)
  const cert = process.env.ARCA_CERT
    ? process.env.ARCA_CERT.replace(/\\n/g, '\n')
    : './certs/cert.crt';

  const key = process.env.ARCA_KEY
    ? process.env.ARCA_KEY.replace(/\\n/g, '\n')
    : './certs/key.key';

  return new Afip({
    CUIT: cuit,
    cert: cert,
    key: key,
    access_token: accessToken,
    production: process.env.ARCA_PRODUCTION === 'true'
  });
}

/**
 * POST /api/facturacion/emitir
 * Body: { ventaId, cuitDniCliente, tipoDoc, tipoFactura, total, concepto }
 * Tipos de Comprobante: 11 = Factura C, 6 = Factura B, 1 = Factura A
 * Tipos de Documento: 80 = CUIT, 96 = DNI, 99 = Consumidor Final sin identificar
 */
router.post('/emitir', async (req, res) => {
  try {
    const afip = crearClienteAfip();

    const {
      ventaId,
      cuitDniCliente,
      tipoDoc = 99,
      tipoFactura = 11,
      total,
      concepto = 1
    } = req.body;

    const puntoVenta = parseInt(process.env.ARCA_PUNTO_VENTA, 10);
    if (!puntoVenta) {
      return res.status(400).json({
        success: false,
        error: 'Falta configurar la variable ARCA_PUNTO_VENTA en Render.'
      });
    }

    const cbteTipo = parseInt(tipoFactura, 10) || 11;
    const docTipoNum = parseInt(tipoDoc, 10) || 99;
    const conceptoNum = parseInt(concepto, 10) || 1;
    const importeTotal = Number(total);

    if (!importeTotal || importeTotal <= 0) {
      return res.status(400).json({
        success: false,
        error: 'El importe total a facturar debe ser mayor a 0.'
      });
    }

    // Si es Consumidor Final sin identificar (99), AFIP exige DocNro = 0
    const docNroLimpio = docTipoNum === 99
      ? 0
      : (Number(String(cuitDniCliente || '').replace(/\D/g, '')) || 0);

    // 1. Obtener el número del último comprobante emitido en ARCA
    const lastVoucher = await afip.ElectronicBilling.getLastVoucher(puntoVenta, cbteTipo);
    const nextVoucher = lastVoucher + 1;

    // Fecha actual en hora de Argentina (UTC-3) formato YYYYMMDD
    const ahoraArgentina = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const fechaHoy = ahoraArgentina.toISOString().split('T')[0].replace(/-/g, '');

    // 2. Estructura de la solicitud para el Web Service WSFE de ARCA
    const dataFactura = {
      'CantReg': 1,
      'PtoVta': puntoVenta,
      'CbteTipo': cbteTipo,
      'Concepto': conceptoNum, // 1 = Productos, 2 = Servicios, 3 = Productos y Servicios
      'DocTipo': docTipoNum,
      'DocNro': docNroLimpio,
      'CbteDesde': nextVoucher,
      'CbteHasta': nextVoucher,
      'CbteFch': fechaHoy,
      'ImpTotal': importeTotal,
      'ImpTotConc': 0,
      'ImpNeto': importeTotal,
      'ImpOpEx': 0,
      'ImpIVA': 0,
      'ImpTrib': 0,
      'MonId': 'PES',
      'MonCot': 1
    };

    // Si incluye servicios (Concepto 2 o 3), AFIP exige fechas de servicio y vencimiento
    if (conceptoNum === 2 || conceptoNum === 3) {
      dataFactura['FchServDesde'] = fechaHoy;
      dataFactura['FchServHasta'] = fechaHoy;
      dataFactura['FchVtoPago'] = fechaHoy;
    }

    // 3. Solicitud del CAE (Código de Autorización Electrónico)
    const resARCA = await afip.ElectronicBilling.createVoucher(dataFactura);

    const datosFactura = {
      cae: resARCA.CAE,
      vencimientoCae: resARCA.CAEFchVto,
      numeroComprobante: nextVoucher,
      puntoVenta: puntoVenta,
      tipoFactura: cbteTipo,
      docTipo: docTipoNum,
      docNro: docNroLimpio,
      fechaEmision: new Date().toISOString()
    };

    // 4. Actualizar la venta en Firestore solo si vino un ventaId desde backend
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