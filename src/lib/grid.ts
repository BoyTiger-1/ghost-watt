// Regional energy data: what a kilowatt-hour actually costs and emits where you are.
//
// Ghost Watt's defaults used to be US averages for everything. That's fine for a
// demo and wrong for a real building: a school in Vermont running on hydro and one
// in West Virginia running on coal get wildly different carbon numbers off the same
// photo, and their electricity bills differ by a factor of two.
//
// Prices are EIA's published state averages for 2026 so far (Electric Power
// Monthly, Table 5.6.B, January-July 2026 year to date), for both sectors: a
// house pays the residential price, a school or office the commercial one, and
// the two differ by up to 2x in the same state. Carbon is EPA eGRID-derived
// generation intensity. Every figure is still editable in the app, and when the
// building's location is known, providers.ts looks up the serving utility's own
// current tariff instead.

export interface RegionProfile {
  code: string;
  name: string;
  /** Average commercial retail electricity price, USD per kWh. */
  ratePerKwh: number;
  /** Average residential retail electricity price, USD per kWh. */
  residentialPerKwh: number;
  /** Generation carbon intensity, kg CO2e per kWh. */
  co2PerKwh: number;
  /** eGRID subregion this state mostly sits in (informational). */
  subregion: string;
}

export const REGIONS: RegionProfile[] = [
  { code: "AL", name: "Alabama", ratePerKwh: 0.148, residentialPerKwh: 0.165, co2PerKwh: 0.36, subregion: "SRSO" },
  { code: "AK", name: "Alaska", ratePerKwh: 0.229, residentialPerKwh: 0.271, co2PerKwh: 0.44, subregion: "AKGD" },
  { code: "AZ", name: "Arizona", ratePerKwh: 0.121, residentialPerKwh: 0.154, co2PerKwh: 0.35, subregion: "AZNM" },
  { code: "AR", name: "Arkansas", ratePerKwh: 0.115, residentialPerKwh: 0.136, co2PerKwh: 0.42, subregion: "SRMV" },
  { code: "CA", name: "California", ratePerKwh: 0.264, residentialPerKwh: 0.333, co2PerKwh: 0.21, subregion: "CAMX" },
  { code: "CO", name: "Colorado", ratePerKwh: 0.133, residentialPerKwh: 0.167, co2PerKwh: 0.51, subregion: "RMPA" },
  { code: "CT", name: "Connecticut", ratePerKwh: 0.221, residentialPerKwh: 0.280, co2PerKwh: 0.24, subregion: "NEWE" },
  { code: "DE", name: "Delaware", ratePerKwh: 0.139, residentialPerKwh: 0.179, co2PerKwh: 0.42, subregion: "RFCE" },
  { code: "DC", name: "District of Columbia", ratePerKwh: 0.236, residentialPerKwh: 0.247, co2PerKwh: 0.28, subregion: "RFCE" },
  { code: "FL", name: "Florida", ratePerKwh: 0.118, residentialPerKwh: 0.153, co2PerKwh: 0.39, subregion: "FRCC" },
  { code: "GA", name: "Georgia", ratePerKwh: 0.117, residentialPerKwh: 0.154, co2PerKwh: 0.34, subregion: "SRSO" },
  { code: "HI", name: "Hawaii", ratePerKwh: 0.422, residentialPerKwh: 0.463, co2PerKwh: 0.66, subregion: "HIOA" },
  { code: "ID", name: "Idaho", ratePerKwh: 0.097, residentialPerKwh: 0.130, co2PerKwh: 0.11, subregion: "NWPP" },
  { code: "IL", name: "Illinois", ratePerKwh: 0.140, residentialPerKwh: 0.192, co2PerKwh: 0.30, subregion: "RFCW" },
  { code: "IN", name: "Indiana", ratePerKwh: 0.139, residentialPerKwh: 0.170, co2PerKwh: 0.63, subregion: "RFCW" },
  { code: "IA", name: "Iowa", ratePerKwh: 0.113, residentialPerKwh: 0.142, co2PerKwh: 0.28, subregion: "MROW" },
  { code: "KS", name: "Kansas", ratePerKwh: 0.117, residentialPerKwh: 0.152, co2PerKwh: 0.34, subregion: "SPNO" },
  { code: "KY", name: "Kentucky", ratePerKwh: 0.127, residentialPerKwh: 0.143, co2PerKwh: 0.72, subregion: "SRTV" },
  { code: "LA", name: "Louisiana", ratePerKwh: 0.119, residentialPerKwh: 0.134, co2PerKwh: 0.41, subregion: "SRMV" },
  { code: "ME", name: "Maine", ratePerKwh: 0.231, residentialPerKwh: 0.300, co2PerKwh: 0.11, subregion: "NEWE" },
  { code: "MD", name: "Maryland", ratePerKwh: 0.172, residentialPerKwh: 0.213, co2PerKwh: 0.29, subregion: "RFCE" },
  { code: "MA", name: "Massachusetts", ratePerKwh: 0.247, residentialPerKwh: 0.301, co2PerKwh: 0.35, subregion: "NEWE" },
  { code: "MI", name: "Michigan", ratePerKwh: 0.157, residentialPerKwh: 0.215, co2PerKwh: 0.44, subregion: "RFCM" },
  { code: "MN", name: "Minnesota", ratePerKwh: 0.125, residentialPerKwh: 0.163, co2PerKwh: 0.33, subregion: "MROW" },
  { code: "MS", name: "Mississippi", ratePerKwh: 0.141, residentialPerKwh: 0.152, co2PerKwh: 0.40, subregion: "SRMV" },
  { code: "MO", name: "Missouri", ratePerKwh: 0.109, residentialPerKwh: 0.140, co2PerKwh: 0.66, subregion: "SRMW" },
  { code: "MT", name: "Montana", ratePerKwh: 0.128, residentialPerKwh: 0.140, co2PerKwh: 0.42, subregion: "NWPP" },
  { code: "NE", name: "Nebraska", ratePerKwh: 0.089, residentialPerKwh: 0.129, co2PerKwh: 0.44, subregion: "MROW" },
  { code: "NV", name: "Nevada", ratePerKwh: 0.093, residentialPerKwh: 0.135, co2PerKwh: 0.31, subregion: "NWPP" },
  { code: "NH", name: "New Hampshire", ratePerKwh: 0.215, residentialPerKwh: 0.268, co2PerKwh: 0.11, subregion: "NEWE" },
  { code: "NJ", name: "New Jersey", ratePerKwh: 0.178, residentialPerKwh: 0.240, co2PerKwh: 0.24, subregion: "RFCE" },
  { code: "NM", name: "New Mexico", ratePerKwh: 0.107, residentialPerKwh: 0.151, co2PerKwh: 0.44, subregion: "AZNM" },
  { code: "NY", name: "New York", ratePerKwh: 0.229, residentialPerKwh: 0.294, co2PerKwh: 0.21, subregion: "NYUP" },
  { code: "NC", name: "North Carolina", ratePerKwh: 0.106, residentialPerKwh: 0.149, co2PerKwh: 0.31, subregion: "SRVC" },
  { code: "ND", name: "North Dakota", ratePerKwh: 0.077, residentialPerKwh: 0.124, co2PerKwh: 0.62, subregion: "MROW" },
  { code: "OH", name: "Ohio", ratePerKwh: 0.138, residentialPerKwh: 0.187, co2PerKwh: 0.47, subregion: "RFCW" },
  { code: "OK", name: "Oklahoma", ratePerKwh: 0.091, residentialPerKwh: 0.136, co2PerKwh: 0.36, subregion: "SPSO" },
  { code: "OR", name: "Oregon", ratePerKwh: 0.106, residentialPerKwh: 0.154, co2PerKwh: 0.13, subregion: "NWPP" },
  { code: "PA", name: "Pennsylvania", ratePerKwh: 0.140, residentialPerKwh: 0.210, co2PerKwh: 0.32, subregion: "RFCE" },
  { code: "RI", name: "Rhode Island", ratePerKwh: 0.237, residentialPerKwh: 0.292, co2PerKwh: 0.40, subregion: "NEWE" },
  { code: "SC", name: "South Carolina", ratePerKwh: 0.119, residentialPerKwh: 0.159, co2PerKwh: 0.26, subregion: "SRVC" },
  { code: "SD", name: "South Dakota", ratePerKwh: 0.117, residentialPerKwh: 0.145, co2PerKwh: 0.18, subregion: "MROW" },
  { code: "TN", name: "Tennessee", ratePerKwh: 0.137, residentialPerKwh: 0.139, co2PerKwh: 0.30, subregion: "SRTV" },
  { code: "TX", name: "Texas", ratePerKwh: 0.086, residentialPerKwh: 0.161, co2PerKwh: 0.38, subregion: "ERCT" },
  { code: "UT", name: "Utah", ratePerKwh: 0.104, residentialPerKwh: 0.132, co2PerKwh: 0.63, subregion: "NWPP" },
  { code: "VT", name: "Vermont", ratePerKwh: 0.209, residentialPerKwh: 0.239, co2PerKwh: 0.02, subregion: "NEWE" },
  { code: "VA", name: "Virginia", ratePerKwh: 0.112, residentialPerKwh: 0.168, co2PerKwh: 0.28, subregion: "SRVC" },
  { code: "WA", name: "Washington", ratePerKwh: 0.119, residentialPerKwh: 0.144, co2PerKwh: 0.09, subregion: "NWPP" },
  { code: "WV", name: "West Virginia", ratePerKwh: 0.116, residentialPerKwh: 0.155, co2PerKwh: 0.79, subregion: "RFCW" },
  { code: "WI", name: "Wisconsin", ratePerKwh: 0.137, residentialPerKwh: 0.190, co2PerKwh: 0.44, subregion: "MROW" },
  { code: "WY", name: "Wyoming", ratePerKwh: 0.098, residentialPerKwh: 0.140, co2PerKwh: 0.72, subregion: "RMPA" },
];

export const REGION_BY_CODE: Record<string, RegionProfile> = Object.fromEntries(
  REGIONS.map((r) => [r.code, r]),
);

/** US-average fallback, used when no region has been chosen. */
export const US_AVERAGE: RegionProfile = {
  code: "US",
  name: "United States (average)",
  ratePerKwh: 0.140,
  residentialPerKwh: 0.182,
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

/** Where the price tables come from, for the methodology page and the UI. */
export const RATE_TABLE_SOURCE = "EIA Electric Power Monthly, Table 5.6.B (2026 year to date, through July)";

/** The state average a building of this kind pays: residential for a home, commercial otherwise. */
export function regionRate(region: RegionProfile, sector: "residential" | "commercial"): number {
  return sector === "residential" ? region.residentialPerKwh : region.ratePerKwh;
}
