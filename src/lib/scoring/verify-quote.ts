import * as fuzzball from "fuzzball";

function normalize(s: string) {
  return s.replace(/\s+/g, " ").replace(/["'"'`]/g, "'").trim().toLowerCase();
}

/** Fuzzy-verifies an AI-claimed evidence quote actually appears in the redacted CV text. */
export function verifyQuote(quote: string, cvText: string, threshold = 0.9): boolean {
  if (!quote || !quote.trim()) return false;
  const normQuote = normalize(quote);
  const normCv = normalize(cvText);

  if (normCv.includes(normQuote)) return true;

  const partial = fuzzball.partial_ratio(normQuote, normCv) / 100;
  const tokenSet = fuzzball.token_set_ratio(normQuote, normCv) / 100;
  return Math.max(partial, tokenSet) >= threshold;
}
