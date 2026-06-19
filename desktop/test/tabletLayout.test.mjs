import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const patient = readFileSync(new URL('../src/pages/PatientDashboard.tsx', import.meta.url), 'utf8');
const caretaker = readFileSync(new URL('../src/pages/CaretakerDashboard.tsx', import.meta.url), 'utf8');
const login = readFileSync(new URL('../src/pages/LoginPage.tsx', import.meta.url), 'utf8');

test('tablet layout uses a dedicated compact breakpoint', () => {
  assert.match(css, /@media \(min-width: 700px\) and \(max-width: 1180px\)/);
  assert.match(css, /\.patient-dashboard \.tablet-action-rail/);
  assert.match(css, /\.patient-dashboard \.tablet-bottom-nav/);
  assert.match(css, /\.patient-dashboard \.tablet-option-grid/);
});

test('tablet hooks are attached to the patient and login layouts', () => {
  assert.match(patient, /className="patient-dashboard /);
  assert.match(patient, /tablet-action-rail/);
  assert.match(patient, /tablet-content-panel/);
  assert.match(login, /className="login-panel /);
  assert.match(login, /login-profile-button/);
});

test('caretaker compact navigation includes common landscape tablet widths', () => {
  assert.match(caretaker, /window\.innerWidth <= 1180/);
  assert.match(caretaker, /w <= 1180/);
});
