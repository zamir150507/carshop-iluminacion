const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Importar Rutas
const facturacionRoutes = require('./routes/facturacion');
const cajaRoutes = require('./routes/caja');

app.use('/api/facturacion', facturacionRoutes);
app.use('/api/caja', cajaRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', Timestamp: new Date() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Backend CarShop escuchando en http://localhost:${PORT}`);
});