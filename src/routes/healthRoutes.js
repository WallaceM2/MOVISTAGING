const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const redisClient = require('../config/redis');
const asyncHandler = require('../middlewares/asyncHandler');

router.get('/live', (req, res) => res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() }));

router.get('/ready', asyncHandler(async (req, res) => {
  const health = { status: 'OK', timestamp: new Date().toISOString(), servicos: { banco_de_dados: 'DOWN', redis: 'DOWN' } };
  try {
    await pool.query('SELECT 1');
    health.servicos.banco_de_dados = 'UP';
    if (!redisClient.isReady) throw new Error('Redis indisponível');
    await redisClient.ping();
    health.servicos.redis = 'UP';
    return res.status(200).json(health);
  } catch (error) {
    health.status = 'NOT_READY';
    return res.status(503).json(health);
  }
}));

router.get('/', asyncHandler(async (req, res) => {
  res.redirect('/health/ready');
}));

module.exports = router;
