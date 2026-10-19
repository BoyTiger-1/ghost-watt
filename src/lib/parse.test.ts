// What the parser has to survive.
//
// A vision model does not reliably return the JSON it was asked for. It returns
// JSON, or JSON wrapped in "Sure! Here's what I found:", or a fenced code block, or
// a paragraph of prose. Every one of those has to end up as the same device rows,
// because the alternative is a scan that silently finds nothing and a user who
// concludes the app is broken.

import { describe, expect, it } from "vitest";
import { matchCategory, parseModelOutput } from "./parse";

describe("matchCategory", () => {
  it("matches on a keyword anywhere in the label", () => {
    expect(matchCategory("two dell monitors")).toBe("monitor");
    expect(matchCategory("MONITOR")).toBe("monitor");
  });

  it("maps every name the vision prompt asks for to the device it means", () => {
    // The prompt hands the model these exact names. "computer monitor" once lost
    // to the desktop keyword "computer", which priced every monitor as a PC.
    const expected: Record<string, string> = {
      "computer monitor": "monitor",
      "desktop computer": "desktop",
      laptop: "laptop",
      projector: "projector",
      smartboard: "smartboard",
      TV: "tv",
      "overhead lights": "ceiling_light",
      "vending machine": "vending_cold",
      refrigerator: "fridge",
      "water cooler": "water_cooler",
      printer: "printer",
      copier: "copier",
      "server rack": "server",
      "window AC unit": "ac_window",
      "space heater": "space_heater",
      "coffee maker": "coffee",
      microwave: "microwave",
    };
    for (const [name, id] of Object.entries(expected)) {
      expect(matchCategory(name), name).toBe(id);
    }
  });

  it("returns null rather than guessing at something unknown", () => {
    expect(matchCategory("a potted plant")).toBeNull();
    expect(matchCategory("")).toBeNull();
  });

  it("prefers the most specific keyword when two categories share a word", () => {
    // Regression: the fridge entry lists "cooler" and is declared before
    // water_cooler, so first-match-wins costed every water cooler as a
    // refrigerator - a different wattage, and therefore a wrong dollar figure on
    // a page someone is asked to act on.
    expect(matchCategory("water cooler")).toBe("water_cooler");
    expect(matchCategory("the water cooler by the office")).toBe("water_cooler");

    // The general term still resolves to the general category.
    expect(matchCategory("cooler")).toBe("fridge");
    expect(matchCategory("mini fridge")).toBe("fridge");
  });

  it("is deterministic for a label that matches nothing longer", () => {
    expect(matchCategory("refrigerator")).toBe(matchCategory("refrigerator"));
  });
});

describe("parseModelOutput", () => {
  const clean = `[
    {"device": "monitor", "count": 3, "state": "on"},
    {"device": "projector", "count": 1, "state": "standby"}
  ]`;

  it("reads clean JSON", () => {
    const rows = parseModelOutput(clean);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ categoryId: "monitor", count: 3, state: "on" });
    expect(rows[1].state).toBe("standby");
  });

  it("reads JSON buried in chatter", () => {
    const rows = parseModelOutput(`Sure! Here is what I can see in the photo:\n\n${clean}\n\nLet me know if you need more detail.`);
    expect(rows).toHaveLength(2);
    expect(rows[0].categoryId).toBe("monitor");
  });

  it("reads JSON inside a fenced code block", () => {
    const rows = parseModelOutput("```json\n" + clean + "\n```");
    expect(rows).toHaveLength(2);
  });

  it("survives nested arrays without stopping at the first bracket", () => {
    const rows = parseModelOutput(
      `[{"device": "monitor", "count": 2, "state": "on", "tags": ["desk", "lab"]}]`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
  });

  it("falls back to prose when there is no JSON at all", () => {
    const rows = parseModelOutput(
      "I can see three monitors left switched on and a projector in standby.",
    );
    const ids = rows.map((r) => r.categoryId);
    expect(ids).toContain("monitor");
    expect(ids).toContain("projector");
    expect(rows.find((r) => r.categoryId === "monitor")!.count).toBe(3);
  });

  it("falls back to prose when the JSON contains nothing recognisable", () => {
    // Valid JSON, zero usable rows - must not be treated as "the room is empty".
    const rows = parseModelOutput(
      `[{"device": "potted plant", "count": 2}] but I also see two monitors on.`,
    );
    expect(rows.map((r) => r.categoryId)).toContain("monitor");
  });

  it("reads number words as well as digits", () => {
    const rows = parseModelOutput("There are two monitors still running.");
    expect(rows[0].count).toBe(2);
  });

  it("defaults an unstated count to one", () => {
    const rows = parseModelOutput("A projector is still warm.");
    expect(rows[0].count).toBe(1);
  });

  it("reads the state out of prose", () => {
    expect(parseModelOutput("The projector is powered down.")[0].state).toBe("off");
    expect(parseModelOutput("The projector is asleep.")[0].state).toBe("standby");
    expect(parseModelOutput("The projector is running.")[0].state).toBe("on");
  });

  it("assumes on when the state is not stated", () => {
    // The conservative reading for an empty building at 4pm, and the one that puts
    // the device in front of a human to confirm rather than dropping it.
    expect(parseModelOutput(`[{"device": "monitor", "count": 1}]`)[0].state).toBe("on");
  });

  it("splits a compound sentence so each device gets its own row", () => {
    const rows = parseModelOutput("Two monitors and one projector are on.");
    expect(new Set(rows.map((r) => r.categoryId))).toEqual(new Set(["monitor", "projector"]));
  });

  it("returns an empty array rather than throwing on junk", () => {
    expect(parseModelOutput("")).toEqual([]);
    expect(parseModelOutput("nothing of interest here")).toEqual([]);
    expect(parseModelOutput("[")).toEqual([]);
    expect(parseModelOutput("[{broken")).toEqual([]);
  });

  it("accepts the alternate key names models use for the device field", () => {
    expect(parseModelOutput(`[{"name": "monitor", "count": 1}]`)[0].categoryId).toBe("monitor");
    expect(parseModelOutput(`[{"label": "monitor", "count": 1}]`)[0].categoryId).toBe("monitor");
  });
});

describe("replies from reasoning models", () => {
  it("ignores <think> blocks and prose before the JSON object", async () => {
    const { parseModelOutput } = await import("./parse");
    const text = `<think>The room has {braces} and "quotes" in my notes.</think>\nHere is the audit: {"items":[{"device":"computer monitor","count":2,"state":"on","visible":true,"where":"desk by the window"}]}`;
    const out = parseModelOutput(text);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(2);
    expect(out[0].evidence).toBe("desk by the window");
  });
});
