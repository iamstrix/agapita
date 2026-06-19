import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const sourceFiles = [
  '../src/api/auth.ts',
  '../src/pages/AdminDashboard.tsx',
  '../src/pages/CaretakerDashboard.tsx',
  '../src/pages/PatientDashboard.tsx',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8'));

const serverUrlSource = readFileSync(
  new URL('../src/lib/serverUrl.ts', import.meta.url),
  'utf8',
);
const viteSource = readFileSync(
  new URL('../vite.config.ts', import.meta.url),
  'utf8',
);

test('browser clients use the webapp origin instead of tablet localhost', () => {
  assert.match(serverUrlSource, /window\.location\.origin/);
  assert.match(serverUrlSource, /localhost/);
  assert.match(serverUrlSource, /127\.0\.0\.1/);
  assert.doesNotMatch(sourceFiles.join('\n'), /localhost:8000|127\.0\.0\.1:8000/);
  for (const source of sourceFiles) {
    assert.match(source, /serverUrl/);
  }
});

test('Vite proxies API and Socket.IO traffic to the backend', () => {
  assert.match(viteSource, /['"]\/api['"]/);
  assert.match(viteSource, /['"]\/socket\.io['"]/);
  assert.match(viteSource, /ws:\s*true/);
});
