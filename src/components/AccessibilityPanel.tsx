"use client";

// Ten display and accessibility settings, each with one sentence on what it does.

import { resetPrefs, setPrefs, usePrefs, type Prefs } from "@/lib/prefs";
import { useT } from "@/lib/i18n";

export function AccessibilityPanel() {
  const p = usePrefs();
  const t = useT();
  const changed = JSON.stringify(p) !== JSON.stringify({ ...p, ...defaultsOf() });

  return (
    <section id="accessibility" className="panel scroll-mt-24 p-5 sm:p-6" aria-labelledby="a11y-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="a11y-title" className="text-lg font-semibold text-fog">
          {t("a11y.title")}
        </h2>
        <span className="text-[0.76rem] text-dim">{t("a11y.sub")}</span>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Choice
          label={t("a11y.theme")}
          value={p.theme}
          options={[
            ["system", t("a11y.theme.system")],
            ["light", t("a11y.theme.light")],
            ["dark", t("a11y.theme.dark")],
          ]}
          onChange={(v) => setPrefs({ theme: v as Prefs["theme"] })}
        />
        <Choice
          label={t("a11y.text")}
          value={p.text}
          options={[
            ["normal", t("a11y.text.normal")],
            ["large", t("a11y.text.large")],
            ["xl", t("a11y.text.xl")],
          ]}
          onChange={(v) => setPrefs({ text: v as Prefs["text"] })}
        />
        <Choice
          label={t("a11y.motion")}
          sub={t("a11y.motion.sub")}
          value={p.motion}
          options={[
            ["system", t("a11y.motion.system")],
            ["reduce", t("a11y.motion.reduce")],
          ]}
          onChange={(v) => setPrefs({ motion: v as Prefs["motion"] })}
        />
        <Choice
          label={t("a11y.lang")}
          sub={t("a11y.lang.sub")}
          value={p.lang}
          options={[
            ["en", "English"],
            ["es", "Español"],
          ]}
          onChange={(v) => setPrefs({ lang: v as Prefs["lang"] })}
        />
      </div>

      <div className="mt-5 grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
        <Toggle label={t("a11y.contrast")} sub={t("a11y.contrast.sub")} checked={p.contrast} onChange={(v) => setPrefs({ contrast: v })} />
        <Toggle label={t("a11y.palette")} sub={t("a11y.palette.sub")} checked={p.palette === "safe"} onChange={(v) => setPrefs({ palette: v ? "safe" : "default" })} />
        <Toggle label={t("a11y.underline")} sub={t("a11y.underline.sub")} checked={p.underline} onChange={(v) => setPrefs({ underline: v })} />
        <Toggle label={t("a11y.targets")} sub={t("a11y.targets.sub")} checked={p.targets} onChange={(v) => setPrefs({ targets: v })} />
        <Toggle label={t("a11y.spacing")} sub={t("a11y.spacing.sub")} checked={p.spacing} onChange={(v) => setPrefs({ spacing: v })} />
        <Toggle label={t("a11y.focus")} sub={t("a11y.focus.sub")} checked={p.focus} onChange={(v) => setPrefs({ focus: v })} />
      </div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-3 border-t border-line pt-4">
        <p className="max-w-xl text-[0.76rem] leading-relaxed text-dim">{t("a11y.builtin")}</p>
        {changed && (
          <button type="button" onClick={resetPrefs} className="text-[0.76rem] text-dim underline-offset-4 hover:text-fog hover:underline">
            {t("a11y.reset")}
          </button>
        )}
      </div>
    </section>
  );
}

function defaultsOf(): Prefs {
  return { theme: "system", text: "normal", contrast: false, motion: "system", palette: "default", lang: "en", underline: false, targets: false, spacing: false, focus: false };
}

function Choice({ label, sub, value, options, onChange }: { label: string; sub?: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="text-[0.88rem] font-medium text-fog">{label}</legend>
      {sub && <p className="mt-0.5 text-[0.74rem] leading-relaxed text-dim">{sub}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map(([v, text]) => {
          const on = v === value;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(v)}
              className={`rounded-full border px-3 py-1.5 text-[0.8rem] transition-colors ${on ? "border-fog bg-fog text-ink" : "border-line text-mist hover:border-line2 hover:text-fog"}`}
            >
              {text}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Toggle({ label, sub, checked, onChange }: { label: string; sub: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-1 py-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-cyan" />
      <span className="min-w-0">
        <span className="block text-[0.88rem] font-medium text-fog">{label}</span>
        <span className="mt-0.5 block text-[0.74rem] leading-relaxed text-dim">{sub}</span>
      </span>
    </label>
  );
}
