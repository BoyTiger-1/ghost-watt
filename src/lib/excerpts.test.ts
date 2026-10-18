// The homepage and methodology page show real source, with real line numbers.
// This pins them: change the formula and these fail until the excerpt is updated,
// so the page can never show code the app does not run.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEVICES_TS, ENERGY_TS, ENERGY_TS_SHORT, type CodeFile } from "@/components/CodeWindow";

function linesOf(file: string) {
  return readFileSync(join(__dirname, file), "utf-8").split(/\r?\n/);
}

function check(excerpt: CodeFile) {
  const source = linesOf(excerpt.name);
  const shown = excerpt.code.split("\n");
  const start = (excerpt.startLine ?? 1) - 1;
  expect(source.slice(start, start + shown.length)).toEqual(shown);
}

describe("code excerpts match the source they quote", () => {
  it("energy.ts", () => check(ENERGY_TS));
  it("energy.ts (phone)", () => check(ENERGY_TS_SHORT));
  it("devices.ts", () => check(DEVICES_TS));
});
