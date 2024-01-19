
const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  
  day: {
    type: String,
    required: true
  },
  hour: {
    type: String,
    required: true
  },
  slots: {
    type: Number,
    required: true
  }
});

module.exports = mongoose.model('Slot', slotSchema);
