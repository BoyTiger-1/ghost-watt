// The launch screen, once per visit: the building is dark, the ghost's outline
// traces itself in, faint leaders feel their way down, then lightning strikes
// the ghost's head. The screen flashes, the ghost squashes, sparks fly off the
// impact, and the charge settles, still, inside the ghost. Then the mark zooms through
// into the page the way an app opens from its icon.
//
// Plain HTML and CSS (globals.css, "splash"), in the first paint, so it starts
// before any script has loaded. SPLASH_SCRIPT, in <head>, turns it off for the
// rest of the session and for anyone who asked for less motion.

const GHOST = "M8.5 24.6V14a7.5 7.5 0 0 1 15 0v10.6a2.5 2.1 0 0 1-5 0a2.5 2.1 0 0 1-5 0a2.5 2.1 0 0 1-5 0Z";
/** Where the strike lands: the top of the ghost's head. */
const HIT = [16.6, 6.55] as const;
/** The strike from the sky down to the ghost's head. */
const STRIKE = "M19.4 -18 L17.6 -13.4 L18.9 -11.6 L16.6 -7.2 L18.1 -5.1 L15.7 -0.9 L17.4 1.4 L15.9 4.3 L16.6 6.55";
/** Its branches, and the branches off those: real lightning forks and forks again. */
const STRIKE_FORKS = [
  "M18.9 -11.6 L21.3 -9.4 L20.8 -7.6 L22.6 -5.4",
  "M20.8 -7.6 L19.6 -5.9",
  "M16.6 -7.2 L14.1 -5.6 L14.6 -3.8 L12.7 -1.6",
  "M14.6 -3.8 L15.6 -2.5",
  "M17.4 1.4 L19.5 2.6 L19.9 4.1",
  "M15.7 -0.9 L13.8 0.4",
];
/** The charge that stays inside the ghost, jagged like the strike. */
const CORE_A = "M16.6 6.55 L15.2 10.4 L17.4 12.3 L14.6 16.6 L16.8 18.2 L15 22.3";
const CORE_FORKS = ["M17.4 12.3 L19.6 13.9 L20.1 16.2", "M14.6 16.6 L12.6 18.3 L12.9 19.8"];

export const SPLASH_SCRIPT = `(function(){try{var d=document.documentElement,s=sessionStorage,r=d.getAttribute("data-motion")==="reduce"||(d.getAttribute("data-motion")!=="full"&&matchMedia("(prefers-reduced-motion: reduce)").matches);if(r||s.getItem("gw-splash")){d.setAttribute("data-splash","off")}else{s.setItem("gw-splash","1")}}catch(e){document.documentElement.setAttribute("data-splash","off")}})();`;

/** One bolt drawn three times: a wide soft glow, the body, a white-hot core. */
function Bolt({ d, className, style }: { d: string; className: string; style?: React.CSSProperties }) {
  return (
    <g className={className} style={style}>
      <path d={d} pathLength={1} className="splash-zap splash-zap-glow" filter="url(#splash-blur)" />
      <path d={d} pathLength={1} className="splash-zap splash-zap-body" />
      <path d={d} pathLength={1} className="splash-zap splash-zap-core" />
    </g>
  );
}

/** Sparks thrown off the impact: each flies out sideways, rises, then falls under gravity. */
const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const side = i % 2 ? 1 : -1;
  const dx = side * (3.5 + ((i * 7) % 5) * 1.8);
  const up = 2.5 + ((i * 3) % 4) * 1.1;
  const fall = 24 + ((i * 5) % 4) * 3.5;
  return { dx, up, fall, r: 0.24 + (i % 3) * 0.08, delay: (i % 4) * 0.014 };
});

const WORD = "Ghost Watt";

export function Splash() {
  return (
    <div className="splash" aria-hidden="true">
      <div className="splash-flash" />
      <div className="splash-glow" />
      <div className="splash-mark">
        <svg viewBox="5.5 4 21 25" className="splash-svg">
          <defs>
            <filter id="splash-blur" x="-200%" y="-50%" width="500%" height="200%">
              <feGaussianBlur stdDeviation="0.5" />
            </filter>
            <filter id="splash-soft" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="0.32" />
            </filter>
          </defs>

          {/* The ghost and the charge inside it: one body, which squashes when struck and springs back. */}
          <g className="splash-body">
          {/* a faint warm haze inside, a glow around the line, and the line */}
          <path className="splash-haze" d={GHOST} />
          <path className="splash-outline-glow" d={GHOST} filter="url(#splash-soft)" />
          <path className="splash-outline" d={GHOST} pathLength={1} />

          {/* the charge left inside */}
          <Bolt d={CORE_A} className="splash-core" />
          {CORE_FORKS.map((f) => (
            <Bolt key={f} d={f} className="splash-core splash-fork" />
          ))}
          </g>
          {/* stepped leaders: faint, partial, feeling their way down before the strike */}
          <Bolt d={STRIKE} className="splash-leader" />
          <Bolt d={STRIKE_FORKS[2]} className="splash-leader splash-fork" />

          {/* the strike */}
          <Bolt d={STRIKE} className="splash-strike" />
          {STRIKE_FORKS.map((f, i) => (
            <Bolt key={f} d={f} className={`splash-strike splash-fork${i % 2 ? " splash-twig" : ""}`} />
          ))}

          {/* the impact: a shock ring and sparks */}
          <circle className="splash-ring" cx={HIT[0]} cy={HIT[1]} r="1" />
          {SPARKS.map((p, i) => (
            <g key={i} className="splash-spark-x" style={{ "--dx": `${p.dx}px`, "--d": `${p.delay}s` } as React.CSSProperties}>
              <circle
                className="splash-spark"
                cx={HIT[0]}
                cy={HIT[1]}
                r={p.r}
                style={{ "--up": `${-p.up}px`, "--fall": `${p.fall}px`, "--d": `${p.delay}s` } as React.CSSProperties}
              />
            </g>
          ))}

        </svg>
        <div className="splash-shadow" />
      </div>
      <div className="splash-word">
        {[...WORD].map((ch, i) => (
          <span key={i} className={i >= 6 ? "splash-letter splash-letter-watt" : "splash-letter"} style={{ "--i": i } as React.CSSProperties}>
            {ch === " " ? " " : ch}
          </span>
        ))}
      </div>
    </div>
  );
}
