import { describe, expect, it } from "vitest";
import { KeyPool, firstKey, keysFromEnv } from "./keypool";

describe("keysFromEnv", () => {
  it("reads a comma list and numbered extras, without duplicates", () => {
    const env = { GROQ_API_KEY: "a, b", GROQ_API_KEY_2: "c", GROQ_API_KEY_3: "a", GROQ_API_KEY_9: " d " };
    expect(keysFromEnv("GROQ_API_KEY", env)).toEqual(["a", "b", "c", "d"]);
  });

  it("is empty when nothing is set", () => {
    expect(keysFromEnv("GROQ_API_KEY", {})).toEqual([]);
  });
});

describe("KeyPool", () => {
  it("takes turns", () => {
    const p = new KeyPool(["a", "b", "c"]);
    expect([p.next(0), p.next(0), p.next(0), p.next(0)]).toEqual(["a", "b", "c", "a"]);
  });

  it("skips a rate-limited key until its rest is over", () => {
    const p = new KeyPool(["a", "b"]);
    p.rest("a", 10_000, 0);
    expect([p.next(1000), p.next(1000)]).toEqual(["b", "b"]);
    expect(p.next(11_000)).toBe("a");
  });

  it("moves to another key straight after a 429", () => {
    const p = new KeyPool(["a", "b", "c"]);
    const first = p.next(0)!;
    p.rest(first, 9000, 0);
    expect(p.hasFree(0, first)).toBe(true);
    expect(p.next(0, first)).not.toBe(first);
  });

  it("when every key rests, offers the one that wakes first", () => {
    const p = new KeyPool(["a", "b"]);
    p.rest("a", 9000, 0);
    p.rest("b", 2000, 0);
    expect(p.hasFree(0)).toBe(false);
    expect(p.next(0)).toBe("b");
  });

  it("benches a refused key for ten minutes", () => {
    const p = new KeyPool(["bad", "good"]);
    p.refuse("bad", 0);
    expect(p.next(5 * 60_000)).toBe("good");
    expect(p.next(5 * 60_000)).toBe("good");
  });
});

describe("firstKey", () => {
  it("gives a one-key service the first key of a list, not the whole list", () => {
    expect(firstKey("EIA_API_KEY", { EIA_API_KEY: "abc, def" })).toBe("abc");
    expect(firstKey("EIA_API_KEY", { EIA_API_KEY: "abc" })).toBe("abc");
    expect(firstKey("EIA_API_KEY", {})).toBeUndefined();
  });
});
