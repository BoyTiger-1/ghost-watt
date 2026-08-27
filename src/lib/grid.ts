// Regional energy data: what a kilowatt-hour actually costs and emits where you are.
//
// Ghost Watt's defaults used to be US averages for everything. That's fine for a
// demo and wrong for a real building: a school in Vermont running on hydro and one
// in West Virginia running on coal get wildly different carbon numbers off the same
// photo, and their electricity bills differ by a factor of two.
//
// These are representative published state-level figures (EIA commercial retail
// rates; EPA eGRID-derived generation intensity), not live readings. They are a
// better starting point than a national average, and every one of them is still
// editable in the app. For a live number, see providers.ts.

export interface RegionProfile {
  code: string;
  name: string;
  /** Average commercial retail electricity price, USD per kWh. */
  ratePerKwh: number;
  /** Generation carbon intensity, kg CO2e per kWh. */
  co2PerKwh: number;
  /** eGRID subregion this state mostly sits in (informational). */
  subregion: string;
}

export const REGIONS: RegionProfile[] = [
  { code: "AL", name: "Alabama", ratePerKwh: 0.129, co2PerKwh: 0.36, subregion: "SRSO" },
  { code: "AK", name: "Alaska", ratePerKwh: 0.205, co2PerKwh: 0.44, subregion: "AKGD" },
  { code: "AZ", name: "Arizona", ratePerKwh: 0.114, co2PerKwh: 0.35, subregion: "AZNM" },
  { code: "AR", name: "Arkansas", ratePerKwh: 0.099, co2PerKwh: 0.42, subregion: "SRMV" },
  { code: "CA", name: "California", ratePerKwh: 0.250, co2PerKwh: 0.21, subregion: "CAMX" },
  { code: "CO", name: "Colorado", ratePerKwh: 0.114, co2PerKwh: 0.51, subregion: "RMPA" },
  { code: "CT", name: "Connecticut", ratePerKwh: 0.216, co2PerKwh: 0.24, subregion: "NEWE" },
  { code: "DE", name: "Delaware", ratePerKwh: 0.121, co2PerKwh: 0.42, subregion: "RFCE" },
  { code: "DC", name: "District of Columbia", ratePerKwh: 0.145, co2PerKwh: 0.28, subregion: "RFCE" },
  { code: "FL", name: "Florida", ratePerKwh: 0.113, co2PerKwh: 0.39, subregion: "FRCC" },
  { code: "GA", name: "Georgia", ratePerKwh: 0.115, co2PerKwh: 0.34, subregion: "SRSO" },
  { code: "HI", name: "Hawaii", ratePerKwh: 0.395, co2PerKwh: 0.66, subregion: "HIOA" },
  { code: "ID", name: "Idaho", ratePerKwh: 0.092, co2PerKwh: 0.11, subregion: "NWPP" },
  { code: "IL", name: "Illinois", ratePerKwh: 0.112, co2PerKwh: 0.30, subregion: "RFCW" },
  { code: "IN", name: "Indiana", ratePerKwh: 0.116, co2PerKwh: 0.63, subregion: "RFCW" },
  { code: "IA", name: "Iowa", ratePerKwh: 0.104, co2PerKwh: 0.28, subregion: "MROW" },
  { code: "KS", name: "Kansas", ratePerKwh: 0.110, co2PerKwh: 0.34, subregion: "SPNO" },
  { code: "KY", name: "Kentucky", ratePerKwh: 0.111, co2PerKwh: 0.72, subregion: "SRTV" },
  { code: "LA", name: "Louisiana", ratePerKwh: 0.105, co2PerKwh: 0.41, subregion: "SRMV" },
  { code: "ME", name: "Maine", ratePerKwh: 0.175, co2PerKwh: 0.11, subregion: "NEWE" },
  { code: "MD", name: "Maryland", ratePerKwh: 0.130, co2PerKwh: 0.29, subregion: "RFCE" },
  { code: "MA", name: "Massachusetts", ratePerKwh: 0.225, co2PerKwh: 0.35, subregion: "NEWE" },
  { code: "MI", name: "Michigan", ratePerKwh: 0.130, co2PerKwh: 0.44, subregion: "RFCM" },
  { code: "MN", name: "Minnesota", ratePerKwh: 0.117, co2PerKwh: 0.33, subregion: "MROW" },
  { code: "MS", name: "Mississippi", ratePerKwh: 0.113, co2PerKwh: 0.40, subregion: "SRMV" },
  { code: "MO", name: "Missouri", ratePerKwh: 0.101, co2PerKwh: 0.66, subregion: "SRMW" },
  { code: "MT", name: "Montana", ratePerKwh: 0.112, co2PerKwh: 0.42, subregion: "NWPP" },
  { code: "NE", name: "Nebraska", ratePerKwh: 0.096, co2PerKwh: 0.44, subregion: "MROW" },
  { code: "NV", name: "Nevada", ratePerKwh: 0.109, co2PerKwh: 0.31, subregion: "NWPP" },
  { code: "NH", name: "New Hampshire", ratePerKwh: 0.189, co2PerKwh: 0.11, subregion: "NEWE" },
  { code: "NJ", name: "New Jersey", ratePerKwh: 0.154, co2PerKwh: 0.24, subregion: "RFCE" },
  { code: "NM", name: "New Mexico", ratePerKwh: 0.110, co2PerKwh: 0.44, subregion: "AZNM" },
  { code: "NY", name: "New York", ratePerKwh: 0.195, co2PerKwh: 0.21, subregion: "NYUP" },
  { code: "NC", name: "North Carolina", ratePerKwh: 0.099, co2PerKwh: 0.31, subregion: "SRVC" },
  { code: "ND", name: "North Dakota", ratePerKwh: 0.095, co2PerKwh: 0.62, subregion: "MROW" },
  { code: "OH", name: "Ohio", ratePerKwh: 0.107, co2PerKwh: 0.47, subregion: "RFCW" },
  { code: "OK", name: "Oklahoma", ratePerKwh: 0.097, co2PerKwh: 0.36, subregion: "SPSO" },
  { code: "OR", name: "Oregon", ratePerKwh: 0.105, co2PerKwh: 0.13, subregion: "NWPP" },
  { code: "PA", name: "Pennsylvania", ratePerKwh: 0.115, co2PerKwh: 0.32, subregion: "RFCE" },
  { code: "RI", name: "Rhode Island", ratePerKwh: 0.215, co2PerKwh: 0.40, subregion: "NEWE" },
  { code: "SC", name: "South Carolina", ratePerKwh: 0.114, co2PerKwh: 0.26, subregion: "SRVC" },
  { code: "SD", name: "South Dakota", ratePerKwh: 0.102, co2PerKwh: 0.18, subregion: "MROW" },
  { code: "TN", name: "Tennessee", ratePerKwh: 0.117, co2PerKwh: 0.30, subregion: "SRTV" },
  { code: "TX", name: "Texas", ratePerKwh: 0.094, co2PerKwh: 0.38, subregion: "ERCT" },
  { code: "UT", name: "Utah", ratePerKwh: 0.096, co2PerKwh: 0.63, subregion: "NWPP" },
  { code: "VT", name: "Vermont", ratePerKwh: 0.175, co2PerKwh: 0.02, subregion: "NEWE" },
  { code: "VA", name: "Virginia", ratePerKwh: 0.095, co2PerKwh: 0.28, subregion: "SRVC" },
  { code: "WA", name: "Washington", ratePerKwh: 0.099, co2PerKwh: 0.09, subregion: "NWPP" },
  { code: "WV", name: "West Virginia", ratePerKwh: 0.103, co2PerKwh: 0.79, subregion: "RFCW" },
  { code: "WI", name: "Wisconsin", ratePerKwh: 0.124, co2PerKwh: 0.44, subregion: "MROW" },
  { code: "WY", name: "Wyoming", ratePerKwh: 0.100, co2PerKwh: 0.72, subregion: "RMPA" },
];

export const REGION_BY_CODE: Record<string, RegionProfile> = Object.fromEntries(
  REGIONS.map((r) => [r.code, r]),
);

/** US-average fallback, used when no region has been chosen. */
export const US_AVERAGE: RegionProfile = {
  code: "US",
  name: "United States (average)",
  ratePerKwh: 0.15,
  co2PerKwh: 0.385,
  subregion: "US",
};

export function regionOrDefault(code: string | undefined): RegionProfile {
  if (!code) return US_AVERAGE;
  return REGION_BY_CODE[code.toUpperCase()] ?? US_AVERAGE;
}

/** Cleanest and dirtiest grids, for the "where you are matters" comparison. */
export function gridExtremes(): { cleanest: RegionProfile; dirtiest: RegionProfile } {
  const sorted = [...REGIONS].sort((a, b) => a.co2PerKwh - b.co2PerKwh);
  return { cleanest: sorted[0], dirtiest: sorted[sorted.length - 1] };
}
