"use client";

/*
 * PROTOTYPE — contact sheet for the three avatar concepts.
 * Every character at avatar size and blown up, in all three states, so the
 * shapes can be judged side by side. Throwaway: delete with
 * components/prototype-avatars.tsx.
 */

import Link from "next/link";
import {
  AVATARS,
  VARIANT_NAMES,
  type AvatarState,
} from "@/components/prototype-avatars";

const STATES: AvatarState[] = ["idle", "thinking", "speaking"];

export default function AvatarGallery() {
  return (
    <main className="min-h-dvh bg-white p-8 text-afca-navy">
      <h1 className="text-xl font-extrabold">Avatar concepts</h1>
      <p className="mt-1 text-sm text-afca-blue">
        Prototype only. Compare on the real chat at{" "}
        <Link href="/?variant=A" className="underline">
          /?variant=A
        </Link>
        .
      </p>

      {Object.keys(AVATARS).map((key) => {
        const Avatar = AVATARS[key];
        return (
          <section key={key} className="mt-10 border-t border-afca-line pt-6">
            <h2 className="text-base font-bold">
              {key} — {VARIANT_NAMES[key]}
            </h2>
            <div className="mt-4 flex flex-wrap items-end gap-10">
              {STATES.map((state) => (
                <div key={state} className="text-center">
                  <Avatar state={state} size={96} />
                  <p className="mt-2 text-xs font-semibold">{state}</p>
                </div>
              ))}
              <div className="text-center">
                <div className="flex h-24 items-center gap-2">
                  <Avatar state="idle" size={30} />
                  <Avatar state="thinking" size={30} />
                  <Avatar state="speaking" size={30} />
                </div>
                <p className="mt-2 text-xs font-semibold">actual size (30px)</p>
              </div>
              {/* On the real bubble background, since that is where it lives. */}
              <div className="text-center">
                <div className="flex h-24 items-center">
                  <span className="flex items-center gap-2 rounded-2xl bg-afca-skylight px-3 py-2">
                    <Avatar state="idle" size={30} />
                    <span className="text-sm">On the bubble</span>
                  </span>
                </div>
                <p className="mt-2 text-xs font-semibold">in context</p>
              </div>
            </div>
          </section>
        );
      })}
    </main>
  );
}
