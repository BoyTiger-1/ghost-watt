// What kind of room it is, and what that says about how long things run.
//
// A monitor in a classroom is used during lessons; the same monitor in a
// bedroom is used a couple of hours in the evening; in an office all day. The
// room type sets the typical hours a day each kind of device is actually in
// use, which is what separates "what this costs to own" from "what leaving it
// on after hours costs". Hours are representative published figures, each
// tagged with the source it comes from (lib/sources.ts), or marked as the
// app's own estimate where no published room-level figure exists.

import type { UsageContext } from "./usage";

export type RoomTypeId =
  | "classroom"
  | "computer_lab"
  | "office"
  | "bedroom"
  | "kitchen"
  | "living_room"
  | "hallway"
  | "bathroom"
  | "break_room"
  | "gym"
  | "other";

export interface RoomHours {
  /** Hours a day in active use. */
  hours: number;
  /** Source id from lib/sources.ts, or "estimate" for the app's own figure. */
  source: string;
}

export interface RoomType {
  id: RoomTypeId;
  label: string;
  /** Home, school or office: picks the price sector and the schedule when the building has none. */
  context: UsageContext;
  /** Hours by catalog category id, then by device group as "group:<name>". Anything else falls back to the context profile. */
  hours: Record<string, RoomHours>;
}

const est = (hours: number): RoomHours => ({ hours, source: "estimate" });
const pnnl = (hours: number): RoomHours => ({ hours, source: "pnnl-22182" });
const estar = (hours: number): RoomHours => ({ hours, source: "energystar-displays" });
const nielsen = (hours: number): RoomHours => ({ hours, source: "nielsen" });

export const ROOM_TYPES: RoomType[] = [
  {
    id: "classroom",
    label: "Classroom",
    context: "school",
    hours: {
      "group:lighting": est(7),
      projector: est(3),
      smartboard: est(4),
      monitor: est(5),
      desktop: est(5),
      laptop: est(3),
    },
  },
  {
    id: "computer_lab",
    label: "Computer lab",
    context: "school",
    hours: { "group:lighting": est(7), monitor: est(6), desktop: est(6), laptop: est(4), projector: est(2), printer: est(0.5) },
  },
  {
    id: "office",
    label: "Office",
    context: "office",
    hours: { "group:lighting": est(9), monitor: estar(8.4), desktop: est(8.5), laptop: est(8), printer: est(0.4), copier: est(0.7), tv: est(1) },
  },
  {
    id: "bedroom",
    label: "Bedroom",
    context: "home",
    hours: { "group:lighting": pnnl(1.6), tv: nielsen(2), monitor: est(3), desktop: est(3), laptop: est(3), fan: est(6) },
  },
  {
    id: "kitchen",
    label: "Kitchen",
    context: "home",
    hours: { "group:lighting": pnnl(2.3), microwave: est(0.17), coffee: est(0.3), tv: nielsen(1.5), monitor: est(1), laptop: est(1.5) },
  },
  {
    id: "living_room",
    label: "Living room",
    context: "home",
    hours: { "group:lighting": pnnl(2.9), tv: nielsen(4.5), monitor: est(2), laptop: est(2.5), desktop: est(2) },
  },
  {
    id: "hallway",
    label: "Hallway / corridor",
    context: "school",
    hours: { "group:lighting": pnnl(0.9) },
  },
  {
    id: "bathroom",
    label: "Bathroom",
    context: "home",
    hours: { "group:lighting": pnnl(1.8), exhaust_fan: est(1), hand_dryer: est(0.3) },
  },
  {
    id: "break_room",
    label: "Break room / staff room",
    context: "office",
    hours: { "group:lighting": est(9), microwave: est(0.5), coffee: est(2), tv: est(2) },
  },
  {
    id: "gym",
    label: "Gym / large hall",
    context: "school",
    hours: { "group:lighting": est(8), scoreboard: est(1), pa_amplifier: est(1) },
  },
  {
    id: "other",
    label: "Other / not sure",
    context: "school",
    hours: {},
  },
];

export const ROOM_TYPE_BY_ID: Record<string, RoomType> = Object.fromEntries(ROOM_TYPES.map((r) => [r.id, r]));

export function roomType(id: string | undefined): RoomType {
  return (id && ROOM_TYPE_BY_ID[id]) || ROOM_TYPE_BY_ID.other;
}

/** The room's own hours for a category or its group, if it states any. */
export function roomHours(room: RoomType, categoryId: string, group: string | undefined): RoomHours | null {
  return room.hours[categoryId] ?? (group ? room.hours[`group:${group}`] : undefined) ?? null;
}
