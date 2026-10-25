import { afterEach, describe, expect, it, vi } from "vitest";
import { describeImagesAny, hedge, worthAnotherModel } from "./vision";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("hedge", () => {
  it("never starts the second when the first answers in time", async () => {
    const second = vi.fn(async () => "b");
    expect(await hedge(async () => "a", second, 50)).toBe("a");
    await wait(80);
    expect(second).not.toHaveBeenCalled();
  });

  it("starts the second when the first is slow, and takes whichever answers", async () => {
    const r = await hedge(
      async () => {
        await wait(200);
        return "slow";
      },
      async () => "quick",
      30,
    );
    expect(r).toBe("quick");
  });

  it("starts the second at once when the first fails early", async () => {
    const t0 = Date.now();
    const r = await hedge(async () => null, async () => "b", 5000);
    expect(r).toBe("b");
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("is null when both come back empty", async () => {
    expect(await hedge(async () => null, async () => null, 10)).toBeNull();
  });
});

describe("fast mode against a model that refuses reasoning_effort", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    vi.unstubAllGlobals();
  });

  it("drops the option, answers, and does not send it again", async () => {
    process.env.GROQ_API_KEY = "test";
    process.env.VERCEL = "1"; // no local Ollama on a serverless host
    process.env.GROQ_API_KEY_MODEL = "test/vision-model";
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        bodies.push(body);
        if ("reasoning_effort" in body) {
          return new Response(JSON.stringify({ error: { message: "reasoning_effort is not supported by this model" } }), { status: 400 });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"items":[{"device":"laptop","count":1,"state":"on"}]}' } }] }), { status: 200 });
      }),
    );
    const a = await describeImagesAny(["data:image/jpeg;base64,AAAA"], "prompt", undefined, { fast: true });
    expect(a.ok).toBe(true);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].reasoning_effort).toBe("none");
    expect(bodies[1].reasoning_effort).toBeUndefined();
    expect(bodies[1].max_tokens).toBe(1500);
    // Groq is asked by prompt alone: no response_format.
    expect(bodies[1].response_format).toBeUndefined();

    const b = await describeImagesAny(["data:image/jpeg;base64,AAAA"], "prompt", undefined, { fast: true });
    expect(b.ok).toBe(true);
    expect(bodies).toHaveLength(3);
    expect(bodies[2].reasoning_effort).toBeUndefined();
  });
});

describe("worthAnotherModel", () => {
  it("moves to the next model on no credit or a busy free pool, not on this key's own limit", () => {
    expect(worthAnotherModel(new Error("HTTP 402 Insufficient credits"), "google/gemini-2.5-flash")).toBe(true);
    expect(worthAnotherModel(new Error("HTTP 429 rate-limited"), "google/gemma-4-31b-it:free")).toBe(true);
    expect(worthAnotherModel(new Error("HTTP 429 temporarily rate-limited upstream"), "x/y")).toBe(true);
    expect(worthAnotherModel(new Error("HTTP 429 Rate limit reached for model"), "qwen/qwen3.8-27b")).toBe(false);
    expect(worthAnotherModel(new Error("HTTP 401 Invalid API Key"), "x:free")).toBe(false);
    expect(worthAnotherModel(new Error("HTTP 503 This model is currently experiencing high demand"), "gemini-3.5-flash")).toBe(true);
    expect(worthAnotherModel(new Error("HTTP 503 Service Unavailable"), "x")).toBe(true);
    expect(worthAnotherModel(new Error("HTTP 500 Internal error"), "x")).toBe(false);
  });
});
