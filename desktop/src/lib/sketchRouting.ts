export const PDOLLAR_DEBOUNCE_MS = 0;
export const SIGLIP_SCORE_THRESHOLD = 0.5;
export const SIGLIP_LOW_CONFIDENCE_THRESHOLD = 0.1;

export const shouldUseSiglipFallback = (score: number | null): boolean =>
  score === null || score < SIGLIP_SCORE_THRESHOLD;

export const shouldLearnSiglipResult = (score: number | null): boolean =>
  score !== null && score < SIGLIP_LOW_CONFIDENCE_THRESHOLD;
