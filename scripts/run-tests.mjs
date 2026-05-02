import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

const [root = 'src'] = process.argv.slice(2);
const testFiles = [];

function collectTests(directory) {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      collectTests(fullPath);
      continue;
    }
    if (/\.test\.ts$/.test(entry)) {
      testFiles.push(fullPath);
    }
  }
}

collectTests(root);
testFiles.sort();

if (testFiles.length === 0) {
  console.error(`No test files found under ${root}`);
  process.exit(1);
}

const args = ['--import', 'tsx', '--test', ...testFiles.map((file) => relative(process.cwd(), file))];
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
