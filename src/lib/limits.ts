/** Hard limits that protect the user's account. UI cannot exceed them. */
export const LIMITS = {
  /** Never post to the same account faster than this. */
  minDelaySec: 30,
  maxDelaySec: 3600,
  maxGroupsPerCampaign: 100,
  maxVariations: 10,
  maxPostLength: 5000,
  /** Auto-pause the run after this many failures in a row. */
  maxConsecutiveFailures: 5,
  /** Wait for a group page to finish loading. */
  tabLoadTimeoutMs: 45_000,
  /** Wait for the composer flow inside the page. */
  postTimeoutMs: 40_000,
} as const;

export const DEFAULT_SAFETY_BREAK = { enabled: true, everyPosts: 10, breakMinutes: 15 } as const;
