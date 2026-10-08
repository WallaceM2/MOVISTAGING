const { Client } = require('pg');
const env = require('../src/config/env');

const requiredTables = [
  'admins', 'passageiros', 'motoristas', 'corridas', 'corrida_ofertas', 'avaliacoes', 'denuncias',
  'transacoes_motoristas', 'ocorrencias_pagamento', 'movi_refresh_tokens', 'movi_idempotency_keys',
  'movi_audit_logs', 'movi_areas_operacao', 'movi_tarifas', 'movi_pagamentos', 'movi_contatos_confianca',
  'movi_eventos_seguranca', 'movi_veiculos', 'movi_aceites_termos', 'movi_solicitacoes_titular',
  'movi_incidentes_seguranca', 'movi_lancamentos_financeiros', 'movi_saques_motoristas', 'movi_push_dispositivos',
  'movi_push_recibos', 'movi_compartilhamentos_corrida', 'movi_schema_migrations',
];

const requiredColumns = {
  motoristas: ['categoria', 'categoria_cnh', 'status_cadastro', 'status_conta', 'ear_confirmada', 'antecedentes_verificados', 'cnh_foto_url', 'documento_veiculo_url'],
  passageiros: ['status_conta', 'conta_verificada', 'debito_pendente'],
  corridas: ['categoria', 'status', 'valor', 'ganho_app', 'ganho_motorista', 'percentual_comissao_app', 'percentual_repasse_motorista', 'tarifa_snapshot', 'valor_taxa_app', 'valor_repasse_motorista'],
  movi_tarifas: ['categoria', 'valor_por_km_cliente', 'tarifa_minima_cliente', 'piso_liquido_motorista_km', 'comissao_app_pct', 'repasse_motorista_pct'],
  movi_veiculos: ['motorista_id', 'categoria', 'placa', 'placa_normalizada', 'status', 'ativo'],
};

async function main() {
  const client = new Client({ connectionString: env.DATABASE_URL, ssl: env.isProduction ? { rejectUnauthorized: true } : undefined, connectionTimeoutMillis: 10000 });
  await client.connect();
  const problems = [];
  try {
    const tablesResult = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [requiredTables]);
    const tables = new Set(tablesResult.rows.map((row) => row.table_name));
    for (const table of requiredTables) if (!tables.has(table)) problems.push(`Tabela ausente: ${table}`);

    for (const [table, columns] of Object.entries(requiredColumns)) {
      if (!tables.has(table)) continue;
      const result = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2::text[])`, [table, columns]);
      const found = new Set(result.rows.map((row) => row.column_name));
      for (const column of columns) if (!found.has(column)) problems.push(`Coluna ausente: ${table}.${column}`);
    }

    if (tables.has('movi_tarifas')) {
      const tariffs = await client.query(`
        SELECT categoria, comissao_app_pct, repasse_motorista_pct, piso_liquido_motorista_km, tarifa_minima_cliente
        FROM movi_tarifas
        WHERE area_operacao_id IS NULL AND ativa = TRUE AND vigencia_fim IS NULL
        ORDER BY categoria
      `);
      for (const categoria of ['moto', 'carro']) {
        const row = tariffs.rows.find((item) => item.categoria === categoria);
        if (!row) problems.push(`Tarifa global ativa ausente para ${categoria}`);
        else {
          if (Number(row.comissao_app_pct) !== 15 || Number(row.repasse_motorista_pct) !== 85) problems.push(`Tarifa ${categoria} não está em 15/85`);
          if (Number(row.piso_liquido_motorista_km) <= 0) problems.push(`Piso inválido para ${categoria}`);
          if (Number(row.tarifa_minima_cliente) <= 0) problems.push(`Tarifa mínima inválida para ${categoria}`);
        }
      }
    }

    if (tables.has('corridas')) {
      const duplicatePassenger = await client.query(`SELECT passageiro_id, COUNT(*) FROM corridas WHERE status IN ('solicitada','aceita','em_andamento') GROUP BY passageiro_id HAVING COUNT(*) > 1 LIMIT 5`);
      if (duplicatePassenger.rows.length) problems.push('Existem passageiros com mais de uma corrida ativa.');
      const duplicateDriver = await client.query(`SELECT motorista_id, COUNT(*) FROM corridas WHERE motorista_id IS NOT NULL AND status IN ('aceita','em_andamento') GROUP BY motorista_id HAVING COUNT(*) > 1 LIMIT 5`);
      if (duplicateDriver.rows.length) problems.push('Existem motoristas com mais de uma corrida ativa.');
      const split = await client.query(`SELECT COUNT(*)::int AS total FROM corridas WHERE status NOT IN ('expirada') AND (percentual_comissao_app <> 15 OR percentual_repasse_motorista <> 85 OR ROUND((ganho_app + ganho_motorista)::numeric, 2) <> ROUND(valor::numeric, 2))`);
      if (Number(split.rows[0].total) > 0) problems.push(`Existem ${split.rows[0].total} corridas com divisão financeira inconsistente.`);
    }

    if (tables.has('movi_veiculos') && tables.has('motoristas')) {
      const mismatch = await client.query(`SELECT COUNT(*)::int AS total FROM movi_veiculos v JOIN motoristas m ON m.id = v.motorista_id WHERE v.categoria <> m.categoria`);
      if (Number(mismatch.rows[0].total) > 0) problems.push(`Existem ${mismatch.rows[0].total} veículos com categoria diferente do motorista.`);
    }

    const migrationCount = tables.has('movi_schema_migrations') ? (await client.query('SELECT COUNT(*)::int AS total FROM movi_schema_migrations')).rows[0].total : 0;
    console.log(JSON.stringify({ ok: problems.length === 0, migrations_aplicadas: Number(migrationCount), problemas: problems }, null, 2));
    process.exitCode = problems.length ? 1 : 0;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, erro: error.message }));
  process.exit(1);
});
