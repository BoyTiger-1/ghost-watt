// What a photo knows about itself.
//
// A phone writes where and when a picture was taken into the JPEG, and both
// matter to the money: *where* sets the electricity price and the grid's carbon
// (a kWh in Hawaii costs four times one in Idaho), and *when* says whether the
// room was meant to be empty - a projector running at 9pm is waste, the same
// projector at 10am is a lesson. This reads those fields straight out of the
// file in the browser, so the photo itself never has to leave the device for it.
//
// Only the handful of tags the audit uses are read. No dependency: EXIF is a
// TIFF directory inside a JPEG APP1 segment, and walking it is a page of code.

export interface PhotoMeta {
  make?: string;
  model?: string;
  software?: string;
  lens?: string;
  /** EXIF orientation, 1-8. */
  orientation?: number;
  /** "YYYY-MM-DDTHH:MM:SS" in the camera's local time, as written. */
  takenAt?: string;
  /** "+HH:MM", when the camera recorded its UTC offset. */
  offset?: string;
  lat?: number;
  lon?: number;
  altitudeM?: number;
  focalLengthMm?: number;
}

const TAG = {
  make: 0x010f,
  model: 0x0110,
  orientation: 0x0112,
  software: 0x0131,
  dateTime: 0x0132,
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  dateTimeOriginal: 0x9003,
  offsetTimeOriginal: 0x9011,
  focalLength: 0x920a,
  lensModel: 0xa434,
} as const;

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

type Value = string | number | number[];

/** Parse the EXIF block of a JPEG. Returns an empty object for anything else. */
export function readExif(buffer: ArrayBuffer): PhotoMeta {
  try {
    const tiff = findTiff(new DataView(buffer));
    return tiff ? readTiff(tiff.view, tiff.start) : {};
  } catch {
    // A truncated or mangled file is not an error worth surfacing: no metadata.
    return {};
  }
}

function findTiff(view: DataView): { view: DataView; start: number } | null {
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let p = 2;
  while (p + 4 <= view.byteLength) {
    if (view.getUint8(p) !== 0xff) return null;
    const marker = view.getUint8(p + 1);
    // Start of scan: image data follows, no more metadata segments.
    if (marker === 0xda) return null;
    const len = view.getUint16(p + 2);
    if (marker === 0xe1 && p + 10 <= view.byteLength) {
      // "Exif\0\0"
      if (view.getUint32(p + 4) === 0x45786966 && view.getUint16(p + 8) === 0) {
        return { view, start: p + 10 };
      }
    }
    p += 2 + len;
  }
  return null;
}

function readTiff(view: DataView, start: number): PhotoMeta {
  const order = view.getUint16(start);
  const le = order === 0x4949;
  if (!le && order !== 0x4d4d) return {};
  const u16 = (o: number) => view.getUint16(start + o, le);
  const u32 = (o: number) => view.getUint32(start + o, le);
  if (u16(2) !== 42) return {};

  function ifd(offset: number): Map<number, Value> {
    const out = new Map<number, Value>();
    if (offset <= 0 || start + offset + 2 > view.byteLength) return out;
    const n = u16(offset);
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (start + e + 12 > view.byteLength) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = (TYPE_SIZE[type] ?? 0) * count;
      if (!size) continue;
      const at = size <= 4 ? e + 8 : u32(e + 8);
      if (start + at + size > view.byteLength) continue;
      out.set(tag, readValue(type, count, at));
    }
    return out;
  }

  function readValue(type: number, count: number, at: number): Value {
    if (type === 2) {
      let s = "";
      for (let i = 0; i < count; i++) {
        const c = view.getUint8(start + at + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    }
    const vals: number[] = [];
    for (let i = 0; i < count; i++) {
      const o = at + i * TYPE_SIZE[type];
      if (type === 1 || type === 7) vals.push(view.getUint8(start + o));
      else if (type === 3) vals.push(u16(o));
      else if (type === 4) vals.push(u32(o));
      else if (type === 9) vals.push(view.getInt32(start + o, le));
      else if (type === 5) vals.push(u32(o) / (u32(o + 4) || 1));
      else if (type === 10) vals.push(view.getInt32(start + o, le) / (view.getInt32(start + o + 4, le) || 1));
    }
    return count === 1 ? vals[0] : vals;
  }

  const ifd0 = ifd(u32(4));
  const exif = typeof ifd0.get(TAG.exifIfd) === "number" ? ifd(ifd0.get(TAG.exifIfd) as number) : new Map<number, Value>();
  const gps = typeof ifd0.get(TAG.gpsIfd) === "number" ? ifd(ifd0.get(TAG.gpsIfd) as number) : new Map<number, Value>();

  const str = (m: Map<number, Value>, t: number) => {
    const v = m.get(t);
    return typeof v === "string" && v ? v : undefined;
  };
  const num = (m: Map<number, Value>, t: number) => {
    const v = m.get(t);
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };

  const meta: PhotoMeta = {};
  const set = <K extends keyof PhotoMeta>(k: K, v: PhotoMeta[K] | undefined) => {
    if (v !== undefined) meta[k] = v;
  };
  set("make", str(ifd0, TAG.make));
  set("model", str(ifd0, TAG.model));
  set("software", str(ifd0, TAG.software));
  set("orientation", num(ifd0, TAG.orientation));
  set("lens", str(exif, TAG.lensModel));
  set("focalLengthMm", num(exif, TAG.focalLength));
  set("takenAt", exifDate(str(exif, TAG.dateTimeOriginal) ?? str(ifd0, TAG.dateTime)));
  set("offset", str(exif, TAG.offsetTimeOriginal));

  const lat = dms(gps.get(2), str(gps, 1));
  const lon = dms(gps.get(4), str(gps, 3));
  // 0,0 is what some apps write when location is off: the sea off West Africa.
  if (lat !== undefined && lon !== undefined && (lat !== 0 || lon !== 0)) {
    meta.lat = lat;
    meta.lon = lon;
  }
  const alt = num(gps, 6);
  if (alt !== undefined) meta.altitudeM = gps.get(5) === 1 ? -alt : alt;
  return meta;
}

/** "2026:10:14 21:42:07" -> "2026-10-14T21:42:07". */
function exifDate(s: string | undefined): string | undefined {
  const m = s && /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : undefined;
}

/** Degrees, minutes, seconds and a hemisphere letter, as signed decimal degrees. */
function dms(v: Value | undefined, ref: string | undefined): number | undefined {
  if (!Array.isArray(v) || v.length < 3 || v.some((n) => !Number.isFinite(n))) return undefined;
  const deg = v[0] + v[1] / 60 + v[2] / 3600;
  const signed = ref === "S" || ref === "W" ? -deg : deg;
  return Math.round(signed * 1e6) / 1e6;
}

/** Hour of day (0-23) and weekday (0 = Sunday) from a local "takenAt" string. */
export function localClock(takenAt: string): { hour: number; minute: number; weekday: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(takenAt);
  if (!m) return null;
  // Built as UTC so the weekday is the calendar date's, whatever zone runs this.
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return { hour: +m[4], minute: +m[5], weekday: d.getUTCDay() };
}

/** The device's own local time, in the same shape EXIF uses. */
export function nowLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
