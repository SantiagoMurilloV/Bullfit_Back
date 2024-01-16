require('dotenv').config();
const express = require('express');
const twilio = require('twilio');

const app = express();
const port = 3000;

// Configura tus credenciales de Twilio
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

app.get('/send-notification', (req, res) => {
  client.messages
    .create({
        body: 'Your appointment is coming up on July 21 at 3PM',
        from: 'whatsapp:+14155238886', // Tu número de WhatsApp de Sandbox de Twilio
        to: 'whatsapp:+573166275710'   // Número de destino
    })
    .then(message => {
      console.log(message.sid);
      res.send("Notificación enviada con éxito!");
    })
    .catch(error => {
      console.error(error);
      res.send("Error al enviar la notificación.");
    });
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
