const express = require('express');
const app = express();
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const usersRoutes = require('./src/routes/api/users_routes');
const reservationsRoutes = require('./src/routes/api/reservations_routes');
const financeRoutes = require('./src/routes/api/finances_routes');
const storeRoutes = require('./src/routes/api/store_routes');
const pricesRoutes = require('./src/routes/api/prices_routes');
const invitadosRoutes = require('./src/routes/api/invitados_routes');
// const notification = require('./helpers/twilio_route');
const slot = require('./src/routes/api/quotaLimits_routes');
const cors = require('cors');
const compression = require('compression');
const termsAndConditionsRoutes = require('./src/routes/api/termsAndConditions_routes');
const pqrs = require('./src/routes/api/pqrs_routes');

dotenv.config();

app.use(express.json());
app.use(compression());

const dbUrl = process.env.MONGODB_URL;
const PORT = process.env.PORT || 8084;

// Mongoose connection with explicit pool/timeout options (deprecated
// useNewUrlParser/useUnifiedTopology removed - they are no-ops in Mongoose 6+).
mongoose.connect(dbUrl, {
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

const db = mongoose.connection;
db.on('error', (error) => console.error('MongoDB error:', error));
db.on('disconnected', () => console.warn('MongoDB disconnected'));
db.on('reconnected', () => console.log('MongoDB reconnected'));
db.once('open', () => console.log('Conexión a la base de datos exitosa'));


app.use(cors({
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : '*',
  credentials: true,
}));

// ---- Health check (no auth, no DB write) -----------------------------------
// Used by DigitalOcean App Platform to verify the instance is alive and the
// DB connection is up. Keep this BEFORE the /api routes so it always responds
// even if a route module fails to load.
app.get('/health', (req, res) => {
  // mongoose.connection.readyState: 0 disconnected, 1 connected,
  // 2 connecting, 3 disconnecting.
  const dbState = mongoose.connection.readyState;
  const dbStateLabel = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
  const healthy = dbState === 1;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: { state: dbStateLabel, ready: healthy },
    env: process.env.NODE_ENV || 'development',
  });
});

// Rutas de la API
app.use('/api', usersRoutes);
app.use('/api', reservationsRoutes);
app.use('/api', financeRoutes);
app.use('/api', storeRoutes);
app.use('/api', pricesRoutes);
app.use('/api', termsAndConditionsRoutes);
// app.use('/api', notification);
app.use('/api', slot);
app.use('/api', pqrs);
app.use('/api', invitadosRoutes);

// Iniciar el servidor
app.listen(PORT, () => {
  console.log('Servidor Express en ejecución en el puerto ' + PORT);
});
