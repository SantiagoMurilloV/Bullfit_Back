const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: '../../.env' });

const financeData = JSON.parse(fs.readFileSync('./bullfit_db_dev.users--.json', 'utf-8'));
const anotherData = JSON.parse(fs.readFileSync('./bullfit_db_dev.users.json', 'utf-8'));

const financeApiUrl = 'http://localhost:8084/api/finances';
// const anotherApiUrl = 'http://localhost:8084/api/users';

const postFinanceData = async () => {
  try {
    for (const item of financeData) {
      const response = await axios.post(financeApiUrl, item);
      console.log('Finance Data posted:', response.data);
    }
  } catch (error) {
    console.error('Error posting finance data:', error);
  }
};

// const postAnotherData = async () => {
//   try {
//     for (const item of anotherData) {
//       const response = await axios.post(anotherApiUrl, item);
//       console.log('Another Data posted:', response.data);
//     }
//   } catch (error) {
//     console.error('Error posting another data:', error);
//   }
// };

postFinanceData();

// postAnotherData();

