
const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({

  day: {
    type: String,
    required: true,
    index: true
  },
  hour: {
    type: String,
    required: true,
    index: true
  },
  slots: {
    type: Number,
    required: true
  }
});

slotSchema.index({ day: 1, hour: 1 }, { unique: true });

module.exports = mongoose.model('Slot', slotSchema);
