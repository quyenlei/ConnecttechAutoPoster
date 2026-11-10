/** Hard limits that protect the user's account. UI cannot exceed them. */
export const LIMITS = {
  /** Never post to the same account faster than this. */
  minDelaySec: 30,
  maxDelaySec: 3600,
  maxGroupsPerCampaign: 100,
  maxCommentsPerGroup: 100,
  /** Newest-posts mode cannot check a post's age, so it stays small. */
  maxNewestPostComments: 5,
  /** Newest-posts mode only looks at this many posts from the top of the feed. */
  newestFeedWindow: 10,
  /** Comment campaigns: at most this many feed posts are looked at per scan (the feed is scrolled to load them). */
  feedScanMaxPosts: 40,
  /** Comment campaigns: one scan of a group feed stops after this long. */
  feedScanTimeoutMs: 60_000,
  /** Wait for a placeholder feed item to render, or for more items to load after scrolling. */
  feedRenderWaitMs: 2_500,
  /** "Lấy danh sách nhóm đã tham gia": stop after this many groups or this long. */
  maxJoinedGroups: 500,
  joinedScanTimeoutMs: 120_000,
  /** After hovering the post time, wait this long for Facebook to show the time or link. */
  hoverWaitMs: 1_500,
  maxVariations: 10,
  maxPostLength: 5000,
  /** Safety Break: pause after at most this many posts, for at most this many minutes. */
  maxSafetyBreakEvery: 100,
  maxSafetyBreakMinutes: 240,
  /** The activity log keeps only the newest entries. */
  maxLogEntries: 2000,
  /** A failure that happened before anything was submitted is retried once after this wait. */
  retryDelayMs: 8_000,
  /** Auto-pause the run after this many failures in a row. */
  maxConsecutiveFailures: 5,
  /** Wait for a group page to finish loading. */
  tabLoadTimeoutMs: 45_000,
  /** Wait for the composer flow inside the page. */
  postTimeoutMs: 90_000,
  /** Daily schedule: at most this many start times per campaign. */
  maxScheduleTimesPerDay: 2,
  /** Daily schedule: minimum gap between two start times, also across midnight. */
  minScheduleGapMinutes: 360,
  /** A scheduled start later than this is skipped, never run late. */
  scheduleGraceMinutes: 10,
  /**
   * Post images are stored as data URLs in chrome.storage.local (10 MiB quota in current Chrome).
   * 4 MB of image bytes is about 5.4 MB once base64-encoded, which leaves room for everything else.
   */
  maxImagesPerCampaign: 4,
  /** Per image, after the UI has shrunk it. */
  maxImageBytes: 1_000_000,
  /** Over all campaigns together. */
  maxTotalImageBytes: 4_000_000,
  /** Longest side in pixels after shrinking. */
  maxImageEdgePx: 1600,
  /** Wait once for Facebook's link preview card to show up before closing it. */
  linkPreviewWaitMs: 4_000,
  /** Wait for attached images to finish uploading in the composer. */
  imageUploadTimeoutMs: 30_000,
} as const;

export const DEFAULT_SAFETY_BREAK = { enabled: true, everyPosts: 10, breakMinutes: 15 } as const;
