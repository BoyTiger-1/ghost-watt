// The shared frame for the Privacy Policy and the Terms of Service: a title,
// the effective date, a contents list, and numbered sections. Plain server
// components, so both documents render and print without JavaScript.

import Link from "next/link";

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

export function LegalPage({
  kind,
  title,
  effective,
  summary,
  sections,
  other,
}: {
  kind: string;
  title: string;
  effective: string;
  summary: React.ReactNode;
  sections: LegalSection[];
  other: { href: string; label: string };
}) {
  return (
    <div className="mx-auto max-w-5xl px-5 pb-20 pt-24 sm:px-6 sm:pt-32">
      <header className="border-b border-line pb-8">
        <p className="mono-label text-cyan">{kind}</p>
        <h1 className="font-editorial mt-3 text-[2.4rem] leading-[1.05] text-fog sm:text-[3rem]">{title}</h1>
        <p className="mt-3 text-[0.9rem] text-dim">
          Effective {effective} · Last updated {effective}
        </p>
        <div className="mt-6 max-w-3xl rounded-2xl border border-line bg-surface2/50 px-5 py-4 text-[0.95rem] leading-relaxed text-mist">{summary}</div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[14rem_1fr] lg:gap-14">
        <nav aria-label="Contents" className="no-print lg:sticky lg:top-28 lg:self-start">
          <p className="text-[0.8rem] font-medium text-dim">Contents</p>
          <ol className="mt-3 space-y-1.5 border-l border-line text-[0.86rem]">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-0.5 pl-4 text-mist transition-colors hover:border-fog hover:text-fog">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-6 pl-4 text-[0.82rem] text-dim">
            See also:{" "}
            <Link href={other.href} className="text-cyan underline-offset-4 hover:underline">
              {other.label}
            </Link>
          </p>
        </nav>

        <article className="min-w-0 max-w-3xl space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-28">
              <h2 className="text-[1.2rem] font-semibold tracking-[-0.01em] text-fog">
                {i + 1}. {s.title}
              </h2>
              <div className="legal-body mt-3 space-y-3 text-[0.95rem] leading-relaxed text-mist">{s.body}</div>
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}

/** A two-column table of facts, for the lists of data and processors. */
export function LegalTable({ head, rows }: { head: [string, string, string?]; rows: [React.ReactNode, React.ReactNode, React.ReactNode?][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[30rem] border-collapse text-left text-[0.88rem]">
        <thead>
          <tr className="border-b border-line text-[0.74rem] uppercase tracking-wider text-dim">
            {head.filter(Boolean).map((h) => (
              <th key={h} className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/60 align-top">
              {r.slice(0, head.filter(Boolean).length).map((c, j) => (
                <td key={j} className={`py-2.5 pr-4 ${j === 0 ? "text-fog" : "text-mist"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
