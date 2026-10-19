// The preference boot script, kept free of React so the server layout can
// inline it. lib/prefs.ts holds the store that updates the same attributes.

export const PREFS_KEY = "gw-prefs";

/**
 * Runs inline in <head> before anything renders. Kept as a string so the same
 * logic is used at boot and on every change; it must stay plain ES5-ish and
 * self-contained.
 */
export const APPLY_PREFS_SCRIPT = `(function(){try{var d=document.documentElement;var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"{}")||{};
var dark=p.theme==="dark"||(p.theme!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
d.setAttribute("data-theme",dark?"dark":"light");d.setAttribute("data-theme-pref",p.theme||"system");
d.setAttribute("data-text",p.text||"normal");d.setAttribute("data-motion",p.motion||"system");d.setAttribute("data-palette",p.palette||"default");
d.lang=p.lang==="es"?"es":"en";
["contrast","underline","targets","spacing","focus"].forEach(function(k){if(p[k])d.setAttribute("data-"+k,"");else d.removeAttribute("data-"+k);});
}catch(e){}})();`;

