import { describe, expect, it } from "vitest";
import { quotaHit, quotaWaitSeconds } from "./quota";

describe("quota", () => {
  it("recognises providers out of quota", () => {
    expect(quotaHit("Groq (qwen): HTTP 429 Rate limit reached. Please try again in 9.18s")).toBe(true);
    expect(quotaHit("OpenRouter (x): HTTP 402 Insufficient credits")).toBe(true);
    expect(quotaHit("Gemini: did not answer within 15s")).toBe(false);
  });

  it("waits as long as the slowest provider asked, within sensible bounds", () => {
    expect(quotaWaitSeconds("a: try again in 9.18s; b: Please try again in 4m12s")).toBe(252);
    expect(quotaWaitSeconds("HTTP 429 slow down")).toBe(600);
    expect(quotaWaitSeconds("try again in 5s")).toBe(60);
  });
});
