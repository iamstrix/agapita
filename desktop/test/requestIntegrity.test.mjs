import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRequestId,
  isActiveRequest,
  shouldAcceptSocketEvent,
} from '../src/lib/requestIntegrity.ts';

test('request IDs are unique strings', () => {
  const first = createRequestId();
  const second = createRequestId();

  assert.equal(typeof first, 'string');
  assert.notEqual(first, second);
});

test('stale socket chunks and completions are rejected', () => {
  const active = 'request-new';

  assert.equal(isActiveRequest(active, 'request-old'), false);
  assert.equal(isActiveRequest(active, 'request-new'), true);
  assert.equal(
    shouldAcceptSocketEvent(active, {request_id: 'request-old'}),
    false,
  );
  assert.equal(
    shouldAcceptSocketEvent(active, {request_id: 'request-new'}),
    true,
  );
});

test('events without request IDs cannot mutate an active submission', () => {
  assert.equal(shouldAcceptSocketEvent('request-new', {}), false);
  assert.equal(shouldAcceptSocketEvent(null, {}), true);
});
