// Two languages for the core flow.
//
// The scanner, its results, the plan, the status pill and the navigation read
// in English or Spanish; the long-form pages (Method, Privacy, Terms) stay in
// English and say so. Strings live here in one table so a missing translation
// shows up as the English text rather than a blank.

import { usePrefs, type Lang } from "./prefs";

const STRINGS = {
  // navigation
  "nav.scanner": ["Scanner", "Escáner"],
  "nav.rooms": ["Rooms", "Salas"],
  "nav.brief": ["Brief", "Informe"],
  "nav.buildings": ["Buildings", "Edificios"],
  "nav.method": ["Method", "Método"],
  "nav.settings": ["Settings", "Ajustes"],
  "nav.accessibility": ["Accessibility", "Accesibilidad"],
  "nav.skip": ["Skip to content", "Saltar al contenido"],
  "nav.home": ["Ghost Watt home", "Inicio de Ghost Watt"],
  // engine pill
  "engine.offline": ["Offline · on-device", "Sin conexión · en el dispositivo"],
  "engine.enhanced": ["Enhanced (cloud)", "Mejorado (nube)"],
  "engine.checking": ["Checking…", "Comprobando…"],
  "engine.ondevice": ["On-device", "En el dispositivo"],
  "engine.offline.detail": [
    "No connection. Scans are read by the detector in this browser and nothing is uploaded. Cloud reading resumes when you are back online.",
    "Sin conexión. Las fotos las lee el detector de este navegador y nada se sube. La lectura en la nube vuelve cuando haya conexión.",
  ],
  "engine.enhanced.detail": [
    "Photos you scan are sent to the vision model to be read, then discarded. Nothing else leaves the device.",
    "Las fotos que escaneas se envían al modelo de visión para leerlas y luego se descartan. Nada más sale del dispositivo.",
  ],
  "engine.checking.detail": ["Finding out whether a cloud model is available.", "Comprobando si hay un modelo en la nube disponible."],
  "engine.ondevice.detail": [
    "Scans are read by the detector in this browser and nothing is uploaded.",
    "Las fotos las lee el detector de este navegador y nada se sube.",
  ],
  "engine.mode": ["Reading mode", "Modo de lectura"],
  "engine.pick.enhanced": ["Enhanced (cloud)", "Mejorado (nube)"],
  "engine.pick.enhanced.what": [
    "Each photo you scan is sent to the vision model to be read, then discarded. Finds the most devices and judges on, standby or off.",
    "Cada foto que escaneas se envía al modelo de visión para leerla y luego se descarta. Encuentra más aparatos y distingue encendido, en espera o apagado.",
  ],
  "engine.pick.ondevice": ["On-device only", "Solo en el dispositivo"],
  "engine.pick.ondevice.what": [
    "Pictures never leave this phone or computer. A small detector finds screens, laptops, common appliances and lit fixtures; it misses the rest.",
    "Las imágenes nunca salen de este teléfono u ordenador. Un detector pequeño encuentra pantallas, portátiles, electrodomésticos comunes y luces encendidas; el resto se le escapa.",
  ],
  "engine.needs.connection": ["Needs a connection", "Necesita conexión"],
  "engine.not.configured": ["Not configured on this deployment", "No está configurado en esta instalación"],
  "engine.footnote": [
    "Costs, fixes and everything saved stay in this browser in both modes. See",
    "Costes, arreglos y todo lo guardado se quedan en este navegador en ambos modos. Ver",
  ],
  "engine.privacy": ["Privacy", "Privacidad"],
  // scanner
  "scan.title": ["Point at the building.", "Apunta al edificio."],
  "scan.accent": ["See what it's costing you.", "Mira lo que te cuesta."],
  "scan.intro": [
    "Point the camera at a room, or add a photo. Every powered device is found, costed at your rate, and matched to the fix that pays back first.",
    "Apunta la cámara a una sala o añade una foto. Cada aparato encendido se encuentra, se valora a tu tarifa y se empareja con el arreglo que antes se amortiza.",
  ],
  "scan.how": ["How the numbers work", "Cómo se calculan los números"],
  "scan.camera": ["Camera", "Cámara"],
  "scan.upload": ["Upload", "Subir"],
  "scan.scanning": ["Scanning a", "Escaneando"],
  "scan.home": ["Home", "Casa"],
  "scan.school": ["School", "Escuela"],
  "scan.office": ["Office", "Oficina"],
  "scan.captures": ["captures", "capturas"],
  "scan.clear": ["Clear", "Borrar"],
  "scan.empty.camera": [
    "Take a photo or record a walkthrough. Each one shows up here as it's analysed, and is saved as a room of this building.",
    "Haz una foto o graba un recorrido. Cada uno aparece aquí al analizarse y se guarda como una sala de este edificio.",
  ],
  "scan.empty.upload": [
    "Photos and videos you add show up here as they're analysed, and are saved as rooms of this building.",
    "Las fotos y vídeos que añadas aparecen aquí al analizarse y se guardan como salas de este edificio.",
  ],
  "tab.offenders": ["Offenders", "Culpables"],
  "tab.plan": ["Plan", "Plan"],
  "tab.grid": ["Grid", "Red"],
  "tab.context": ["Context", "Contexto"],
  "empty.reading": ["Reading your capture…", "Leyendo tu captura…"],
  "empty.none": ["No audit yet", "Aún no hay auditoría"],
  "empty.reading.sub": ["Ranked offenders appear here as each capture finishes.", "Los culpables ordenados aparecen aquí cuando termina cada captura."],
  "empty.none.sub": ["Ranked offenders, costs and fixes appear here.", "Aquí aparecen los culpables ordenados, costes y arreglos."],
  // totals
  "totals.eyebrow": ["after-hours waste", "desperdicio fuera de horario"],
  "totals.captures": ["captures", "capturas"],
  "totals.capture": ["capture", "captura"],
  "totals.analysing": ["analysing…", "analizando…"],
  "totals.wasted": ["/ yr wasted after hours", "/ año desperdiciado fuera de horario"],
  "totals.co2": ["CO₂ / year", "CO₂ / año"],
  "totals.energy": ["energy / year", "energía / año"],
  "totals.recoverable": ["recoverable / yr", "recuperable / año"],
  "totals.best": ["Best estimate", "Mejor estimación"],
  "totals.year.between": ["a year; likely between", "al año; probablemente entre"],
  "totals.and": ["and", "y"],
  "totals.range": ["80% range", "rango del 80%"],
  "totals.after.hours.explain.home": [
    "wasted after hours: what the devices draw through the hours the house is empty or asleep, in the state they are in then",
    "desperdicio fuera de horario: lo que consumen los aparatos mientras la casa está vacía o durmiendo, en el estado en que quedan",
  ],
  "totals.after.hours.explain": [
    "wasted after hours: what the devices draw through the hours the building is empty, in the state they are in then",
    "desperdicio fuera de horario: lo que consumen los aparatos mientras el edificio está vacío, en el estado en que quedan",
  ],
  "totals.typical.explain": [
    "at typical use for this kind of room: hours actually in use, standby the rest",
    "en uso normal para este tipo de sala: horas realmente en uso, en espera el resto",
  ],
  "totals.biggest": ["biggest offender:", "mayor culpable:"],
  "totals.unverified": ["unverified line", "línea sin verificar"],
  "totals.unverified.plural": ["unverified lines", "líneas sin verificar"],
  "totals.not.counted": ["not counted", "no contadas"],
  // plan
  "plan.title": ["What to do, in order", "Qué hacer, en orden"],
  "plan.sub": ["Ranked by dollars saved per dollar spent. Tick moves to see the bill change.", "Ordenado por dólares ahorrados por dólar gastado. Marca medidas para ver cambiar la factura."],
  "plan.chosen": ["chosen", "elegidas"],
  "plan.of": ["of", "de"],
  "plan.bill.now": ["annual bill now", "factura anual ahora"],
  "plan.bill.after": ["after these moves", "tras estas medidas"],
  "plan.saved": ["saved a year", "ahorro al año"],
  "plan.upfront": ["up front", "inversión"],
  "plan.co2": ["CO₂ avoided", "CO₂ evitado"],
  "plan.after.hours": ["after hours", "fuera de horario"],
  "plan.in.use": ["in use", "en uso"],
  "plan.of.bill": ["of the bill", "de la factura"],
  "plan.nothing": ["nothing", "nada"],
  "plan.no.purchase": ["no purchase", "sin compra"],
  "plan.never": ["never pays back", "nunca se amortiza"],
  "plan.pays.back": ["pays back in", "se amortiza en"],
  "plan.grid.factor": ["a year, at this grid's factor", "al año, con el factor de esta red"],
  "plan.free.only": ["Free moves only", "Solo medidas gratis"],
  "plan.within.year": ["Pays back within a year", "Se amortiza en un año"],
  "plan.everything": ["Everything", "Todo"],
  "plan.clear": ["Clear", "Limpiar"],
  "plan.swap": ["swap", "cambiar"],
  "plan.fix": ["fix habit", "corregir hábito"],
  "plan.low.confidence": ["low confidence", "baja confianza"],
  "plan.free": ["free", "gratis"],
  "plan.back.per": ["back per $1", "de vuelta por $1"],
  "plan.payback": ["payback", "amortización"],
  "plan.yr": ["/yr", "/año"],
  // live camera panel
  "cam.hold": ["Hold still to confirm", "Quédate quieto para confirmar"],
  "cam.confirming": ["Confirming…", "Confirmando…"],
  "cam.point": ["Point at screens, laptops, lights or appliances.", "Apunta a pantallas, portátiles, luces o electrodomésticos."],
  "cam.point.short": ["point at screens, lights, appliances", "apunta a pantallas, luces, aparatos"],
  "cam.nothing": ["Nothing powered in view yet. Point at screens, laptops, lights or appliances.", "Aún no hay nada encendido a la vista. Apunta a pantallas, portátiles, luces o electrodomésticos."],
  "cam.candidates": ["live candidates · on-device", "candidatos en vivo · en el dispositivo"],
  "cam.not.priced": ["not priced until confirmed", "sin precio hasta confirmar"],
  "cam.priced": ["priced", "con precio"],
  "cam.confirmed.by": ["confirmed", "confirmado"],
  "cam.if.left.on": ["/yr if left on", "/año si se deja encendido"],
  "cam.candidate.in.view": ["candidate in view", "candidato a la vista"],
  "cam.candidates.in.view": ["candidates in view", "candidatos a la vista"],
  "cam.candidates.unpriced": ["Nothing is priced until the strong read confirms it.", "Nada tiene precio hasta que la lectura fuerte lo confirme."],
  "cam.confirmed.in.view": ["confirmed in view", "confirmados a la vista"],
  "cam.typical": ["at typical use", "en uso normal"],
  "cam.drawing": ["drawing", "consumiendo"],
  "cam.no.camera": ["No camera found on this device. Upload a photo or video instead.", "No se encontró cámara en este dispositivo. Sube una foto o un vídeo."],
  "cam.blocked": ["Camera access was blocked. Allow it in your browser's site settings, or upload instead.", "Se bloqueó el acceso a la cámara. Permítelo en los ajustes del sitio de tu navegador, o sube una foto."],
  "cam.https": ["This browser only allows the camera over HTTPS. Open the deployed site, or upload a photo or video.", "Este navegador solo permite la cámara por HTTPS. Abre el sitio publicado o sube una foto o un vídeo."],
  "cam.busy": ["The camera couldn't start. Another app may be using it.", "La cámara no pudo iniciarse. Puede que otra aplicación la esté usando."],
  "cam.try.again": ["Try again", "Reintentar"],
  "cam.upload.instead": ["Upload instead", "Subir en su lugar"],
  // accessibility panel
  "a11y.title": ["Display & accessibility", "Pantalla y accesibilidad"],
  "a11y.sub": ["Stored on this device. Each one changes the whole app.", "Guardado en este dispositivo. Cada opción cambia toda la aplicación."],
  "a11y.theme": ["Theme", "Tema"],
  "a11y.theme.system": ["System", "Sistema"],
  "a11y.theme.light": ["Light", "Claro"],
  "a11y.theme.dark": ["Dark", "Oscuro"],
  "a11y.text": ["Text size", "Tamaño del texto"],
  "a11y.text.normal": ["Normal", "Normal"],
  "a11y.text.large": ["Large", "Grande"],
  "a11y.text.xl": ["Larger", "Más grande"],
  "a11y.contrast": ["High contrast", "Alto contraste"],
  "a11y.contrast.sub": ["Darker text, stronger borders, no tinted backgrounds.", "Texto más oscuro, bordes más marcados, sin fondos teñidos."],
  "a11y.motion": ["Reduce motion", "Reducir movimiento"],
  "a11y.motion.sub": ["Turns off every animation and transition, including the scan feedback and counting numbers.", "Apaga todas las animaciones y transiciones, incluidas las del escaneo y los números que cuentan."],
  "a11y.motion.system": ["Follow system", "Según el sistema"],
  "a11y.motion.reduce": ["Always reduce", "Reducir siempre"],
  "a11y.palette": ["Colour-blind-safe colours", "Colores aptos para daltonismo"],
  "a11y.palette.sub": ["Waste, recovered and estimate use blue, orange and vermilion instead of red, green and amber.", "Desperdicio, recuperado y estimación usan azul, naranja y bermellón en vez de rojo, verde y ámbar."],
  "a11y.lang": ["Language", "Idioma"],
  "a11y.lang.sub": ["The scanner, results, plan and navigation. Method, Privacy and Terms stay in English.", "Escáner, resultados, plan y navegación. Método, Privacidad y Términos siguen en inglés."],
  "a11y.underline": ["Underline links", "Subrayar enlaces"],
  "a11y.underline.sub": ["Links are told apart by more than colour.", "Los enlaces se distinguen por algo más que el color."],
  "a11y.targets": ["Bigger touch targets", "Botones más grandes"],
  "a11y.targets.sub": ["Buttons, tabs and inputs grow to at least 44 px tall.", "Botones, pestañas y campos crecen al menos a 44 px de alto."],
  "a11y.spacing": ["Wider letter spacing", "Letras más espaciadas"],
  "a11y.spacing.sub": ["More space between letters, words and lines, which helps many dyslexic readers.", "Más espacio entre letras, palabras y líneas, lo que ayuda a muchos lectores con dislexia."],
  "a11y.focus": ["Always show focus", "Mostrar siempre el foco"],
  "a11y.focus.sub": ["The keyboard focus ring stays visible for mouse and touch too.", "El anillo de foco del teclado también se ve con ratón y táctil."],
  "a11y.reset": ["Reset to defaults", "Restablecer valores"],
  "a11y.builtin": [
    "Always on: screen-reader labels on every control and image, full keyboard navigation with a skip link, and live regions that announce scan results.",
    "Siempre activo: etiquetas para lectores de pantalla en cada control e imagen, navegación completa por teclado con enlace para saltar, y regiones en vivo que anuncian los resultados.",
  ],
} as const;

export type Key = keyof typeof STRINGS;

export function translate(lang: Lang, key: Key): string {
  const pair = STRINGS[key];
  return lang === "es" ? pair[1] : pair[0];
}

/** `t("nav.scanner")` in the current language. */
export function useT() {
  const { lang } = usePrefs();
  return (key: Key) => translate(lang, key);
}
