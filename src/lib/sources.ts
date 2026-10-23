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
    id: "degree-days",
    label: "Annual heating and cooling degree days, base 65 °F",
    publisher: "NOAA NCEI 1991–2020 U.S. Climate Normals, in the pattern of EIA's State Energy Data System",
    year: "1991–2020 normals",
    url: "https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals",
    used: "How much of the year a building is heating and how much it is cooling (lib/climate.ts), which sets the size and the sign of the heating-and-cooling interaction term. Washington: about 4,700 heating and 300 cooling degree days, so a device's waste heat is far more often useful there than it is a burden.",
    caveat:
      "A compiled, population-weighted state table, approximate like the price and carbon tables, and not read from the primary release for this build. It weights a correction of order ±20%, so a few hundred degree days either way moves no headline figure.",
  },
  {
    id: "hvac-interaction",
    label: "Interactive effects between internal loads and HVAC",
    publisher: "Lighting-retrofit and measurement-and-verification practice",
    year: "long-standing",
    url: "https://www.csemag.com/articles/factoring-lighting-into-cooling-loads/",
    used:
      "Every watt a device draws leaves it as heat, so in a cooled space its true cost is its own electricity plus the cooling that removes that heat, and in an electrically heated one part of it comes back. The cooling side is taken as 1/COP at a seasonal COP of 3.2, which is 0.31 - within rounding of the 0.33 cooling adjustment factor long used in retrofit practice, and of the separately reported figure that each kWh saved on lighting saves about another 0.4 kWh on HVAC.",
    caveat:
      "The 0.33 figure is widely used and widely attributed to ASHRAE modelling practice, but it was not verified against an ASHRAE document for this build. The heating credit is deliberately halved (lib/thermal.ts): the cooling penalty is unavoidable, while a credit needs the heat to arrive where somebody wanted it, and the device being costed is one nobody is using in a room nobody is in. Nothing is applied at all until the building states how it is heated and cooled.",
  },
  {
    id: "tou-shaping",
    label: "Commercial time-of-use rate structures",
    publisher: "OpenEI Utility Rate Database, with the hourly period schedules published on each tariff sheet",
    year: "current",
    url: "https://openei.org/wiki/Utility_Rate_Database",
    used:
      "The price in the hours a building is empty, as distinct from the all-hours average. Published commercial on-peak to off-peak ratios run from about 1.3:1 to 3:1, so the gap is worth tens of percent on the only figure this app asks anyone to act on. Which way it goes depends on where the peak window falls against the building's opening hours, so it is computed hour by hour from the sheet rather than assumed.",
    caveat: "Only available when a tariff was looked up from the building's location. A price typed in or taken off a bill is one blended figure, and is not split.",
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
  {
    id: "tech-table",
    label: "Technology and screen-size wattages by device class",
    publisher: "This app (src/lib/tech.ts), from lamp and ballast ratings, ENERGY STAR specifications and manufacturer figures",
    year: "maintained",
    url: "/methodology#tech",
    used:
      "Which member of a device class this one is. A four-lamp T12 troffer with a magnetic ballast draws about 180 W and the LED panel that replaced it about 40 W; both are \"overhead lighting\", and the catalog band spans them both. When the photo shows which it is, that reading is worth more than the class average and more than the model's own guess at a wattage - naming a lamp type is a perceptual judgement a vision model makes well, estimating a wattage is arithmetic it cannot do. Display power is taken as proportional to panel area, fitted to the catalog's own sized rows: a monitor at 0.098 W per square inch, a television at 0.045, an interactive panel at 0.083.",
    caveat:
      "A technology the model names, not one anybody confirmed. It is blended with the published band rather than replacing it, so a misread moves the figure part of the way and never all of it; a plug-in meter reading replaces both.",
  },
];

export const SOURCE_BY_ID: Record<string, Source> = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
