const Price = require('../models/prices');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getPriceValue = async ({ item, type }) => {
  const normalizedItem = (item || '').trim();
  const normalizedType = (type || '').trim();

  if (!normalizedItem) {
    const error = new Error('El item del precio es obligatorio');
    error.code = 'PRICE_NOT_FOUND';
    throw error;
  }

  const filter = {
    item: { $regex: new RegExp(`^${escapeRegex(normalizedItem)}$`, 'i') },
  };

  if (normalizedType) {
    filter.type = { $regex: new RegExp(`^${escapeRegex(normalizedType)}$`, 'i') };
  }

  const priceDoc = await Price.findOne(filter);

  if (!priceDoc) {
    const error = new Error(`Precio no configurado para ${item}${type ? ` (${type})` : ''}`);
    error.code = 'PRICE_NOT_FOUND';
    throw error;
  }

  return priceDoc.price;
};

module.exports = {
  getPriceValue,
};
