const { validationResult } = require('express-validator');
const User = require('../models/users');

exports.login = (req, res) => {
  const { username, password } = req.body;


  if (username === 'usuario' && password === 'contrasena') {

    const token = 'token_de_autenticacion_generado'; 
    res.json({ token });
  } else {

    res.status(401).json({ error: 'Credenciales de inicio de sesión incorrectas' });
  }
};


exports.getAllUsers = (req, res) => {
  User.find()
    .then((users) => {
      res.json(users);
    })
    .catch((error) => {
      res.status(500).json({ error: 'Error al obtener la información de los usuarios' });
    });
};



exports.getUserById = (req, res) => {
  const userId = req.params.userId;

  User.findById(userId)
    .then((user) => {
      if (!user) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
      res.status(200).json(user);
    })
    .catch((error) => {
      res.status(500).json({ error: 'Error al obtener la información del usuario' });
    });
};


exports.createUser = (req, res) => {
  const {Active,Plan,FirstName, LastName, Phone, IdentificationNumber } = req.body;
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
  });

  newUser.save()
    .then((user) => {
      res.status(201).json(user);
    })
    .catch((error) => {
      res.status(500).json({ error: 'Error al crear el usuario' });
    });
};

exports.updateUserStatus = async (req, res) => {
  const userId = req.params.userId;
  const { Active } = req.body;

  // Puedes validar el campo Active aquí si es necesario

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      { Active },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error('Error al actualizar el estado del usuario:', error);
    res.status(500).json({ error: 'Error al actualizar el estado del usuario' });
  }
};
