const express = require('express');
const app = express();
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const usersRoutes = require('./src/routes/api/users_routes');
const reservationsRoutes = require('./src/routes/api/reservations_routes');
const cors = require('cors');
const helmet = require('helmet');

dotenv.config();

app.use(express.json());
app.use(cors());
app.use(helmet());

const dbUrl = process.env.MONGODB_URL;
mongoose.connect(dbUrl, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const db = mongoose.connection;
db.on('error', (error) => console.error(error));
db.once('open', () => console.log('Conexión a la base de datos exitosa'));

app.use('/api', usersRoutes);
app.use('/api', reservationsRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Algo salió mal!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor Express en ejecución en el puerto ${PORT}`);
});
