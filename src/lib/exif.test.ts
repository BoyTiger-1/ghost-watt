import { describe, expect, it } from "vitest";
import { localClock, readExif } from "./exif";
import { isOccupiedAt, SCHEDULE_PRESETS } from "./schedule";

type Entry = { tag: number; type: 2 | 3 | 4 | 5; value: string | number | number[] };

/** Build a JPEG holding one EXIF block: IFD0 plus optional Exif and GPS directories. */
function jpegWithExif(ifd0: Entry[], exif: Entry[] = [], gps: Entry[] = [], le = false): ArrayBuffer {
  const bytes: number[] = [];
  const u16 = (v: number) => (le ? [v & 255, (v >> 8) & 255] : [(v >> 8) & 255, v & 255]);
  const u32 = (v: number) =>
    le ? [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255] : [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];

  // Lay out: header(8) | IFD0 | ExifIFD | GPSIFD | data
  const ifdSize = (n: number) => 2 + n * 12 + 4;
  const withPtrs = [...ifd0];
  if (exif.length) withPtrs.push({ tag: 0x8769, type: 4, value: 0 });
  if (gps.length) withPtrs.push({ tag: 0x8825, type: 4, value: 0 });
  const off0 = 8;
  const offExif = off0 + ifdSize(withPtrs.length);
  const offGps = offExif + (exif.length ? ifdSize(exif.length) : 0);
  let dataOff = offGps + (gps.length ? ifdSize(gps.length) : 0);
  for (const e of withPtrs) {
    if (e.tag === 0x8769) e.value = offExif;
    if (e.tag === 0x8825) e.value = offGps;
  }

  const data: number[] = [];
  function encode(e: Entry): { count: number; field: number[] } {
    let raw: number[];
    let count: number;
    if (e.type === 2) {
      raw = [...(e.value as string)].map((c) => c.charCodeAt(0)).concat(0);
      count = raw.length;
    } else if (e.type === 3) {
      raw = u16(e.value as number);
      count = 1;
    } else if (e.type === 4) {
      raw = u32(e.value as number);
      count = 1;
    } else {
      const vals = Array.isArray(e.value) ? e.value : [e.value as number];
      raw = vals.flatMap((v) => [...u32(Math.round(v * 100)), ...u32(100)]);
      count = vals.length;
    }
    if (raw.length <= 4) return { count, field: [...raw, ...Array(4 - raw.length).fill(0)] };
    const at = dataOff + data.length;
    data.push(...raw);
    return { count, field: u32(at) };
  }
  function dir(entries: Entry[]): number[] {
    const out = [...u16(entries.length)];
    for (const e of entries) {
      const { count, field } = encode(e);
      out.push(...u16(e.tag), ...u16(e.type), ...u32(count), ...field);
    }
    return out.concat(u32(0));
  }

  const tiff = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(off0)];
  tiff.push(...dir(withPtrs));
  if (exif.length) tiff.push(...dir(exif));
  if (gps.length) tiff.push(...dir(gps));
  dataOff = tiff.length;
  tiff.push(...data);

  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  bytes.push(0xff, 0xd8, 0xff, 0xe1, ((app1.length + 2) >> 8) & 255, (app1.length + 2) & 255, ...app1, 0xff, 0xda, 0, 2);
  return new Uint8Array(bytes).buffer;
}

describe("readExif", () => {
  const ifd0: Entry[] = [
    { tag: 0x010f, type: 2, value: "Apple" },
    { tag: 0x0110, type: 2, value: "iPhone 16" },
    { tag: 0x0112, type: 3, value: 6 },
  ];
  const exif: Entry[] = [
    { tag: 0x9003, type: 2, value: "2026:10:14 21:42:07" },
    { tag: 0x9011, type: 2, value: "-05:00" },
  ];
  const gps: Entry[] = [
    { tag: 1, type: 2, value: "N" },
    { tag: 2, type: 5, value: [30, 16, 3.6] },
    { tag: 3, type: 2, value: "W" },
    { tag: 4, type: 5, value: [97, 44, 36] },
  ];

  for (const le of [false, true]) {
    it(`reads camera, time and location (${le ? "little" : "big"}-endian)`, () => {
      const meta = readExif(jpegWithExif(ifd0.map((e) => ({ ...e })), exif, gps, le));
      expect(meta.make).toBe("Apple");
      expect(meta.model).toBe("iPhone 16");
      expect(meta.orientation).toBe(6);
      expect(meta.takenAt).toBe("2026-10-14T21:42:07");
      expect(meta.offset).toBe("-05:00");
      expect(meta.lat).toBeCloseTo(30.268, 3);
      expect(meta.lon).toBeCloseTo(-97.7433, 3);
    });
  }

  it("ignores the 0,0 location some apps write when location is off", () => {
    const zero: Entry[] = [
      { tag: 1, type: 2, value: "N" },
      { tag: 2, type: 5, value: [0, 0, 0] },
      { tag: 3, type: 2, value: "E" },
      { tag: 4, type: 5, value: [0, 0, 0] },
    ];
    const meta = readExif(jpegWithExif(ifd0.map((e) => ({ ...e })), [], zero));
    expect(meta.lat).toBeUndefined();
    expect(meta.make).toBe("Apple");
  });

  it("returns nothing, rather than throwing, for non-JPEG or truncated input", () => {
    expect(readExif(new Uint8Array([1, 2, 3, 4]).buffer)).toEqual({});
    const full = new Uint8Array(jpegWithExif(ifd0.map((e) => ({ ...e })), exif, gps));
    expect(() => readExif(full.slice(0, 40).buffer)).not.toThrow();
  });
});

describe("localClock and isOccupiedAt", () => {
  it("reads hour and weekday from a local timestamp", () => {
    // 14 Oct 2026 is a Wednesday.
    expect(localClock("2026-10-14T21:42:07")).toEqual({ hour: 21, minute: 42, weekday: 3 });
    expect(localClock("nonsense")).toBeNull();
  });

  it("knows a school is empty at 9pm and in use at 10am", () => {
    const school = SCHEDULE_PRESETS.find((p) => p.id === "school")!.schedule;
    expect(isOccupiedAt(school, 3, 10)).toBe(true);
    expect(isOccupiedAt(school, 3, 21)).toBe(false);
    expect(isOccupiedAt(school, 0, 10)).toBe(false);
    const always = SCHEDULE_PRESETS.find((p) => p.id === "always_on")!.schedule;
    expect(isOccupiedAt(always, 0, 3)).toBe(true);
  });
});
