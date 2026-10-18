import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expoCli = path.join(projectRoot, 'node_modules', 'expo', 'bin', 'cli');
const nativeAccessFlag = '--enable-native-access=ALL-UNNAMED';
const configuredJavaOptions = process.env.JAVA_TOOL_OPTIONS?.trim();
const javaToolOptions = configuredJavaOptions?.includes(nativeAccessFlag)
  ? configuredJavaOptions
  : [configuredJavaOptions, nativeAccessFlag].filter(Boolean).join(' ');

const expo = spawn(process.execPath, [expoCli, 'run:android', ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: { ...process.env, JAVA_TOOL_OPTIONS: javaToolOptions },
  stdio: 'inherit',
});

expo.on('error', (error) => {
  console.error(`Não foi possível iniciar o build Android: ${error.message}`);
  process.exitCode = 1;
});

expo.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
