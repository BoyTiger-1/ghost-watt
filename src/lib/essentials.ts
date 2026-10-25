// Things whose job is to run all night.
//
// Ghost Watt's waste figure is what a device draws while the building is empty.
// For a projector that is all waste. For the fridge with the staff lunches in it,
// the router the phones run on, an exit sign or a fish tank's filter, running all
// night is the point, so their after-hours draw is counted as needed, not wasted.
// They still get their own fix (consolidate a spare fridge, right-size a server,
// a timer on the tank's light), priced from what they cost to run.
//
// The list is by catalogue id rather than by word, because words mislead: a
// "document camera" is not security equipment, and an "aquarium light" can go on
// a timer. Where it depends on use (a drinks or wine fridge), it stays waste.
// Names the catalogue folds into a main entry ("mini fridge" and "chest freezer"
// are the fridge) are covered by that entry.

/** Catalogue ids that must keep running, with why. */
const NEEDED: Record<string, string> = {};
const add = (why: string, ids: string[]) => ids.forEach((id) => (NEEDED[id] = why));

add("it keeps food cold", [
  "fridge", "walk_in_cooler", "reach_in_cooler", "x_old_refrigerator", "x_commercial_refrigerator", "x_walk_in_cooler",
  "x_ice_cream_freezer", "x_milk_cooler", "x_prep_table_refrigerator", "x_freezer_chest_commercial", "x_display_freezer",
  "x_salad_bar_cooler", "x_flower_cooler",
]);
add("it keeps medicine or samples cold", ["x_lab_refrigerator", "x_lab_freezer", "x_lab_refrigerator_freezer", "x_ultra_low_freezer", "x_vaccine_freezer"]);
add("the network and phones depend on it", [
  "server", "x_server_tower", "x_blade_server", "x_rack_server", "x_time_server", "x_wifi_router", "x_lte_router", "x_modem",
  "x_mesh_wifi_node", "x_network_switch", "x_patch_panel_switch", "x_firewall_appliance", "x_ups_battery_backup", "x_cordless_phone_base",
]);
add("it is safety or security equipment", [
  "security_recorder", "x_security_camera", "x_nvr", "x_alarm_panel", "x_fire_alarm_panel", "x_smoke_detector",
  "x_carbon_monoxide_detector", "x_video_doorbell", "x_vape_detector", "x_gunshot_detector", "x_license_plate_camera",
]);
add("it is required safety lighting", ["exit_sign"]);
add("it is medical equipment", ["x_cpap_machine", "x_oxygen_concentrator", "x_baby_incubator"]);
add("the animals depend on it", ["aquarium", "x_aquarium_filter", "x_heat_mat_terrarium", "x_incubator_egg"]);
add("it runs the heating and cooling", ["x_thermostat"]);

/** Every id on the list, for the test that checks each one is in the catalogue. */
export const NEEDED_IDS = Object.keys(NEEDED);

/**
 * For a device the catalogue has no entry for, the name the model gave it. Only
 * names that cannot mean anything else.
 */
const NEEDED_WORDS: [RegExp, string][] = [
  [/\b(refrigerator|fridge|freezer)\b/i, "it keeps food cold"],
  [/\b(server|router|modem|network switch|access point|firewall)\b/i, "the network and phones depend on it"],
  [/\b(smoke detector|carbon monoxide|alarm panel|security camera|cctv|nvr)\b/i, "it is safety or security equipment"],
  [/\b(exit sign|emergency light)\b/i, "it is required safety lighting"],
  [/\b(cpap|oxygen concentrator)\b/i, "it is medical equipment"],
  [/\b(aquarium (filter|heater|pump)|sump pump)\b/i, "it has to keep running"],
];

/**
 * Why this device's after-hours draw is needed rather than wasted, or null when
 * switching it off at night is the right thing to do.
 */
export function neededAllNight(categoryId: string, label = ""): string | null {
  if (NEEDED[categoryId]) return NEEDED[categoryId];
  if (categoryId === "other_device") for (const [re, why] of NEEDED_WORDS) if (re.test(label)) return why;
  return null;
}
