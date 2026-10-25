// Every "Sources:" link on the site has to land on a real entry.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SOURCES, SOURCE_BY_ID, SOURCE_GROUPS } from "./sources";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("sources", () => {
  it("have unique ids, a link, and a known group", () => {
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
    const groups = new Set(SOURCE_GROUPS.map((g) => g.id));
    for (const s of SOURCES) {
      expect(s.url, s.id).toMatch(/^(https:\/\/|\/)/);
      expect(groups.has(s.group ?? "figures"), s.id).toBe(true);
    }
  });

  it("every citation on the site points at one", () => {
    const cited = files("src")
      .filter((f) => !f.endsWith(".test.ts"))
      .flatMap((f) => {
        const text = readFileSync(f, "utf8");
        const blocks = [...text.matchAll(/<Cite[\s\S]*?\/>/g)].flatMap((b) => [...b[0].matchAll(/id: "([a-z0-9-]+)"/g)].map((m) => m[1]));
        const links = [...text.matchAll(/methodology#src-([a-z0-9-]+)/g)].map((m) => m[1]);
        return [...blocks, ...links];
      });
    expect(cited.length).toBeGreaterThan(5);
    for (const id of cited) expect(SOURCE_BY_ID[id], id).toBeDefined();
  });
});
