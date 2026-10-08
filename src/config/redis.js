const redis = require('redis');
const env = require('./env');

const redisClient = redis.createClient({
  url: env.REDIS_URL,
  socket: {
    tls: env.REDIS_URL.startsWith('rediss://'),
    reconnectStrategy: (retries) => Math.min(retries * 200, 3000),
  },
});

redisClient.on('error', (error) => {
  console.error(JSON.stringify({
    level: 'error',
    event: 'redis_error',
    message: error.message,
  }));
});

async function connectRedis() {
  if (!redisClient.isOpen) await redisClient.connect();
  await redisClient.ping();
  return redisClient;
}

async function closeRedis() {
  if (redisClient.isOpen) await redisClient.quit();
}

async function createSubscriber() {
  const subscriber = redisClient.duplicate();
  subscriber.on('error', (error) => {
    console.error(JSON.stringify({ level: 'error', event: 'redis_subscriber_error', message: error.message }));
  });
  await subscriber.connect();
  return subscriber;
}

module.exports = redisClient;
module.exports.connectRedis = connectRedis;
module.exports.closeRedis = closeRedis;
module.exports.createSubscriber = createSubscriber;
