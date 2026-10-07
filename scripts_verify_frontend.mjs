import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  'app/_layout.tsx',
  'app/index.tsx',
  'app/(public)/login.tsx',
  'app/(public)/cadastro.tsx',
  'app/(app)/home.tsx',
  'app/(app)/corrida/estimar.tsx',
  'app/(app)/corrida/confirmar.tsx',
  'app/(app)/corrida/status.tsx',
  'app/(app)/legal.tsx',
  'src/api/http.ts',
  'src/realtime/socket.ts',
  'src/location/location.ts',
  'tests/api-http.test.ts',
  'tests/services.test.ts',
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error(`Arquivos obrigatórios ausentes:\n${missing.join('\n')}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const dep of ['expo', 'expo-router', 'expo-secure-store', 'expo-location', '@rnmapbox/maps', '@tanstack/react-query', 'socket.io-client', 'zustand']) {
  if (!pkg.dependencies?.[dep]) throw new Error(`Dependência ausente: ${dep}`);
}

console.log('Estrutura do MOVI Passageiro OK.');
