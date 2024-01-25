
const { validationResult } = require('express-validator');
const Reservation = require('../models/reservations');
const User = require('../models/users');
const Slot = require('../models/quotaLimits'); 
const Counter = require('../models/counter')

exports.getAllReservations = async (req, res) => {
  try {
    const reservations = await Reservation.aggregate([

      {
        $project: {
          _id: 0,
          reservation: '$reservations',
          userId: 1,
          day: 1,
          dayOfWeek:1,
          hour: 1,
          TrainingType: 1,
          Status: 1,
          Attendance: 1,
          _id: 1,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $project: {
          _id: 1,
          day: 1,
          dayOfWeek:1,
          hour: 1,
          TrainingType: 1,
          Status: 1,
          Attendance: 1,
          userId: 1,
          userName: '$user.FirstName',
          Active: '$user.Active',
          Plan: '$user.Plan',
          userLastName: '$user.LastName',
        },
      },
    ]);

    res.status(200).json(reservations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las reservas' });
  }
};

exports.getAllReservationsId = async (req, res) => {
  try {
    const reservations = await Reservation.aggregate([

      {
        $project: {
          _id: 0,
          reservation: '$reservations',
          userId: 1,
          day: 1,
          dayOfWeek:1,
          hour: 1,
          TrainingType: 1,
          Status: 1,
          Attendance: 1,
          _id: 1,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $project: {
          _id: 1,
          day: 1,
          dayOfWeek:1,
          hour: 1,
          TrainingType: 1,
          Status: 1,
          Attendance: 1,
          userId: 1,
          userName: '$user.FirstName',
          Active: '$user.Active',
          Plan: '$user.Plan',
          userLastName: '$user.LastName',
        },
      },
    ]);

    res.status(200).json(reservations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener las reservas' });
  }
};
exports.updateUserTrainingType = (req, res) => {
  const reservationId = req.params.reservationId;
  const { TrainingType, Status, Attendance, hour } = req.body;

  const updateFields = {};
  if (TrainingType) {
    updateFields.TrainingType = TrainingType;
  }
  if (Status) {
    updateFields.Status = Status;
  }
  if (Attendance) {
    updateFields.Attendance = Attendance;
  }
  if (hour) {
    updateFields.hour = hour;
  }
  Reservation.findByIdAndUpdate(reservationId, updateFields, { new: true })
    .then((updatedReservation) => {
      if (!updatedReservation) {
        return res.status(404).json({ error: 'Reserva no encontrada' });
      }
      res.status(200).json(updatedReservation);
    })
    .catch((err) => {
      res.status(500).json({ error: 'Error al actualizar la reserva' });
    });
};


exports.getUserReservations_ = (req, res) => {
  const userId = req.params.userId;

  Reservation.findById(userId)
    .then((reservations) => {
      if (!reservations) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      res.status(200).json(reservations);
    })
    .catch((error) => {
      res.status(500).json({ error: 'Error al obtener la información del usuario' });
    });
};






exports.createReservation = async (req, res) => {
  try {
    const { userId, day, dayOfWeek, hour } = req.body;

    const newReservation = new Reservation({
      userId,
      day,
      dayOfWeek,
      hour,
      Attendance: 'Si'
    });
    const savedReservation = await newReservation.save();

    // Encuentra o crea un contador para el usuario y la fecha formateada
    const counter = await Counter.findOne({ userId, date: day });

    if (counter) {
      // Si el contador existe, incrementa el conteo
      counter.count += 1;
      await counter.save();
    } else {
      // Si no existe, crea uno nuevo
      const newCounter = new Counter({
        userId,
        reservationId: savedReservation._id,
        date: savedReservation.day,
        count: 1
      });
      await newCounter.save();
    }


    res.status(201).json(savedReservation);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al guardar la reserva' });
  }
};

exports.getMonthlyCounts = async (req, res) => {
  const currentYear = new Date().getFullYear().toString();

  try {
    const pipeline = [
      {
        $match: {
          date: { $regex: `^${currentYear}-` }
        }
      },
      {
        $addFields: {
          month: { $substr: ['$date', 5, 2] } 
        }
      },
      {
        $group: {
          _id: { userId: "$userId", month: "$month" },
          count: { $sum: "$count" }
        }
      },
      {
        $group: {
          _id: "$_id.userId",
          monthlyCounts: { $push: { k: "$_id.month", v: "$count" } }
        }
      },
      {
        $project: {
          userId: "$_id",
          monthlyCounts: { $arrayToObject: "$monthlyCounts" }
        }
      },
      {
        $addFields: {
          counts: {
            $mergeObjects: [
              { "01": 0, "02": 0, "03": 0, "04": 0, "05": 0, "06": 0, "07": 0, "08": 0, "09": 0, "10": 0, "11": 0, "12": 0 },
              "$monthlyCounts"
            ]
          }
        }
      },
      {
        $project: {
          _id: 0,
          userId: 1,
          counts: 1
        }
      }
    ];

    const results = await Counter.aggregate(pipeline);
    res.status(200).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los conteos mensuales' });
  }
};



exports.testCounterData = async (req, res) => {
  try {
    const results = await Counter.aggregate([
      { $limit: 10 } 
    ]);

    res.status(200).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener los datos de prueba' });
  }
};

exports.testCounterDataByYear = async (req, res) => {
  const currentYear = new Date().getFullYear().toString();

  try {
    const results = await Counter.aggregate([
      {
        $match: {
          date: { $regex: `^${currentYear}-` } 
        }
      }
    ]);

    res.status(200).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al filtrar los datos por año' });
  }
};


























exports.getUserReservations = (req, res) => {
  const userId = req.params.userId;

  Reservation.find({ userId })
    .then((reservations) => {
      if (!reservations) {
        return res.status(404).json({ error: 'Reservas no encontradas' });
      }
      res.status(200).json(reservations);
    })
    .catch((error) => {
      res.status(500).json({ error: 'Error al obtener las reservas del usuario' });
    });
};

exports.deleteReservation = (req, res) => {
  const reservationId = req.params.reservationId;

  Promise.all([
    Reservation.findOneAndDelete({ _id: reservationId }),
    Counter.findOneAndDelete({ reservationId: reservationId })
  ])
  .then(([deletedReservation, deletedCounter]) => {
    if (!deletedReservation && !deletedCounter) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    let response = { message: 'Proceso de eliminación completado' };
    if (deletedReservation) {
      response.deletedReservation = deletedReservation;
    }
    if (deletedCounter) {
      response.deletedCounter = deletedCounter;
    }

    res.status(200).json(response);
  })
  .catch((error) => {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar la reserva' });
  });
};





