// A short "Sources:" line under a claim, linking each name to its entry on the
// Method page, where the full reference, what is taken from it and any caveat live.

import Link from "next/link";

export function Cite({ items, className = "" }: { items: { id: string; name: string }[]; className?: string }) {
  return (
    // A span, not a p, so it can sit inside a paragraph as well as after one.
    <span className={`block text-[0.74rem] leading-relaxed opacity-70 ${className}`}>
      Sources:{" "}
      {items.map((it, i) => (
        <span key={it.id}>
          {i > 0 && " · "}
          <Link href={`/methodology#src-${it.id}`} className="underline decoration-current/30 underline-offset-2 hover:decoration-current">
            {it.name}
          </Link>
        </span>
      ))}
    </span>
  );
}
