// src/search.ts
/**
 * Trilingual Fuzzy Search Engine for English, Arabic, and French.
 * 100% compatible with raw HTML and Markdown formatting.
 *
 * Exposes:
 *   - digest(text): extracts human-facing text, normalizes, romanizes Arabic,
 *                   and computes a token score map.
 *   - compare(digest1, digest2): compares query and document digests and returns
 *                                an unsigned integer relevance score.
 *   - search(query, items, extractor): convenient collection search utility.
 *   - highlight(text, query): highlights matching terms in text.
 */

export type Digest = Record<string, number>;

export interface SearchResult<T> {
  item: T;
  score: number;
}

export interface HighlightOptions {
  tag?: string;
  className?: string;
}

// Unicode Arabic regex matching Arabic script characters
const ARABIC_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

// Tashkeel, harakat, tanween, and tatweel to strip from Arabic text
const ARABIC_DIACRITICS_REGEX = /[\u064B-\u065F\u0670\u0640]/g;

/**
 * Naive Arabic-to-English transliteration map.
 * Transliterates Arabic letters to Latin character equivalents without phonetic complexity.
 */
const ARABIC_TO_LATIN_MAP: Record<string, string> = {
  // Hamza & Alif variants
  "ء": "a",
  "آ": "a",
  "أ": "a",
  "إ": "a",
  "ا": "a",
  "ٱ": "a",
  "ى": "a",

  // Core consonants
  "ب": "b",
  "ت": "t",
  "ة": "t",
  "ث": "th",
  "ج": "j",
  "ح": "h",
  "خ": "kh",
  "د": "d",
  "ذ": "dh",
  "ر": "r",
  "ز": "z",
  "س": "s",
  "ش": "sh",
  "ص": "s",
  "ض": "d",
  "ط": "t",
  "ظ": "dh",
  "ع": "a",
  "غ": "gh",
  "ف": "f",
  "ق": "q",
  "ك": "k",
  "ل": "l",
  "م": "m",
  "ن": "n",
  "ه": "h",
  "و": "w",
  "ؤ": "w",
  "ي": "y",
  "ئ": "y",

  // Extended / Persian / Urdu letters
  "پ": "p",
  "چ": "ch",
  "ژ": "zh",
  "گ": "g",
  "ک": "k",
  "ی": "y",
};

/**
 * Romanizes Arabic text into English (naive transliteration).
 */
export function romanizeArabic(text: string): string {
  if (!text) return "";
  const stripped = text.replace(ARABIC_DIACRITICS_REGEX, "");
  let result = "";
  for (const char of stripped) {
    result += ARABIC_TO_LATIN_MAP[char] ?? char;
  }
  return result;
}

/**
 * Normalizes Arabic text by unifying Alif and Taa/Yaa variants.
 */
