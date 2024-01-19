const mongoose = require('mongoose');

const reservationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  day: { type: String, required: true },
  dayOfWeek :{ type: String, required: true },
  hour:{ type: String, required: true },
  TrainingType:String,
  Status:String,
  Attendance:String

});

module.exports = mongoose.model('Reservation', reservationSchema);



