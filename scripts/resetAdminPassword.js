const readline = require('node:readline/promises');
const bcrypt = require('bcrypt');
const pool = require('../src/config/database');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const newPassword = process.env.ADMIN_NEW_PASSWORD;
  if (!email || !newPassword) throw new Error('Defina ADMIN_EMAIL e ADMIN_NEW_PASSWORD como variáveis de ambiente.');
  if (newPassword.length < 12) throw new Error('A nova senha administrativa deve ter pelo menos 12 caracteres.');

  const hash = await bcrypt.hash(newPassword, 12);
  const result = await pool.query(`UPDATE admins SET senha_hash = $1 WHERE LOWER(email) = LOWER($2) RETURNING id, nome, email`, [hash, email]);
  if (!result.rows[0]) throw new Error('Administrador não encontrado.');
  console.log(`Senha atualizada para o administrador ${result.rows[0].email}.`);
  await pool.closeDatabase();
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.closeDatabase(); } catch (_) {}
  process.exit(1);
});
