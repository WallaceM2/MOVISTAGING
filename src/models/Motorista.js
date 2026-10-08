const pool = require('../config/database');
const bcrypt = require('bcrypt');
const AppError = require('../errors/AppError');

async function criar(dados, db = pool) {
  const { nome, sobrenome, email, telefone, senha, data_nascimento, nacionalidade, cpf, rg, cnh, categoria_cnh, regiao, estado, cidade, categoria, placa_veiculo, marca_veiculo, modelo_veiculo, cor_veiculo, ano_modelo_veiculo } = dados;
  const senha_hash = await bcrypt.hash(senha, 12);
  const { rows } = await db.query(`
    INSERT INTO motoristas (
      nome, sobrenome, email, senha_hash, telefone, data_nascimento, nacionalidade,
      cpf, rg, cnh, categoria_cnh, regiao, estado, cidade, categoria, status_cadastro, status_conta
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'em_analise','ativa')
    RETURNING id, nome, sobrenome, email, status_cadastro, status_conta, criado_em;
  `, [nome, sobrenome, email, senha_hash, telefone, data_nascimento, nacionalidade, cpf, rg, cnh, categoria_cnh, regiao, estado, cidade, categoria]);
  const motorista = rows[0];
  const veiculoResult = await db.query(`
    INSERT INTO movi_veiculos (motorista_id, categoria, placa, marca, modelo, cor, ano_modelo, status, ativo)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'em_analise',TRUE)
    RETURNING id, categoria, placa, marca, modelo, cor, ano_modelo, status;
  `, [motorista.id, categoria, placa_veiculo, marca_veiculo, modelo_veiculo, cor_veiculo, ano_modelo_veiculo]);
  await db.query('UPDATE motoristas SET veiculo_ativo_id = $1 WHERE id = $2', [veiculoResult.rows[0].id, motorista.id]);
  return { ...motorista, veiculo: veiculoResult.rows[0] };
}

async function listarTodos({ limit = 50, offset = 0 } = {}) {
  const { rows } = await pool.query(`
    SELECT id, nome, sobrenome, email, telefone, categoria, categoria_cnh, status_cadastro, status_conta, nota_media, total_avaliacoes, criado_em
    FROM motoristas
    ORDER BY criado_em DESC
    LIMIT $1 OFFSET $2;
  `, [limit, offset]);
  return rows;
}

