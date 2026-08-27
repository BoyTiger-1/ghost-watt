// What the parser has to survive.
//
// A vision model does not reliably return the JSON it was asked for. It returns
// JSON, or JSON wrapped in "Sure! Here's what I found:", or a fenced code block, or
// a paragraph of prose. Every one of those has to end up as the same device rows,
// because the alternative is a scan that silently finds nothing and a user who
// concludes the app is broken.

import { describe, expect, it } from "vitest";
import { fallbackObservations, matchCategory, parseModelOutput, ROOM_TYPES } from "./parse";
import { CATALOG_BY_ID } from "./devices";

describe("matchCategory", () => {
  it("matches on a keyword anywhere in the label", () => {
    expect(matchCategory("two dell monitors")).toBe("monitor");
    expect(matchCategory("MONITOR")).toBe("monitor");
  });

  it("returns null rather than guessing at something unknown", () => {
    expect(matchCategory("a potted plant")).toBeNull();
    expect(matchCategory("")).toBeNull();
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

describe("room-type fallbacks", () => {
  it("gives every preset a set of observations that all resolve to real categories", () => {
    // The no-photo path is what a user without a vision model sees, so a typo in a
    // preset id would silently produce an empty audit for them and nobody else.
    for (const room of ROOM_TYPES) {
      const rows = fallbackObservations(room.id);
      expect(rows.length, `${room.id} produced no observations`).toBeGreaterThan(0);
      for (const r of rows) {
        expect(CATALOG_BY_ID[r.categoryId], `${room.id} -> ${r.categoryId}`).toBeDefined();
      }
    }
  });

  it("falls back to the generic profile for a room type it does not know", () => {
    // Deliberately not an empty array: someone who picks an odd room type should
    // still get an estimate to argue with, not a blank screen that reads as a bug.
    expect(fallbackObservations("submarine")).toEqual(fallbackObservations("unknown"));
  });

  it("has the generic profile the fallback path depends on", () => {
    // fallbackObservations dereferences ROOM_TYPE_BY_ID["unknown"] directly, so
    // renaming that preset would throw on every unrecognised room type.
    expect(ROOM_TYPES.some((r) => r.id === "unknown")).toBe(true);
    expect(fallbackObservations("unknown").length).toBeGreaterThan(0);
  });
});
