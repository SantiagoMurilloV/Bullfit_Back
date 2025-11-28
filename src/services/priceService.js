const Price = require('../models/prices');

const getPriceValue = async ({ item, type }) => {
  if (!item) {
    const error = new Error('El item del precio es obligatorio');
    error.code = 'PRICE_NOT_FOUND';
    throw error;
  }

  const filter = { item };
  if (type) {
    filter.type = type;
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
