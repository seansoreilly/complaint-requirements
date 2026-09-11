"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * The app's only navigation. Small by design — a demo with two pages — but it
 * is where the privacy page lives, so it must be reachable on a phone.
 */
export function MainMenu({ onStartOver }: { onStartOver: () => void }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onClick(event: MouseEvent): void {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-afca-blue/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-afca-yellow"
      >
        <span aria-hidden className="flex w-5 flex-col gap-[3px]">
          <span className="h-[2px] w-full rounded bg-current" />
          <span className="h-[2px] w-full rounded bg-current" />
          <span className="h-[2px] w-full rounded bg-current" />
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-afca-line bg-white shadow-lg"
        >
          <Link
            href="/"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-semibold text-afca-navy transition hover:bg-afca-skylight"
          >
            Complaint form
          </Link>
          <Link
            href="/privacy"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-semibold text-afca-navy transition hover:bg-afca-skylight"
          >
            Your data
          </Link>
          <a
            href="https://www.afca.org.au"
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 text-sm font-semibold text-afca-navy transition hover:bg-afca-skylight"
          >
            The real AFCA ↗
          </a>
          <div className="border-t border-afca-line">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onStartOver();
              }}
              className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-afca-navy transition hover:bg-afca-skylight"
            >
              Start over
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
