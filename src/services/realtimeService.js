const redisClient = require('../config/redis');
const { sendPush } = require('./pushService');

const CHANNEL = 'movi:realtime';
let io = null;
let subscriber = null;

function setIO(serverIO) {
  io = serverIO;
}

async function initRealtimeBus(createSubscriber) {
  subscriber = await createSubscriber();
  await subscriber.subscribe(CHANNEL, (message) => {
    try {
      const event = JSON.parse(message);
      if (!io || !event?.room || !event?.event) return;
      io.to(event.room).emit(event.event, event.payload);
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'realtime_message_error', message: error.message }));
    }
  });
}

async function emitToUser(tipo, id, event, payload) {
  const room = `user:${tipo}:${id}`;
  void sendPush(tipo, id, event, payload).catch((error) => {
    console.error(JSON.stringify({ level: 'warn', event: 'push_dispatch_failed', notification_event: event, message: error.message }));
  });
  try {
    if (redisClient.isReady) {
      await redisClient.publish(CHANNEL, JSON.stringify({ room, event, payload }));
      return;
    }
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', event: 'realtime_publish_failed', message: error.message }));
  }
  if (io) io.to(room).emit(event, payload);
}

async function closeRealtimeBus() {
  if (subscriber?.isOpen) await subscriber.quit();
  subscriber = null;
  io = null;
}

module.exports = { setIO, initRealtimeBus, emitToUser, closeRealtimeBus };
