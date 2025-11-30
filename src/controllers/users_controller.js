const { validationResult } = require('express-validator');
const User = require('../models/users');
const { getCacheJSON, setCacheJSON, deleteCacheKeys } = require('../lib/cacheUtils');

const USERS_CACHE_KEYS = {
  LIST: 'users:all',
};
const startProfiler = (label) => {
  const profilerLabel = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  console.time(profilerLabel);
  return profilerLabel;
};
const endProfiler = (label) => {
  if (label) {
    console.timeEnd(label);
  }
};
const USER_SUMMARY_FIELDS = 'Active Plan FirstName LastName Phone IdentificationNumber registrationDate nameEmergency LastNameEmergency PhoneEmergency';

const queueUserCacheInvalidation = (userId) => {
  const keys = [USERS_CACHE_KEYS.LIST];

  if (userId) {
    keys.push(`users:${userId}`);
  }

  deleteCacheKeys(...keys);
};

exports.login = (req, res) => {
  const { username, password } = req.body;


  if (username === 'usuario' && password === 'contrasena') {

    const token = 'token_de_autenticacion_generado'; 
    res.json({ token });
  } else {

    res.status(401).json({ error: 'Credenciales de inicio de sesión incorrectas' });
  }
};


exports.getAllUsers = async (req, res) => {
  const profiler = startProfiler('getAllUsers');
  try {
    const cacheKey = USERS_CACHE_KEYS.LIST;
    const cachedUsers = await getCacheJSON(cacheKey);
    if (cachedUsers !== null) {
      return res.json(cachedUsers);
    }

    const users = await User.find().select(USER_SUMMARY_FIELDS).lean();
    await setCacheJSON(cacheKey, users, 30);
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener la información de los usuarios' });
  } finally {
    endProfiler(profiler);
  }
};



exports.getUserById = async (req, res) => {
  const profiler = startProfiler('getUserById');
  const userId = req.params.userId;

  try {
    const cacheKey = `users:${userId}`;
    const cachedUser = await getCacheJSON(cacheKey);
    if (cachedUser !== null) {
      return res.status(200).json(cachedUser);
    }

    const user = await User.findById(userId).select(USER_SUMMARY_FIELDS).lean();

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    await setCacheJSON(cacheKey, user, 30);
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener la información del usuario' });
  } finally {
    endProfiler(profiler);
  }
};


exports.createUser = async (req, res) => {
  const profiler = startProfiler('createUser');
  const { 
    Active, Plan, FirstName, LastName, Phone, IdentificationNumber, registrationDate, 
    nameEmergency, LastNameEmergency, PhoneEmergency 
  } = req.body;


  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const newUser = new User({
    Active,
    Plan,
    FirstName,
    LastName,
    Phone,
    IdentificationNumber,
    registrationDate,
    registrationDate,
    nameEmergency,
    LastNameEmergency,
    PhoneEmergency
  });

  try {
    const user = await newUser.save();
    queueUserCacheInvalidation(user._id?.toString());
    res.status(201).json(user);
  } catch (error) {

    res.status(500).json({ error: 'Error al crear el usuario', details: error.message });
  } finally {
    endProfiler(profiler);
  }
};


exports.updateUserStatus = async (req, res) => {
  const profiler = startProfiler('updateUserStatus');
  const userId = req.params.userId;
  const { Active, Plan, FirstName, LastName, Phone, IdentificationNumber,registrationDatenameEmergency,
    LastNameEmergency,
    PhoneEmergency} = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { Active, Plan, FirstName, LastName, Phone, IdentificationNumber,registrationDatenameEmergency,
        LastNameEmergency,
        PhoneEmergency},
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    queueUserCacheInvalidation(user._id?.toString() || userId);
    res.status(200).json(user);
  } catch (error) {
    console.error('Error al actualizar el estado del usuario:', error);
    res.status(500).json({ error: 'Error al actualizar el estado del usuario' });
  } finally {
    endProfiler(profiler);
  }
};

exports.deleteUsers = async (req, res) => {
  const profiler = startProfiler('deleteUsers');
  const userId = req.params.userId; 

  try {
    const deletedUser = await User.findOneAndDelete({ _id: userId });

    if (!deletedUser) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    queueUserCacheInvalidation(userId);
    res.status(200).json({ message: 'Usuario eliminado con éxito', deletedUser });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  } finally {
    endProfiler(profiler);
  }
};