async function buscarPorEmail(email) {
  const { rows } = await pool.query('SELECT * FROM motoristas WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
  return rows[0];
}

async function buscarPorId(id) {
  const { rows } = await pool.query(`
    SELECT m.id, m.nome, m.sobrenome, m.email, m.telefone, m.cpf, m.rg, m.cnh, m.categoria_cnh, m.categoria,
           m.status_cadastro, m.status_conta, m.ear_confirmada, m.antecedentes_verificados, m.cnh_verificada_em,
           m.veiculo_verificado_em, m.antecedentes_verificados_em, m.documento_veiculo_url, m.documento_veiculo_tipo,
           m.rg_foto_url, m.cnh_foto_url, m.foto_perfil_url, m.nota_media, m.total_avaliacoes, m.criado_em, m.atualizado_em,
           CASE WHEN v.id IS NULL THEN NULL ELSE json_build_object(
             'id', v.id, 'categoria', v.categoria, 'placa', v.placa, 'marca', v.marca,
             'modelo', v.modelo, 'cor', v.cor, 'ano_modelo', v.ano_modelo, 'status', v.status
           ) END AS veiculo
    FROM motoristas m
    LEFT JOIN movi_veiculos v ON v.id = m.veiculo_ativo_id AND v.ativo = TRUE
    WHERE m.id = $1 LIMIT 1;
  `, [id]);
  return rows[0];
}

async function atualizarStatus(id, novoStatus) {
  const cadastroStatus = new Set(['em_analise', 'aprovado', 'reprovado']);
  const contaStatus = new Set(['ativa', 'suspensa', 'banida']);
  if (!cadastroStatus.has(novoStatus) && !contaStatus.has(novoStatus)) {
    throw new AppError('Status de motorista inválido.', 400, 'INVALID_STATUS');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (cadastroStatus.has(novoStatus) && novoStatus === 'aprovado') {
      const check = await client.query(`
        SELECT id, categoria, categoria_cnh, cnh_foto_url, documento_veiculo_url,
               ear_confirmada, antecedentes_verificados, cnh_verificada_em, veiculo_verificado_em,
               antecedentes_verificados_em, status_conta
        FROM motoristas WHERE id = $1 FOR UPDATE;
      `, [id]);
      const motorista = check.rows[0];
      if (!motorista) { await client.query('COMMIT'); return undefined; }
      const vehicle = await client.query(`SELECT id, status FROM movi_veiculos WHERE motorista_id = $1 AND ativo = TRUE LIMIT 1 FOR UPDATE`, [id]);
      const cnhCategoria = String(motorista.categoria_cnh || '').toUpperCase();
      const categoriaOk = motorista.categoria === 'moto' ? cnhCategoria.includes('A') : cnhCategoria.includes('B');
      const pendencias = [];
      if (!motorista.cnh_foto_url) pendencias.push('CNH');
      if (!motorista.documento_veiculo_url) pendencias.push('documento do veículo');
      if (!motorista.ear_confirmada) pendencias.push('EAR');
      if (!motorista.antecedentes_verificados || !motorista.antecedentes_verificados_em) pendencias.push('antecedentes');
      if (!motorista.cnh_verificada_em) pendencias.push('validação da CNH');
      if (!motorista.veiculo_verificado_em) pendencias.push('validação do veículo');
      if (!vehicle.rows[0] || vehicle.rows[0].status !== 'aprovado') pendencias.push('veículo cadastrado e aprovado');
      if (!categoriaOk) pendencias.push('categoria da CNH compatível');
      if (pendencias.length) {
        throw new AppError(`Motorista não pode ser aprovado. Pendências: ${pendencias.join(', ')}.`, 409, 'DRIVER_DOCUMENT_REVIEW_PENDING');
      }
    }
    const column = cadastroStatus.has(novoStatus) ? 'status_cadastro' : 'status_conta';
    const { rows } = await client.query(`UPDATE motoristas SET ${column} = $1, atualizado_em = NOW() WHERE id = $2 RETURNING id, nome, sobrenome, email, status_cadastro, status_conta`, [novoStatus, id]);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}


async function atualizarVerificacao(id, dados) {
  const { categoria_cnh, ear_confirmada, antecedentes_verificados, validar_cnh, validar_veiculo, validar_antecedentes } = dados;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (validar_veiculo) {
      const driver = await client.query('SELECT id, documento_veiculo_url FROM motoristas WHERE id = $1 FOR UPDATE', [id]);
      if (!driver.rows[0] || !driver.rows[0].documento_veiculo_url) throw new AppError('Envie e confira o documento do veículo antes de aprová-lo.', 409, 'DRIVER_DOCUMENT_REVIEW_PENDING');
      const vehicle = await client.query('SELECT id FROM movi_veiculos WHERE motorista_id = $1 AND ativo = TRUE FOR UPDATE', [id]);
      if (!vehicle.rows[0]) throw new AppError('Não há veículo ativo para aprovar.', 409, 'DRIVER_VEHICLE_REQUIRED');
    }
    const { rows } = await client.query(`
      UPDATE motoristas SET
        categoria_cnh = COALESCE($1, categoria_cnh),
        ear_confirmada = COALESCE($2, ear_confirmada),
        antecedentes_verificados = COALESCE($3, antecedentes_verificados),
        cnh_verificada_em = CASE
          WHEN $4::boolean THEN NOW()
          WHEN $1 IS NOT NULL AND UPPER($1) IS DISTINCT FROM UPPER(categoria_cnh) THEN NULL
          ELSE cnh_verificada_em
        END,
        veiculo_verificado_em = CASE WHEN $5::boolean THEN NOW() ELSE veiculo_verificado_em END,
        antecedentes_verificados_em = CASE WHEN $6::boolean THEN NOW() ELSE antecedentes_verificados_em END,
        atualizado_em = NOW()
      WHERE id = $7
      RETURNING id, nome, categoria, categoria_cnh, ear_confirmada, antecedentes_verificados,
                cnh_verificada_em, veiculo_verificado_em, antecedentes_verificados_em, status_cadastro, status_conta;
    `, [categoria_cnh || null, ear_confirmada ?? null, antecedentes_verificados ?? null, Boolean(validar_cnh), Boolean(validar_veiculo), Boolean(validar_antecedentes), id]);
    if (!rows[0]) { await client.query('COMMIT'); return undefined; }
    if (validar_veiculo) await client.query(`UPDATE movi_veiculos SET status = 'aprovado', atualizado_em = NOW() WHERE motorista_id = $1 AND ativo = TRUE`, [id]);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function atualizarDocumentos(id, campos) {
  const permitidos = new Set(['rg_foto_url', 'cnh_foto_url', 'foto_perfil_url', 'documento_veiculo_url', 'documento_veiculo_tipo']);
  const colunas = Object.keys(campos).filter((c) => permitidos.has(c));
  if (!colunas.length) return null;
  const sets = colunas.map((coluna, i) => `${coluna} = $${i + 1}`);
  const valores = colunas.map((coluna) => campos[coluna]);

  // Troca de evidência crítica exige nova análise. As verificações antigas
  // nunca podem ser reaproveitadas para um novo arquivo/documento.
  if (colunas.includes('cnh_foto_url')) {
    sets.push('cnh_verificada_em = NULL');
    sets.push("status_cadastro = 'em_analise'");
  }
  if (colunas.includes('documento_veiculo_url')) {
    sets.push('veiculo_verificado_em = NULL');
    sets.push("status_cadastro = 'em_analise'");
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
    UPDATE motoristas SET ${sets.join(', ')}, atualizado_em = NOW()
    WHERE id = $${valores.length + 1}
    RETURNING id, nome, rg_foto_url, cnh_foto_url, foto_perfil_url, documento_veiculo_url, documento_veiculo_tipo, status_cadastro, cnh_verificada_em, veiculo_verificado_em;
    `, [...valores, id]);
    if (colunas.includes('documento_veiculo_url')) {
      const vehicle = await client.query(`UPDATE movi_veiculos SET status = 'em_analise', atualizado_em = NOW() WHERE motorista_id = $1 AND ativo = TRUE RETURNING id`, [id]);
      if (!vehicle.rows[0]) throw new AppError('Cadastre um veículo antes de enviar o documento.', 409, 'DRIVER_VEHICLE_REQUIRED');
    }
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    client.release();
  }
}

async function marcarBloqueioDinheiro(id, bloqueado, saldoCarteira) {
  const { rows } = await pool.query(`
    UPDATE motoristas SET saldo_carteira = $1, bloqueado_dinheiro = $2, atualizado_em = NOW()
    WHERE id = $3 RETURNING id, saldo_carteira, bloqueado_dinheiro;
  `, [saldoCarteira, bloqueado, id]);
  return rows[0];
}

module.exports = { criar, listarTodos, buscarPorEmail, buscarPorId, atualizarStatus, atualizarVerificacao, atualizarDocumentos, marcarBloqueioDinheiro };
