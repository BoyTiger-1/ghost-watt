"use client";

// The button that makes the app explicable in thirty seconds.
//
// Everything in the portfolio needs history to mean anything - the verification
// loop, before-and-after per device, whether a fix held. A new user has none, so the
// most interesting half of the app renders as an empty state until they have walked
// a building twice, weeks apart. This loads a worked example so the whole thing can
// be seen at once.
//
// Two rules keep this from being dishonest. The example is labelled as an example
// everywhere it appears, and it is removable in one click without touching real
// work. Demo data that a user cannot distinguish from their own findings would be a
// worse problem than the empty state it fixes.

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore, replaceStore } from "@/lib/useStore";
import { storeHasSample, withSample, withoutSample } from "@/lib/sample";

export function SampleData({ compact = false }: { compact?: boolean }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const loaded = storeHasSample(store);

  const toggle = () => {
    setBusy(true);
    replaceStore(loaded ? withoutSample(store) : withSample(store));
    // The store write is synchronous; the delay only exists so the label change is
    // perceptible rather than appearing not to have happened.
    setTimeout(() => setBusy(false), 250);
  };

  if (compact) {
    return (
      <button
        onClick={toggle}
        disabled={busy}
        className="font-mono text-[0.72rem] tracking-wider text-dim underline-offset-4 transition-colors hover:text-cyan hover:underline disabled:opacity-50"
      >
        {loaded ? "remove the example" : "load a worked example"}
      </button>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="min-w-0 max-w-[54ch]">
          <div className="mono-label text-cyan">worked example</div>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            {loaded ? (
              <>
                <span className="text-fog">Riverside High</span> is sample data — a
                fictional school with two audits eight weeks apart and three fixes
                installed in between. The numbers are computed by the same pipeline a
                real scan uses; only the building is invented.
              </>
            ) : (
              <>
                Most of this page needs history to say anything. Load a school with two
                audits and three installed fixes to see the before-and-after, the
                verification loop, and a finished brief without walking a building
                first.
              </>
            )}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`shrink-0 border px-4 py-2 font-mono text-[0.75rem] tracking-wider transition-colors disabled:opacity-50 ${
            loaded
              ? "border-line text-dim hover:border-ember/60 hover:text-ember"
              : "border-cyan bg-cyan/10 text-cyan hover:bg-cyan/20"
          }`}
        >
          {busy ? "…" : loaded ? "remove example" : "load example"}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {loaded && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-line bg-surface2/40 px-5 py-3 text-[0.76rem] text-dim"
          >
            Removing it deletes only the sample records. Anything you scanned yourself
            stays exactly where it is.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
