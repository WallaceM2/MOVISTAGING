const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const bcrypt = require('bcrypt');
const pool = require('../src/config/database');

function readSecret(prompt) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      reject(new Error('Execute este comando em um terminal interativo para ocultar a senha.'));
      return;
    }

    let secret = '';
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();

    const finish = (error = null) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(secret);
    };

    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') return finish(new Error('Operação cancelada.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u0008' || character === '\u007f') {
          if (secret.length) {
            secret = secret.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        if (character >= ' ') {
          secret += character;
          stdout.write('*');
        }
      }
    };

    stdin.on('data', onData);
  });
}

async function main() {
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  let nome;
  let email;
  try {
    nome = (await prompt.question('Nome para a conta administrativa: ')).trim();
    email = (await prompt.question('Seu e-mail: ')).trim().toLowerCase();
  } finally {
    prompt.close();
  }

  if (nome.length < 2 || nome.length > 120) throw new Error('Informe um nome entre 2 e 120 caracteres.');
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');

  const existing = await pool.query('SELECT id FROM admins WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
  if (existing.rowCount) throw new Error('Já existe uma conta administrativa com esse e-mail. Nenhuma senha foi alterada.');

  const senha = await readSecret('Crie uma senha (mínimo 12 caracteres; entrada oculta): ');
  const confirmacao = await readSecret('Digite a senha novamente: ');
  if (senha.length < 12 || Buffer.byteLength(senha, 'utf8') > 72) {
    throw new Error('Use uma senha com ao menos 12 caracteres e até 72 bytes.');
  }
  if (senha !== confirmacao) throw new Error('As senhas não coincidem. Nenhuma conta foi criada.');

  const hash = await bcrypt.hash(senha, 12);
  const result = await pool.query(`
    INSERT INTO admins (nome, email, senha_hash, status)
    VALUES ($1, $2, $3, 'ativo')
    RETURNING id, nome, email, status, criado_em;
  `, [nome, email, hash]);
  const account = result.rows[0];
  stdout.write(`Conta administrativa criada: ${account.nome} <${account.email}> (ID ${account.id}).\n`);
  stdout.write('A senha não foi exibida nem armazenada em texto puro. Entre pelo painel /admin/.\n');
}

main()
  .catch((error) => {
    console.error(`Não foi possível criar a conta administrativa: ${error.code || error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.closeDatabase().catch(() => {});
  });
