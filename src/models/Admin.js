const pool = require('../config/database');

async function buscarPorEmail(email) {
    const query = `SELECT * FROM admins WHERE LOWER(email) = LOWER($1) LIMIT 1;`;
    const resultado = await pool.query(query, [email]);
    return resultado.rows[0];
}

module.exports = { buscarPorEmail };