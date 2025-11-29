const Price = require('../models/prices');

exports.createPrice = async (req, res) => {
  const { item, price, type } = req.body;

  try {
    const newPrice = new Price({ item, price, type });
    const savedPrice = await newPrice.save();
    res.status(201).json(savedPrice);
  } catch (error) {
    res.status(500).json({ message: 'Error al crear el precio', error: error.message });
  }
};

exports.getAllPrices = async (req, res) => {
  try {
    const prices = await Price.find();
    res.json(prices);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los precios', error: error.message });
  }
};

exports.getPriceById = async (req, res) => {
  try {
    const price = await Price.findById(req.params.id);
    if (!price) {
      return res.status(404).json({ message: 'Precio no encontrado' });
    }
    res.json(price);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el precio', error: error.message });
  }
};

exports.updatePrice = async (req, res) => {
  const { item, price, type } = req.body;

  try {
    const updatedPrice = await Price.findByIdAndUpdate(
      req.params.id,
      { item, price, type },
      { new: true }
    );

    if (!updatedPrice) {
      return res.status(404).json({ message: 'Precio no encontrado' });
    }

    res.json(updatedPrice);
  } catch (error) {
    res.status(500).json({ message: 'Error al actualizar el precio', error: error.message });
  }
};

exports.deletePrice = async (req, res) => {
  try {
    const deletedPrice = await Price.findByIdAndDelete(req.params.id);
    if (!deletedPrice) {
      return res.status(404).json({ message: 'Precio no encontrado' });
    }
    res.status(200).json({ message: 'Precio eliminado con éxito', deletedPrice });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el precio', error: error.message });
  }
};
