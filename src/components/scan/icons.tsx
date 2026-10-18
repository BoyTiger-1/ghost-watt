const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export type IconName =
  | "camera"
  | "upload"
  | "flip"
  | "torch"
  | "pin"
  | "clock"
  | "bulb"
  | "close"
  | "chevron"
  | "play"
  | "video"
  | "sparkle"
  | "refresh"
  | "person"
  | "chip"
  | "edit";

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {name === "camera" && (
        <>
          <path d="M4 8.5h2.6l1.6-2.2h7.6l1.6 2.2H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z" {...P} />
          <circle cx="12" cy="13.2" r="3.4" {...P} />
        </>
      )}
      {name === "upload" && <path d="M12 15.5V4.5M7.5 9 12 4.5 16.5 9M4.5 15v3.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V15" {...P} />}
      {name === "flip" && (
        <>
          <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5M20 4.5v4h-4" {...P} />
          <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5M4 19.5v-4h4" {...P} />
        </>
      )}
      {name === "torch" && <path d="M8 3h8l-1.5 5h-5zM9.5 8v3l1.5 10h2l1.5-10V8M12 12.5v2" {...P} />}
      {name === "pin" && (
        <>
          <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z" {...P} />
          <circle cx="12" cy="10" r="2.3" {...P} />
        </>
      )}
      {name === "clock" && (
        <>
          <circle cx="12" cy="12" r="8.5" {...P} />
          <path d="M12 7.5V12l3 2" {...P} />
        </>
      )}
      {name === "bulb" && <path d="M9 17.5h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" {...P} />}
      {name === "close" && <path d="M6 6l12 12M18 6 6 18" {...P} />}
      {name === "chevron" && <path d="m7 10 5 5 5-5" {...P} />}
      {name === "play" && <path d="M8 5.5v13l10.5-6.5z" {...P} />}
      {name === "video" && (
        <>
          <rect x="3" y="6.5" width="12.5" height="11" rx="2" {...P} />
          <path d="m15.5 10.5 5-3v9l-5-3" {...P} />
        </>
      )}
      {name === "sparkle" && <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" {...P} />}
      {name === "refresh" && <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" {...P} />}
      {name === "person" && (
        <>
          <circle cx="12" cy="8" r="3.5" {...P} />
          <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" {...P} />
        </>
      )}
      {name === "chip" && (
        <>
          <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" {...P} />
          <path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21" {...P} />
        </>
      )}
      {name === "edit" && <path d="M4.5 19.5h4l10-10-4-4-10 10zM13 7l4 4" {...P} />}
    </svg>
  );
}
