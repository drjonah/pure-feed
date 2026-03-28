export const INSTAGRAM = {
  id: 'instagram',

  // Main feed area
  feedContainer: 'main[role="main"]',

  // Feed post images and videos
  mediaItem: [
    'article img[src*="cdninstagram.com"]',
    'article img[src*="fbcdn.net"]',
    'article video',
  ].join(', '),

  // The image container inside each post
  mediaWrapper: 'article div[role="button"] > div, article div[style*="padding-bottom"]',

  // Post text content (captions) for text-based filtering
  textContent: 'article span[dir="auto"]',

  // Post container for deletion
  postContainer: 'article',

  minWidth: 100,
  minHeight: 100,
};