export function normalizeArabic(text: string): string {
  if (!text) return "";
  return text
    .replace(ARABIC_DIACRITICS_REGEX, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/**
 * Normalizes French and Latin accented characters to base ASCII equivalents.
 */
export function normalizeFrench(text: string): string {
  if (!text) return "";
  return text
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "ae")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "c")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Strips all non-human-facing artifacts from Markdown and HTML text.
 * Removes tags, styles, scripts, comments, LaTeX/Math, code fences, and links/images syntax.
 */
export function cleanText(input: string): string {
  if (!input || typeof input !== "string") return "";

  let text = input;

  // 1. Remove script and style elements and their internal contents
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");

  // 2. Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, " ");

  // 3. Remove LaTeX / KaTeX / MathJax equations ($$...$$, $...$, \[...\], \(...\))
  text = text.replace(/\$\$[\s\S]*?\$\$/g, " ");
  text = text.replace(/\\\[[\s\S]*?\\\]/g, " ");
  text = text.replace(/\\\([\s\S]*?\\\)/g, " ");
  text = text.replace(/\$[^$\n]+\$/g, " ");

  // 4. Remove Markdown code fences (```...```) and inline code (`...`)
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`[^`\n]+`/g, " ");

  // 5. Replace Markdown image syntax ![alt](url) -> preserve alt text
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ");

  // 6. Replace Markdown link syntax [text](url) -> preserve anchor text
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, " $1 ");

  // 7. Remove Markdown reference definitions [id]: url
  text = text.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, " ");

  // 8. Remove Markdown headings (# Heading -> Heading)
  text = text.replace(/^#{1,6}\s+/gm, " ");

  // 9. Remove Markdown blockquotes (> Quote -> Quote)
  text = text.replace(/^\s*>\s+/gm, " ");

  // 10. Remove Markdown horizontal rules
  text = text.replace(/^[\s*-=_]{3,}\s*$/gm, " ");

  // 11. Remove Markdown list bullets (*, -, +, 1.)
  text = text.replace(/^\s*[-*+]\s+/gm, " ");
  text = text.replace(/^\s*\d+\.\s+/gm, " ");

  // 12. Remove Markdown emphasis markers (**, __, *, _, ~~)
  text = text.replace(/[*_~]{1,3}/g, " ");

  // 13. Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // 14. Decode common HTML entities
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

  return text.replace(/\s+/g, " ").trim();
}

/**
 * Computes Levenshtein edit distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }

  return row[b.length];
}

/**
 * Normalizes a single raw token into its clean search keys.
 * Handles English, French diacritic normalization, and Arabic romanization.
 */
export function normalizeToken(raw: string): string[] {
  if (!raw) return [];

  // Strip non-letter / non-digit punctuation from edges
  const stripped = raw
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}]+$/u, "");

  if (!stripped) return [];

  const tokens: string[] = [];

  if (ARABIC_SCRIPT_REGEX.test(stripped)) {
    // 1. Romanized English form
    const romanized = romanizeArabic(stripped).toLowerCase();
    if (romanized) {
      tokens.push(romanized);
    }

    // 2. Normalized Arabic form (unifying alif variants, taa marbuta)
    const normAr = normalizeArabic(stripped);
    if (normAr && normAr !== romanized) {
      tokens.push(normAr);
    }
  } else {
    // English & French: strip accents and lower-case
    const norm = normalizeFrench(stripped).toLowerCase();
    if (norm) {
      tokens.push(norm);
    }
  }

  return tokens;
}

/**
 * Produces a search digest from a string.
 *
 * 1. Removes all non-human-facing artifacts (HTML tags, styles, scripts, Markdown formatting).
 * 2. Splits by whitespace.
 * 3. Normalizes French accents and turns Arabic into English (naive romanization).
 * 4. Returns an object of normalized token keys with their score (occurrence weight).
 */
export function digest(text: string): Digest {
  if (!text || typeof text !== "string") return {};

  const cleaned = cleanText(text);
  const words = cleaned.split(/\s+/).filter(Boolean);
  const result: Digest = {};

  for (const word of words) {
    const tokens = normalizeToken(word);
    for (const token of tokens) {
      result[token] = (result[token] || 0) + 1;
    }
  }

  return result;
}

/**
 * Compares an individual query term with an individual document term.
 * Returns an unsigned integer score based on exact, prefix, or fuzzy similarity.
 */
function compareTerms(q: string, wQ: number, d: string, wD: number): number {
  // 1. Exact match
  if (q === d) {
    return 100 * wQ * Math.min(wD, 5);
  }

  // 2. Prefix match (query is prefix of document token)
  if (d.startsWith(q) && q.length >= 2) {
    const ratio = q.length / d.length;
    return Math.round(75 * ratio * wQ * Math.min(wD, 4));
  }

  // 3. Suffix match or document token is prefix of longer query
  if (q.startsWith(d) && d.length >= 2) {
    const ratio = d.length / q.length;
    return Math.round(60 * ratio * wQ * Math.min(wD, 4));
  }

  // 4. Infix containment match
  if (d.includes(q) && q.length >= 3) {
    const ratio = q.length / d.length;
    return Math.round(45 * ratio * wQ * Math.min(wD, 3));
  }

  // 5. Fuzzy Levenshtein match (typo tolerance)
  const maxLen = Math.max(q.length, d.length);
  if (maxLen >= 3) {
    const dist = levenshtein(q, d);
    const maxAllowedDist = maxLen <= 4 ? 1 : maxLen <= 8 ? 2 : 3;

    if (dist <= maxAllowedDist) {
      const similarity = 1 - dist / maxLen;
      if (similarity >= 0.6) {
        return Math.round(40 * similarity * wQ * Math.min(wD, 3));
      }
    }
  }

  return 0;
}

/**
 * Compares two digests (e.g. digest1 from the search box, digest2 from a document).
 * Returns an unsigned integer relevance score (>= 0).
 */
export function compare(digest1: Digest, digest2: Digest): number {
  if (!digest1 || !digest2) return 0;

  const queryKeys = Object.keys(digest1);
  const docKeys = Object.keys(digest2);

  if (queryKeys.length === 0 || docKeys.length === 0) return 0;

  let totalScore = 0;
  let matchedQueryTokens = 0;

  for (const q of queryKeys) {
    const wQ = digest1[q];
    let bestTermScore = 0;

    for (const d of docKeys) {
      const wD = digest2[d];
      const score = compareTerms(q, wQ, d, wD);
      if (score > bestTermScore) {
        bestTermScore = score;
      }
    }

    if (bestTermScore > 0) {
      matchedQueryTokens++;
      totalScore += bestTermScore;
    }
  }

  if (matchedQueryTokens === 0) return 0;

  // Completeness multiplier: bonus if all query tokens were matched
  const completenessRatio = matchedQueryTokens / queryKeys.length;
  if (completenessRatio === 1) {
    totalScore += 50 * matchedQueryTokens;
  } else {
    totalScore = totalScore * completenessRatio;
  }

  return Math.max(0, Math.round(totalScore));
}

/**
 * Searches a collection of items against a query string using digest & compare.
 * Returns items sorted by relevance score in descending order.
 */
export function search<T>(
  query: string,
  items: T[],
  extractor: (item: T) => string
): SearchResult<T>[] {
  const queryDigest = digest(query);
  if (Object.keys(queryDigest).length === 0) return [];

  const results: SearchResult<T>[] = [];

  for (const item of items) {
    const docText = extractor(item);
    const docDigest = digest(docText);
    const score = compare(queryDigest, docDigest);

    if (score > 0) {
      results.push({ item, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Generates an HTML snippet with matching query terms highlighted with a <mark> tag.
 */
export function highlight(
  text: string,
  query: string,
  options: HighlightOptions = {}
): string {
  if (!text || !query) return text || "";

  const tag = options.tag || "mark";
  const className = options.className ? ` class="${options.className}"` : "";

  const queryTerms = Object.keys(digest(query)).filter((t) => t.length > 1);
  if (queryTerms.length === 0) return text;

  // Build regex matching query terms or their raw forms
  const escaped = queryTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");

  return text.replace(regex, `<${tag}${className}>$1</${tag}>`);
}

export default {
  digest,
  compare,
  search,
  cleanText,
  romanizeArabic,
  normalizeFrench,
  normalizeArabic,
  normalizeToken,
  levenshtein,
  highlight,
};
