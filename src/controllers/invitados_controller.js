const Invitado = require('../models/invitados');
const moment = require('moment-timezone');

exports.createInvitado = async (req, res) => {
  const { userId, name, fecha } = req.body;

  if (!userId || !name) {
    return res.status(400).json({ message: 'userId y name son requeridos' });
  }

  const fechaValue = fecha
    ? new Date(fecha)
    : moment.tz(new Date(), 'America/Bogota').toDate();

  try {
    const nuevoInvitado = await Invitado.create({
      userId,
      name,
      fecha: fechaValue,
    });
    res.status(201).json(nuevoInvitado);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear el invitado', error: error.message });
  }
};

exports.getAllInvitados = async (req, res) => {
  try {
    const invitados = await Invitado.find();
    res.status(200).json(invitados);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los invitados', error: error.message });
  }
};

exports.getInvitadoById = async (req, res) => {
  const { invitadoId } = req.params;
  try {
    const invitado = await Invitado.findById(invitadoId);
    if (!invitado) {
      return res.status(404).json({ message: 'Invitado no encontrado' });
    }
    res.status(200).json(invitado);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el invitado', error: error.message });
  }
};

exports.getInvitadosByUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const invitados = await Invitado.find({ userId });
    res.status(200).json(invitados);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los invitados del usuario', error: error.message });
  }
};

exports.deleteInvitado = async (req, res) => {
  const { invitadoId } = req.params;
  try {
    const deletedInvitado = await Invitado.findByIdAndDelete(invitadoId);
    if (!deletedInvitado) {
      return res.status(404).json({ message: 'Invitado no encontrado' });
    }
    res.status(200).json({ message: 'Invitado eliminado con éxito', invitado: deletedInvitado });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el invitado', error: error.message });
  }
};
