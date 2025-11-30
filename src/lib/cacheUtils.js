const redis = require('./redisClient');

const getCacheJSON = async (key) => {
  if (!key) {
    return null;
  }

  try {
    const cached = await redis.get(key);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error(`Error leyendo la caché (${key}):`, error.message);
    return null;
  }
};

const setCacheJSON = async (key, data, ttlSeconds) => {
  if (!key) {
    return;
  }

  try {
    const payload = JSON.stringify(data);
    if (typeof ttlSeconds === 'number' && ttlSeconds > 0) {
      await redis.set(key, payload, 'EX', ttlSeconds);
    } else {
      await redis.set(key, payload);
    }
  } catch (error) {
    console.error(`Error escribiendo la caché (${key}):`, error.message);
  }
};

const deleteCacheKeys = (...keys) => {
  const filtered = keys.filter(Boolean);
  if (!filtered.length) {
    return;
  }
  redis.del(...filtered);
};

module.exports = {
  getCacheJSON,
  setCacheJSON,
  deleteCacheKeys,
};
