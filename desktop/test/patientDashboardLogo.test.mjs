import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(
  new URL('../src/pages/PatientDashboard.tsx', import.meta.url),
  'utf8',
);

test('drawing canvas logo uses half-size dimensions at every breakpoint', () => {
  assert.match(
    pageSource,
    /<AgapitaLogo\s+className="[^"]*\bw-\[50%\]\s+h-\[50%\][^"]*"/s,
  );
  assert.doesNotMatch(pageSource, /md:w-\[65%\]|md:h-\[65%\]|lg:w-full|lg:h-full/);
});
