import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(
  new URL('../src/pages/LoginPage.tsx', import.meta.url),
  'utf8',
);
const cssSource = readFileSync(
  new URL('../src/index.css', import.meta.url),
  'utf8',
);

test('login page uses a focused clinical sign-in layout without canvas interaction', () => {
  assert.match(pageSource, /className="login-page"/);
  assert.match(pageSource, /className="login-shell"/);
  assert.match(pageSource, /className="login-brand"/);
  assert.match(pageSource, /className="login-form-panel"/);
  assert.doesNotMatch(pageSource, /<canvas/);
  assert.doesNotMatch(pageSource, /generateRandomShape/);
});

test('login errors are announced and loading remains visible', () => {
  assert.match(pageSource, /role="alert"/);
  assert.match(pageSource, /aria-live="polite"/);
  assert.match(pageSource, /Authenticating/);
  assert.match(pageSource, /disabled=\{isLoading\}/);
});

test('ambient motion has a reduced-motion fallback', () => {
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(cssSource, /\.login-ambient/);
  assert.match(cssSource, /\.login-shell/);
});

test('login page exposes expressive pointer motion without moving the form', () => {
  assert.match(pageSource, /onPointerMove=\{handlePointerMove\}/);
  assert.match(pageSource, /onPointerLeave=\{handlePointerLeave\}/);
  assert.match(pageSource, /requestAnimationFrame/);
  assert.match(pageSource, /--pointer-x/);
  assert.match(pageSource, /--tilt-x/);
  assert.match(pageSource, /className="login-pointer-glow"/);

  assert.match(
    cssSource,
    /@media \(hover: hover\) and \(pointer: fine\) and \(min-width: 801px\)/,
  );
  assert.match(cssSource, /--login-primary:\s*#5170ff/i);
  assert.match(cssSource, /\.login-brand\s*\{[^}]*transform:/s);
  assert.doesNotMatch(cssSource, /\.login-form-panel\s*\{[^}]*transform:/s);
});
