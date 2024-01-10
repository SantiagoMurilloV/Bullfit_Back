const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: '../../.env' });

// Leer el archivo JSON
const financeData = JSON.parse(fs.readFileSync('./bullfit_db_dev.users.json', 'utf-8'));

const apiUrl = 'http://localhost:8084/api/finances'; 

const postData = async () => {
  try {
    for (const item of financeData) {
      const response = await axios.post(apiUrl, item);
      console.log('Datos publicados:', response.data);
    }
  } catch (error) {
    console.error('Error al publicar datos:', error);
  }
};

postData();
