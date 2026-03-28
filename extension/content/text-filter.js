/**
 * Text-based NSFW filter.
 *
 * Scans post text for explicit keywords/patterns and returns the matched
 * category label ('Porn', 'Hentai', 'Sexy') or null if clean.
 *
 * Patterns are checked in severity order so the worst match wins.
 * All matching is case-insensitive with word-boundary awareness.
 */

// Each category maps to an array of RegExp patterns.
// Patterns use \b (word boundary) to reduce false positives.
const CATEGORIES = {
  Porn: [
    /\bporn\b/i,
    /\bpornograph/i,
    /\bxxx\b/i,
    /\bnsfw\b/i,
    /\bnude[s]?\b/i,
    /\bnudity\b/i,
    /\bblowjob/i,
    /\bhandjob/i,
    /\bcumshot/i,
    /\bgangbang/i,
    /\borgy\b/i,
    /\borgies\b/i,
    /\banal\s*sex/i,
    /\boral\s*sex/i,
    /\bdeepthroat/i,
    /\bbukk?ake/i,
    /\bcreampie/i,
    /\bdouble\s*penetration/i,
    /\bmasturbat/i,
    /\bjerk\s*off/i,
    /\bfuck\s*(me|her|him|them|my|this|that)\b/i,
    /\bf[u*]ck(?:ing|ed)?\s+(hard|rough|raw)/i,
    /\bsex\s*tape/i,
    /\bonlyfans/i,
    /\bescort\s*service/i,
    /\bstrip\s*club/i,
    /\berotic\b/i,
    /\bsmut\b/i,
    /\bx[- ]?rated/i,
  ],

  Hentai: [
    /\bhentai\b/i,
    /\bahegao\b/i,
    /\becchi\b/i,
    /\bfutanari\b/i,
    /\byaoi\b/i,
    /\byuri\b/i,
    /\bloli\b/i,
    /\bshota\b/i,
    /\btentacle\s*(porn|hentai|sex)/i,
    /\bdoujin(shi)?\b/i,
    /\br[- ]?18\b/i,
    /\brule\s*34\b/i,
    /\blewd\b/i,
  ],

  Sexy: [
    /\bsexy\b/i,
    /\bsexiest\b/i,
    /\bthirst\s*trap/i,
    /\bslut\b/i,
    /\bwhore\b/i,
    /\bhooker\b/i,
    /\blingerie\b/i,
    /\bstripper/i,
    /\bbikini\b/i,
    /\btwerk/i,
    /\bbooty\s*(call|shake|pic)/i,
    /\bnip\s*slip/i,
    /\bsideboob/i,
    /\bunderboob/i,
    /\bcamel\s*toe/i,
    /\bdick\s*pic/i,
    /\bnude\s*selfie/i,
    /\bbod(y)?\s*count\b/i,
    /\bfeet\s*pic/i,
    /\bsend\s*nudes/i,
  ],
};

// Check order: most severe first
const CHECK_ORDER = ['Porn', 'Hentai', 'Sexy'];

/**
 * Scan a text string for NSFW content.
 * @param {string} text — the raw text to check
 * @returns {string|null} — the matched category label, or null if clean
 */
export function scanText(text) {
  if (!text || text.length < 3) return null;

  for (const category of CHECK_ORDER) {
    for (const pattern of CATEGORIES[category]) {
      if (pattern.test(text)) return category;
    }
  }

  return null;
}
