// Occupancy modelling: how many hours a year is this building actually empty?
//
// The original model took a single number (6,800 hours) on faith. That number is
// doing an enormous amount of work - every dollar figure scales linearly with it -
// so it deserves to be derived rather than asserted.
//
// Here you describe the building the way a caretaker would (opens at 7, closes at
// 4, open half-day Saturday, shut for 12 weeks of holidays) and the unoccupied
// hours fall out of it. Same arithmetic, but now it is auditable and arguable.

export interface WeeklySchedule {
  /** Occupied hours for each weekday, index 0 = Sunday. */
  hoursPerDay: [number, number, number, number, number, number, number];
  /** Weeks per year the building runs this schedule (rest are closed entirely). */
  operatingWeeks: number;
  /** Extra full days closed inside operating weeks (snow days, holidays). */
  closedDays: number;
}

export const HOURS_PER_YEAR = 8760;

export interface SchedulePreset {
  id: string;
  label: string;
  description: string;
  schedule: WeeklySchedule;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  {
    id: "school",
    label: "K-12 school",
    description: "7am-4pm weekdays, 38 teaching weeks, closed weekends and holidays.",
    schedule: { hoursPerDay: [0, 9, 9, 9, 9, 9, 2], operatingWeeks: 38, closedDays: 10 },
  },
  {
    id: "school_extended",
    label: "School with evening use",
    description: "Daytime teaching plus evening activities and community lettings.",
    schedule: { hoursPerDay: [2, 13, 13, 13, 13, 12, 6], operatingWeeks: 42, closedDays: 8 },
  },
  {
    id: "office",
    label: "Office",
    description: "9-6 weekdays, 50 working weeks, closed weekends.",
    schedule: { hoursPerDay: [0, 9, 9, 9, 9, 9, 0], operatingWeeks: 50, closedDays: 10 },
  },
  {
    id: "retail",
    label: "Retail / storefront",
    description: "Open seven days, long trading hours, closed a handful of holidays.",
    schedule: { hoursPerDay: [8, 11, 11, 11, 11, 11, 11], operatingWeeks: 52, closedDays: 4 },
  },
  {
    id: "library",
    label: "Library / civic building",
    description: "Public opening hours six days a week.",
    schedule: { hoursPerDay: [0, 9, 9, 9, 9, 8, 5], operatingWeeks: 50, closedDays: 12 },
  },
  {
    id: "church",
    label: "Place of worship / community hall",
    description: "Heavy weekend use, intermittent weekday bookings.",
    schedule: { hoursPerDay: [8, 3, 3, 3, 3, 3, 4], operatingWeeks: 52, closedDays: 0 },
  },
  {
    id: "home",
    label: "Home",
    description: "Occupied most evenings and weekends; empty during the working day.",
    schedule: { hoursPerDay: [16, 14, 14, 14, 14, 14, 16], operatingWeeks: 52, closedDays: 0 },
  },
  {
    id: "always_on",
    label: "24/7 facility",
    description: "Never unoccupied - only true standby waste counts.",
    schedule: { hoursPerDay: [24, 24, 24, 24, 24, 24, 24], operatingWeeks: 52, closedDays: 0 },
  },
];

export const SCHEDULE_BY_ID: Record<string, SchedulePreset> = Object.fromEntries(
  SCHEDULE_PRESETS.map((p) => [p.id, p]),
);

/** Occupied hours per year implied by a weekly schedule. */
export function occupiedHours(s: WeeklySchedule): number {
  const perWeek = s.hoursPerDay.reduce((a, b) => a + b, 0);
  const averageDay = perWeek / 7;
  const gross = perWeek * s.operatingWeeks;
  const closedLoss = averageDay * s.closedDays;
  return Math.max(0, Math.min(HOURS_PER_YEAR, gross - closedLoss));
}

/** The hours that phantom load is actually wasted. */
export function unoccupiedHours(s: WeeklySchedule): number {
  return Math.max(0, HOURS_PER_YEAR - occupiedHours(s));
}

/** Share of the year the building sits empty, 0-1. */
export function vacancyFraction(s: WeeklySchedule): number {
  return unoccupiedHours(s) / HOURS_PER_YEAR;
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** A readable one-line summary, e.g. "9h weekdays, 38 weeks - 6,842 h empty". */
export function describeSchedule(s: WeeklySchedule): string {
  const empty = Math.round(unoccupiedHours(s)).toLocaleString();
  const weekdayHours = s.hoursPerDay[1];
  return `${weekdayHours}h weekdays, ${s.operatingWeeks} weeks - ${empty} h empty`;
}
