import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PDOLLAR_DEBOUNCE_MS,
  SIGLIP_LOW_CONFIDENCE_THRESHOLD,
  SIGLIP_SCORE_THRESHOLD,
  shouldLearnSiglipResult,
  shouldUseSiglipFallback,
} from '../src/lib/sketchRouting.ts';

test('P-Dollar Plus has no debounce', () => {
  assert.equal(PDOLLAR_DEBOUNCE_MS, 0);
});

test('SigLIP learning is only prompted below its confidence threshold', () => {
  assert.equal(SIGLIP_LOW_CONFIDENCE_THRESHOLD, 0.1);
  assert.equal(shouldLearnSiglipResult(0.099), true);
  assert.equal(shouldLearnSiglipResult(0.1), false);
  assert.equal(shouldLearnSiglipResult(null), false);
});

test('SigLIP is only used below the P-Dollar Plus score threshold', () => {
  assert.equal(SIGLIP_SCORE_THRESHOLD, 0.2);
  assert.equal(shouldUseSiglipFallback(0.19), true);
  assert.equal(shouldUseSiglipFallback(0.2), false);
  assert.equal(shouldUseSiglipFallback(0.21), false);
});
