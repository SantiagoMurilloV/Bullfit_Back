const pqrs = require('../models/pqrs'); 
const moment = require('moment-timezone');
const mongoose = require('mongoose');

exports.createPqr = async (req, res) => {
  const { userId, Type, Pqr } = req.body;

  const bogotaTime = moment.tz(new Date(), 'America/Bogota');
  const formattedDate = bogotaTime.format('YYYY-MM-DD');
  const purchaseTime = bogotaTime.format('hh:mm:ss A');


  try {
    const newPqr = new pqrs({
      userId,
      Date: formattedDate,
      Hour: purchaseTime,
      Type: Type,
      Pqr: Pqr
    });

    await newPqr.save();
    res.status(201).send({ message: 'Solicitud PQR creada correctamente', data: newPqr });
  } catch (error) {
    res.status(500).send({ message: 'Error al crear la solicitud PQR', error: error.message });
  }
};


exports.getPqrs = async (req, res) => {
  try {
    const pqrsList = await pqrs.aggregate([
      {
        $lookup: {
          from: 'users',  
          localField: 'userId',
          foreignField: '_id',
          as: 'userData'
        }
      },
      {
        $unwind: '$userData'
      },
      {
        $project: {
          _id: 1,
          Date: 1,
          Hour: 1,
          'FirstName': '$userData.FirstName',  
          'LastName':'$userData.LastName',
          Type: 1,
          Pqr: 1
        }
      }
    ]);

    res.status(200).json(pqrsList);
  } catch (error) {
    res.status(500).send({ message: "Error al obtener las PQRS", error: error.message });
  }
};

exports.deletePqr = async (req, res) => {
  try {
      const { pqrId } = req.params; 
      const result = await pqrs.findByIdAndDelete(pqrId);

      if (!result) {
          return res.status(404).send({ message: "No se encontró la solicitud PQR con el ID proporcionado." });
      }

      res.send({ message: "Solicitud PQR eliminada correctamente." });
  } catch (error) {
      res.status(500).send({ message: "Error al eliminar la solicitud PQR", error: error.message });
  }
};