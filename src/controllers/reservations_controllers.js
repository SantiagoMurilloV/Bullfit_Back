  
  const { validationResult } = require('express-validator');
  const Reservation = require('../models/reservations');
  const User = require('../models/users');

  
  exports.getAllReservations = async (req, res) => {
    try {
      const reservations = await Reservation.aggregate([

        {
          $project: {
            _id: 0, 
            reservation: '$reservations',
            userId: 1,
            day:1,
            hour:1,
            TrainingType:1,
            Status:1,
            Attendance:1,
            _id:1,
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
            _id:1,
            day:1,
            hour:1,
            TrainingType:1,
            Status:1,
            Attendance:1,
            userId: 1,
            userName: '$user.FirstName',
            Active:'$user.Active',
            Plan:'$user.Plan',
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
            day:1,
            hour:1,
            TrainingType:1,
            Status:1,
            Attendance:1,
            _id:1,
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
            _id:1,
            day:1,
            hour:1,
            TrainingType:1,
            Status:1,
            Attendance:1,
            userId: 1,
            userName: '$user.FirstName',
            Active:'$user.Active',
            Plan:'$user.Plan',
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
        console.log('res',reservations)
        res.status(200).json(reservations);
      })
      .catch((error) => {
        res.status(500).json({ error: 'Error al obtener la información del usuario' });
      });
  };


  exports.createReservation = async (req, res) => {
    try {
      const { userId, day, hour } = req.body;
      const newReservation = new Reservation({
        userId,
        day,
        hour
      });
      const savedReservation = await newReservation.save();
      res.status(201).json(savedReservation);
    } catch (error) {

      console.error(error);
      res.status(500).json({ error: 'Error al guardar la reserva' });
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



