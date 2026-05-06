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

// NOTE: a previous `exports.login` lived here with hardcoded literal
// credentials ('usuario'/'contrasena') and a static fake token. It was never
// exposed in users_routes.js and is removed in this commit. Real auth lands
// in the upcoming /api/auth/login endpoint (JWT-based) implemented as part
// of the security-p0 hardening sprint.

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
  // Bug fix: the previous version had `registrationDatenameEmergency` (a single
  // missing comma between `registrationDate` and `nameEmergency`). That string
  // is not a real field on the user schema, so updates silently lost both the
  // registrationDate AND nameEmergency values, while writing a stray property
  // that mongoose then ignored. Splitting back into two real fields restores
  // the original intent and makes those columns updatable again.
  const {
    Active, Plan, FirstName, LastName, Phone, IdentificationNumber,
    registrationDate, nameEmergency,
    LastNameEmergency,
    PhoneEmergency,
  } = req.body;

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      {
        Active, Plan, FirstName, LastName, Phone, IdentificationNumber,
        registrationDate, nameEmergency,
        LastNameEmergency,
        PhoneEmergency,
      },
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
