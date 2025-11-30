const Redis = require('ioredis');
const dotenv = require('dotenv');

dotenv.config();

let redisInstance = null;
let permanentlyDisabled = false;

const isRedisEnabled = () => process.env.REDIS_ENABLED === 'true';

const createRedisClient = () => {
  const baseOptions = {
    enableReadyCheck: false,
    lazyConnect: true,
    maxRetriesPerRequest: 2,
  };

  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, baseOptions);
  }

  return new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    ...baseOptions,
  });
};

const ensureClient = async () => {
  if (!isRedisEnabled() || permanentlyDisabled) {
    return null;
  }

  if (!redisInstance) {
    try {
      redisInstance = createRedisClient();
      redisInstance.on('error', (err) => {
        console.error('Redis error:', err.message);
      });
    } catch (error) {
      console.error('No se pudo inicializar Redis:', error.message);
      permanentlyDisabled = true;
      return null;
    }
  }

  if (redisInstance.status === 'wait' || redisInstance.status === 'end') {
    try {
      await redisInstance.connect();
    } catch (error) {
      console.error('No se pudo conectar a Redis:', error.message);
      permanentlyDisabled = true;
      return null;
    }
  }

  return redisInstance;
};

const executeCommand = async (command) => {
  try {
    return await command();
  } catch (error) {
    console.error('Error al ejecutar comando en Redis:', error.message);
    return null;
  }
};

const redis = {
  async get(key) {
    const client = await ensureClient();
    if (!client) {
      return null;
    }
    return executeCommand(() => client.get(key));
  },

  async set(key, value, mode, duration) {
    const client = await ensureClient();
    if (!client) {
      return null;
    }
    const args = [key, value];
    if (typeof mode === 'string' && typeof duration !== 'undefined') {
      args.push(mode, duration);
    }
    return executeCommand(() => client.set(...args));
  },

  async del(...keys) {
    const filtered = keys.filter(Boolean);
    if (!filtered.length) {
      return null;
    }
    const client = await ensureClient();
    if (!client) {
      return null;
    }
    return executeCommand(() => client.del(...filtered));
  },
};

module.exports = redis;
