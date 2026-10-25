import { describe, expect, it } from "vitest";
import { CATALOG_BY_ID } from "./devices";
import { NEEDED_IDS, neededAllNight } from "./essentials";

describe("things that run all night on purpose", () => {
  it("every listed id is in the catalogue", () => {
    expect(NEEDED_IDS.filter((id) => !CATALOG_BY_ID[id])).toEqual([]);
  });

  it("tells needed from wasteful", () => {
    expect(neededAllNight("fridge")).toBeTruthy();
    expect(neededAllNight("server")).toBeTruthy();
    expect(neededAllNight("x_smoke_detector")).toBeTruthy();
    expect(neededAllNight("projector")).toBeNull();
    expect(neededAllNight("x_document_camera")).toBeNull();
    // An unrecognised device is judged by the name the model gave it.
    expect(neededAllNight("other_device", "Wi-Fi router")).toBeTruthy();
    expect(neededAllNight("other_device", "label maker")).toBeNull();
  });
});
