// Telling "every cloud model is out of quota" apart from "something broke".
//
// When all the providers answer with rate limits, the scan has not failed: the
// on-device reader still has the picture, and the person only needs to know when
// the cloud will take requests again.

/** Whether the providers' errors say they are out of quota, rather than broken. */
export function quotaHit(error: string | undefined): boolean {
  return /HTTP 429|rate.?limit|quota|exceeded|too many requests|insufficient credits|HTTP 402/i.test(error ?? "");
}

/**
 * How long until a provider will take requests again: the longest "try again in"
 * any of them gave, at least a minute, and ten minutes when none of them said.
 */
export function quotaWaitSeconds(error: string | undefined): number {
  let longest = 0;
  for (const m of (error ?? "").matchAll(/try again in (?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:([\d.]+)\s*(ms|s))?/gi)) {
    const sec = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + (m[3] ? Number(m[3]) / (m[4]?.toLowerCase() === "ms" ? 1000 : 1) : 0);
    longest = Math.max(longest, sec);
  }
  return longest > 0 ? Math.min(3600, Math.max(60, Math.ceil(longest))) : 600;
}
