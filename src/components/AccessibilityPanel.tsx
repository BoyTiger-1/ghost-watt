"use client";

// Twenty-four display and accessibility settings, in four groups, each with
// one sentence on what it does. Every one changes real behaviour somewhere in
// the app; none is a placeholder.

import { DEFAULT_PREFS, resetPrefs, setPrefs, usePrefs, type Prefs } from "@/lib/prefs";
import { LANG_NAMES } from "@/lib/i18n-more";
import { useT } from "@/lib/i18n";

export function AccessibilityPanel() {
  const p = usePrefs();
  const t = useT();
  const changed = JSON.stringify(p) !== JSON.stringify(DEFAULT_PREFS);
  const flag = (k: keyof Prefs) => (v: boolean) => setPrefs({ [k]: v } as Partial<Prefs>);

  return (
    <section id="accessibility" className="panel scroll-mt-24 p-5 sm:p-6" aria-labelledby="a11y-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="a11y-title" className="text-lg font-semibold text-fog">
          {t("a11y.title")}
        </h2>
        <span className="text-[0.76rem] text-dim">{t("a11y.sub")}</span>
      </div>

      <Group title={t("a11y.group.see")}>
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
        <Toggle label={t("a11y.contrast")} sub={t("a11y.contrast.sub")} checked={p.contrast} onChange={flag("contrast")} />
        <Toggle label={t("a11y.palette")} sub={t("a11y.palette.sub")} checked={p.palette === "safe"} onChange={(v) => setPrefs({ palette: v ? "safe" : "default" })} />
        <Toggle label={t("a11y.grayscale")} sub={t("a11y.grayscale.sub")} checked={p.grayscale} onChange={flag("grayscale")} />
        <Toggle label={t("a11y.cursor")} sub={t("a11y.cursor.sub")} checked={p.cursor} onChange={flag("cursor")} />
        <Toggle label={t("a11y.focus")} sub={t("a11y.focus.sub")} checked={p.focus} onChange={flag("focus")} />
        <Toggle label={t("a11y.lite")} sub={t("a11y.lite.sub")} checked={p.lite} onChange={flag("lite")} />
      </Group>

      <Group title={t("a11y.group.read")}>
        <Choice
          label={t("a11y.lang")}
          sub={t("a11y.lang.sub")}
          value={p.lang}
          options={Object.entries(LANG_NAMES)}
          onChange={(v) => setPrefs({ lang: v as Prefs["lang"] })}
        />
        <Toggle label={t("a11y.font")} sub={t("a11y.font.sub")} checked={p.font === "plain"} onChange={(v) => setPrefs({ font: v ? "plain" : "default" })} />
        <Toggle label={t("a11y.bold")} sub={t("a11y.bold.sub")} checked={p.bold} onChange={flag("bold")} />
        <Toggle label={t("a11y.spacing")} sub={t("a11y.spacing.sub")} checked={p.spacing} onChange={flag("spacing")} />
        <Toggle label={t("a11y.lineheight")} sub={t("a11y.lineheight.sub")} checked={p.lineheight} onChange={flag("lineheight")} />
        <Toggle label={t("a11y.underline")} sub={t("a11y.underline.sub")} checked={p.underline} onChange={flag("underline")} />
        <Toggle label={t("a11y.guide")} sub={t("a11y.guide.sub")} checked={p.guide} onChange={flag("guide")} />
        <Toggle label={t("a11y.speak")} sub={t("a11y.speak.sub")} checked={p.speak} onChange={flag("speak")} />
      </Group>

      <Group title={t("a11y.group.move")}>
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
        <Toggle label={t("a11y.targets")} sub={t("a11y.targets.sub")} checked={p.targets} onChange={flag("targets")} />
        <Toggle label={t("a11y.sound")} sub={t("a11y.sound.sub")} checked={p.sound} onChange={flag("sound")} />
        <Toggle label={t("a11y.haptics")} sub={t("a11y.haptics.sub")} checked={p.haptics} onChange={flag("haptics")} />
      </Group>

      <Group title={t("a11y.group.scan")}>
        <Toggle label={t("a11y.manual")} sub={t("a11y.manual.sub")} checked={p.manualConfirm} onChange={flag("manualConfirm")} />
        <Toggle label={t("a11y.minimal")} sub={t("a11y.minimal.sub")} checked={p.minimalOverlay} onChange={flag("minimalOverlay")} />
        <Toggle label={t("a11y.shortcuts")} sub={t("a11y.shortcuts.sub")} checked={p.shortcuts} onChange={flag("shortcuts")} />
        <Toggle label={t("a11y.lefthand")} sub={t("a11y.lefthand.sub")} checked={p.leftHand} onChange={flag("leftHand")} />
      </Group>

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

/** A titled block of related settings: Seeing, Reading, Motion and sound, Scanner. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-5 border-t border-line pt-4">
      <legend className="mono-label">{title}</legend>
      <div className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

/** A setting with a few named options (theme, text size), as a row of radio buttons. */
function Choice({ label, sub, value, options, onChange }: { label: string; sub?: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="block text-[0.88rem] font-medium text-fog">{label}</span>
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
    </div>
  );
}

/** An on/off setting, as a switch that screen readers announce as one. */
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
