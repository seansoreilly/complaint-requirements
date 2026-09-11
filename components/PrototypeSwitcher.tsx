"use client";

/*
 * PROTOTYPE — variant switcher for the avatar concepts. Throwaway; delete with
 * components/prototype-avatars.tsx. Never renders in a production build.
 */

import { useEffect } from "react";

export function PrototypeSwitcher({
  variants,
  current,
  names,
  onChange,
}: {
  variants: string[];
  current: string;
  names: Record<string, string>;
  onChange: (variant: string) => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    function onKey(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const index = variants.indexOf(current);
      const step = event.key === "ArrowRight" ? 1 : -1;
      onChange(variants[(index + step + variants.length) % variants.length]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variants, current, onChange]);

  if (process.env.NODE_ENV === "production") return null;

  function cycle(step: number): void {
    const index = variants.indexOf(current);
    onChange(variants[(index + step + variants.length) % variants.length]);
  }

  return (
    <div className="proto-bar no-print fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/90 p-1 text-white shadow-2xl ring-1 ring-white/20">
      <button
        type="button"
        onClick={() => cycle(-1)}
        className="h-9 w-9 rounded-full text-lg leading-none hover:bg-white/20"
        aria-label="Previous variant"
      >
        ‹
      </button>
      <span className="px-2 text-xs font-semibold whitespace-nowrap">
        {current} — {names[current] ?? "?"}
      </span>
      <button
        type="button"
        onClick={() => cycle(1)}
        className="h-9 w-9 rounded-full text-lg leading-none hover:bg-white/20"
        aria-label="Next variant"
      >
        ›
      </button>
    </div>
  );
}
