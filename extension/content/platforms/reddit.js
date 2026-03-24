export const REDDIT = {
  id: 'reddit',

  // Main feed or post detail view
  feedContainer: '.ListingLayout-outerContainer, [data-testid="post-container"]',

  // Images inside posts — Reddit uses shreddit-post elements and various image containers
  mediaItem: [
    'shreddit-post img[src*="preview.redd.it"]',
    'shreddit-post img[src*="i.redd.it"]',
    'article img[src*="preview.redd.it"]',
    'article img[src*="i.redd.it"]',
    '[data-testid="post-content"] img',
    'shreddit-post video',
  ].join(', '),

  // Wrapper around media — blur this to preserve layout
  mediaWrapper: '[slot="post-media-container"], [data-testid="post-content"] .media-element',

  minWidth: 100,
  minHeight: 100,
};
