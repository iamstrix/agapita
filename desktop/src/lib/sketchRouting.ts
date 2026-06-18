export const PDOLLAR_DEBOUNCE_MS = 0;
export const SIGLIP_SCORE_THRESHOLD = 0.2;

export const shouldUseSiglipFallback = (score: number | null): boolean =>
  score === null || score < SIGLIP_SCORE_THRESHOLD;
