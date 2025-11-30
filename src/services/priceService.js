const Price = require('../models/prices');
const redis = require('../lib/redisClient');

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

  const cacheKey = `price:${normalizedItem}${normalizedType ? `:${normalizedType}` : ''}`;

  const cachedPrice = await redis.get(cacheKey);
  if (cachedPrice) {
    try {
      return JSON.parse(cachedPrice);
    } catch (error) {
      console.error(`No se pudo parsear la caché (${cacheKey}):`, error.message);
    }
  }

  const priceDoc = await Price.findOne(filter);

  if (!priceDoc) {
    const error = new Error(`Precio no configurado para ${item}${type ? ` (${type})` : ''}`);
    error.code = 'PRICE_NOT_FOUND';
    throw error;
  }

  try {
    await redis.set(cacheKey, JSON.stringify(priceDoc.price), 'EX', 3600);
  } catch (error) {
    console.error(`Error almacenando la caché (${cacheKey}):`, error.message);
  }

  return priceDoc.price;
};

module.exports = {
  getPriceValue,
};
