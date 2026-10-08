const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = [path.join(__dirname, '..', 'src'), path.join(__dirname, '..', 'scripts')];
let failed = false;

for (const root of roots) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  }
  walk(root);
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      failed = true;
      process.stderr.write(result.stderr);
    }
  }
}

if (failed) process.exit(1);
console.log('JavaScript syntax: OK');
