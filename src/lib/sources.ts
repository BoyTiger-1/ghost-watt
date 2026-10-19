// Where the numbers come from.
//
// Every figure the app multiplies by - a wattage, an hours-of-use, a price, a
// grid factor - traces to one of these. The Method page lists them, and the
// pieces of the app that use a figure name the source id next to it, so a
// reader can follow any dollar back to a document. Where a figure could not be
// verified against the primary document from this build environment, the entry
// says so rather than implying a precision it does not have.

export interface Source {
  id: string;
  /** Short name, as shown in the UI. */
  label: string;
  publisher: string;
  year: string;
  url: string;
  /** What this app takes from it. */
  used: string;
  /** Anything a careful reader should know about how it is used. */
  caveat?: string;
}

export const SOURCES: Source[] = [
  {
    id: "eia-table4-2024",
    label: "EIA average retail price of electricity by state and sector, 2024",
    publisher: "U.S. Energy Information Administration",
    year: "2024 annual (published 2025)",
    url: "https://www.eia.gov/electricity/sales_revenue_price/",
    used: "The default price per kWh for a home (residential) or a school or office (commercial) in each state. Washington 2024: 11.90 ¢/kWh residential, 9.99 ¢/kWh commercial.",
    caveat: "A state average. Your utility's published tariff (looked up from location) or a line off your bill replaces it, and either is better.",
  },
  {
    id: "egrid",
    label: "EPA eGRID state and subregion output emission rates",
    publisher: "U.S. Environmental Protection Agency",
    year: "eGRID2023 (released 2025)",
    url: "https://www.epa.gov/egrid/summary-data",
    used: "Kilograms of CO₂ per kWh for the state grid a building is on. Washington's grid is mostly hydro, so its factor (about 0.10 kg/kWh) is roughly a quarter of the U.S. average (0.35 kg/kWh) and a third of the Northwest subregion (NWPP, 0.29 kg/kWh); the app uses the Washington state rate, not the national one.",
    caveat: "State output rates are annual averages for the generation located in the state. For the exact decimal of the latest release, read the Washington row of Table 3 in the eGRID summary tables.",
  },
  {
    id: "lbnl-standby",
    label: "Standby power summary table",
    publisher: "Lawrence Berkeley National Laboratory",
    year: "measured 2000s, maintained online",
    url: "https://standby.lbl.gov/data/summary-table/",
    used: "Standby and sleep draw for screens and electronics: an LCD monitor averages 1.4 W asleep and 1.1 W off; a notebook 8.9 W off and 15.8 W asleep (older units); a television 4.5 W in standby (LBNL-42393) to 7.3 W (LBNL-46019).",
    caveat: "Measured on products of their time. Newer electronics generally draw less in standby, so these figures lean high.",
  },
  {
    id: "doe-microwave-standby",
    label: "Microwave oven standby and off mode, engineering analysis",
    publisher: "U.S. Department of Energy (citing LBNL 2008 measurements)",
    year: "2012",
    url: "https://www.federalregister.gov/documents/2013/06/17/2013-13535/energy-conservation-program-energy-conservation-standards-for-standby-mode-and-off-mode-for",
    used: "A microwave's clock and keypad draw about 3.1 W around the clock (range 1.5–5.8 W across 21 units); the app's microwave line is this standby draw, since cooking is brief and intended.",
  },
  {
    id: "pnnl-22182",
    label: "Residential Lighting End-Use Consumption Study",
    publisher: "Pacific Northwest National Laboratory for the U.S. DOE",
    year: "2012",
    url: "https://www.energy.gov/eere/ssl/residential-lighting-end-use-consumption",
    used: "Hours a day a home lamp is actually lit: 1.6 h on average across all U.S. lamps, about 2.3 h in kitchens, under 1 h in hallways, close to 3 h for exterior lamps.",
    caveat: "Living-room, bedroom and home-office hours are set between the cited values (1.6–2.9 h) rather than read from the study's room table.",
  },
  {
    id: "energystar-displays",
    label: "ENERGY STAR Displays specification: typical energy consumption",
    publisher: "U.S. EPA ENERGY STAR",
    year: "Version 8",
    url: "https://www.energystar.gov/products/displays",
    used: "The duty ENERGY STAR assumes for a monitor: 35% of the time on, 65% asleep (its annual-energy formula, 8.76 × (0.35 × P_on + 0.65 × P_sleep)), which is 8.4 hours a day on. Also the efficient-benchmark draw for a modern monitor.",
  },
  {
    id: "energystar-products",
    label: "ENERGY STAR product specifications and certified product lists",
    publisher: "U.S. EPA ENERGY STAR",
    year: "current",
    url: "https://www.energystar.gov/products",
    used: "What an efficient modern unit of each kind draws - the bar every device is graded against, and the replacement option in the savings simulator (LED lamps, ENERGY STAR monitors, televisions, refrigerators).",
  },
  {
    id: "nielsen",
    label: "Nielsen Total Audience Report",
    publisher: "Nielsen",
    year: "recent editions",
    url: "https://www.nielsen.com/",
    used: "Television viewing of roughly 4–5 hours a day per household, used as a home TV's typical in-use hours.",
  },
  {
    id: "catalog",
    label: "Device wattage catalogue",
    publisher: "This app (src/lib/devices.ts)",
    year: "maintained",
    url: "/methodology#table",
    used: "Representative running draw and a published low–high band for each device class, with its source note in the table. The band, not the midpoint, is what the cost ranges come from.",
    caveat: "Representative figures, not nameplate maxima. A plug-in meter reading entered for a device replaces them.",
  },
];

export const SOURCE_BY_ID: Record<string, Source> = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
