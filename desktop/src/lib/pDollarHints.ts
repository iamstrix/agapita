type PDollarResult = {
  Name?: string;
  Score?: number;
};

const MIN_HINT_SCORE = 0.45;

const SEMANTIC_HINTS: Record<string, string> = {
  arrowhead: 'arrow',
  exclamation: 'exclamation mark',
  x: 'X mark',
};

export const getSemanticPDollarHint = (result: PDollarResult | null | undefined): string | null => {
  if (!result || typeof result.Score !== 'number' || result.Score < MIN_HINT_SCORE) {
    return null;
  }

  const key = String(result.Name || '').trim().toLowerCase();
  return SEMANTIC_HINTS[key] || null;
};
