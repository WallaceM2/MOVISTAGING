const pool = require('../config/database');

async function registrar({ actorType, actorId, action, targetType, targetId, metadata = {} }) {
  await pool.query(`
    INSERT INTO movi_audit_logs (actor_type, actor_id, action, target_type, target_id, metadata)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [actorType, actorId || null, action, targetType || null, targetId || null, JSON.stringify(metadata)]);
}

module.exports = { registrar };
