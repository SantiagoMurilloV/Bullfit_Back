const mongoose = require('mongoose');

const invitadosSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  fecha: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Invitado', invitadosSchema, 'Invitados');
