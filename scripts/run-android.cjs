const { spawnSync } = require('node:child_process');


const cli = require.resolve('expo/bin/cli');
const flag = '--enable-native-access=ALL-UNNAMED';
const inheritedOptions = process.env.JAVA_TOOL_OPTIONS || '';
const javaToolOptions = inheritedOptions.includes(flag)
  ? inheritedOptions
  : `${inheritedOptions} ${flag}`.trim();

const result = spawnSync(process.execPath, [cli, 'run:android'], {
  stdio: 'inherit',
  env: { ...process.env, JAVA_TOOL_OPTIONS: javaToolOptions },
  cwd: process.cwd(),
});

if (result.error) {
  console.error(`Falha ao iniciar Expo Android: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
