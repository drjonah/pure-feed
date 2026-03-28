/**
 * X / X.com platform selectors.
 * data-testid attributes are X's most stable hooks — they're used
 * for their own test suite so they tend to survive redesigns longer than
 * class names.
 *
 * If selectors break after an X update, only this file needs changing.
 */
export const X = {
  id: 'x',

  // The main feed column — scope the MutationObserver here to avoid
  // watching the entire document
  feedContainer: '[data-testid="primaryColumn"]',

  // Individual image and video elements inside posts
  mediaItem: [
    '[data-testid="tweetPhoto"] img',
    '[data-testid="videoComponent"] video',
    '[data-testid="tweet"] img[src*="pbs.twimg.com"]', // fallback
  ].join(', '),

  // The wrapper div around the media — this is what gets blurred/hidden
  // so layout is preserved
  mediaWrapper: '[data-testid="tweetPhoto"]',

  // Post text content for text-based filtering
  textContent: '[data-testid="tweetText"]',

  // Post container for deletion
  postContainer: '[data-testid="tweet"], article',

  // Minimum dimensions to bother classifying (skip icons, avatars, etc.)
  minWidth: 100,
  minHeight: 100,
};
