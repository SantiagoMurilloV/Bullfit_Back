require('dotenv').config();
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// exports.sendNotification = (req, res) => {
//   client.messages
//     .create({
//         body: 'perra',
//         from: 'whatsapp:+14155238886', // Tu número de WhatsApp de Sandbox de Twilio
//         to: 'whatsapp:+573166275710'   // Número de destino
//     })
//     .then(message => {
//       console.log(message.sid);
//       res.send("Notificación enviada con éxito!");
//     })
//     .catch(error => {
//       console.error(error);
//       res.send("Error al enviar la notificación.");
//     });
// };

exports.sendNotification = (req, res) => {
  const toNumber = req.body.to; 
  client.messages
    .create({
        body: 'Tu mensaje aquí',
        from: 'whatsapp:+14155238886',
        to: `whatsapp:${toNumber}`
    })
    .then(message => {
      console.log(message.sid);
      res.send("Notificación enviada con éxito!");
    })
    .catch(error => {
      console.error(error);
      res.send("Error al enviar la notificación.");
    });
};

