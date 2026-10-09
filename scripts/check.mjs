import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await check(path);
    else if (/\.(mjs|js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(1);
    }
  }
}
for (const dir of ['src', 'public', 'scripts', 'test', 'e2e']) await check(dir);
const configuration = spawnSync(process.execPath, ['--check', 'playwright.config.mjs'], { stdio: 'inherit' });
if (configuration.status !== 0) process.exit(1);
console.log('JavaScript syntax checks passed. Security behavior is covered by npm test.');
