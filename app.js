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
const termsAndConditionsRoutes = require('./src/routes/api/termsAndConditions_routes');
const pqrs = require('./src/routes/api/pqrs_routes');

dotenv.config();

app.use(express.json());

const dbUrl = process.env.MONGODB_URL;
const PORT = process.env.PORT;
mongoose.connect(dbUrl, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', (error) => console.error(error));
db.once('open', () => console.log('Conexión a la base de datos exitosa'));


const allowedOrigins = ['https://bullfit-app-v2-0.vercel.app', 'http://localhost:3000']; 


const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200, 
};

app.use(cors(corsOptions)); 

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
