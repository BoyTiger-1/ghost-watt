"use client";

// Sound, vibration and speech cues, each gated by its preference.

import type { Prefs } from "./prefs";

let audio: AudioContext | null = null;

/** A short two-note tone: up for "confirmed", flat for "done". */
export function beep(p: Pick<Prefs, "sound">, kind: "confirmed" | "done" = "confirmed") {
  if (!p.sound || typeof window === "undefined") return;
  try {
    audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = audio;
    const t = ctx.currentTime;
    const notes = kind === "confirmed" ? [660, 880] : [520, 520];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.08);
      o.connect(g).connect(ctx.destination);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.09);
    });
  } catch {
    // No audio: nothing to do.
  }
}

export function buzz(p: Pick<Prefs, "haptics">, pattern: number | number[]) {
  if (!p.haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported.
  }
}

/** Say a sentence, cancelling anything still being said. */
export function say(p: Pick<Prefs, "speak" | "lang">, text: string) {
  if (!p.speak || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices: Record<string, string> = { en: "en-US", es: "es-ES", zh: "zh-CN", tl: "fil-PH", vi: "vi-VN", fr: "fr-FR", ko: "ko-KR", pt: "pt-BR", hi: "hi-IN" };
    u.lang = voices[p.lang] ?? "en-US";
    window.speechSynthesis.speak(u);
  } catch {
    // No speech: nothing to do.
  }
}
