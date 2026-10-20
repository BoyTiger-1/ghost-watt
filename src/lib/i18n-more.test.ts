// Every language must cover every phrase: a missing one silently shows English
// in the middle of a translated screen, which reads as broken.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LANG_NAMES, LANG_TAGS, MORE_LANGS } from "./i18n-more";
import { translate } from "./i18n";

const keys = [...readFileSync(join(__dirname, "i18n.ts"), "utf-8").matchAll(/^  "([A-Za-z0-9_.]+)":/gm)].map((m) => m[1]);

describe("more languages", () => {
  it("finds the phrase list", () => expect(keys.length).toBeGreaterThan(150));

  for (const [lang, table] of Object.entries(MORE_LANGS)) {
    it(`${lang} translates every phrase, and none is left blank`, () => {
      const missing = keys.filter((k) => !(table as Record<string, string>)[k]?.trim());
      expect(missing).toEqual([]);
    });
  }

  it("names and tags every language", () => {
    for (const l of Object.keys(LANG_NAMES)) expect(LANG_TAGS[l as keyof typeof LANG_TAGS]).toBeTruthy();
    expect(Object.keys(LANG_NAMES)).toHaveLength(9);
  });

  it("looks up the right language and falls back to English", () => {
    expect(translate("fr", "tab.devices")).toBe("Appareils");
    expect(translate("ko", "nav.scanner")).toBe("스캐너");
    expect(translate("es", "nav.scanner")).toBe("Escáner");
    expect(translate("en", "nav.scanner")).toBe("Scanner");
  });
});
