"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  type ComplaintState,
  type FieldDef,
  NARRATIVE_MAX,
  SERVICE_ISSUES,
  SERVICE_SUBTYPES,
  STAGES,
  getPath,
} from "@/lib/schema";
import { applies, isAnswered } from "@/lib/next";
import { revealKey } from "@/lib/reveal";
import { maskAccount } from "@/lib/export";
import { formatDateAU } from "@/lib/patch";

/** A stored date, as opposed to one part-typed on its way to being stored. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Today where the person is, not in UTC. The picker offers dates from a
 * calendar on their wall, so its ceiling has to come from the same one.
 */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export interface StageStatus {
  id: string;
  title: string;
  complete: boolean;
}

/**
 * The eight-step journey. This is the one place the design raises its voice:
 * a continuous navy track, yellow marking where you are, green behind you.
 * The numbering is real — AFCA's form genuinely is a fixed eight-step sequence.
 */
function ProgressRail({
  stages,
  activeId,
  onJump,
}: {
  stages: StageStatus[];
  activeId: string | null;
  onJump: (id: string) => void;
}) {
  const activeIndex = Math.max(0, stages.findIndex((stage) => stage.id === activeId));
  const activeLabel = stages[activeIndex]?.title ?? stages[0].title;

  return (
    <div className="rail border-b border-afca-line bg-afca-navy px-4 py-3">
      <ol className="flex items-stretch gap-1">
        {stages.map((stage, index) => {
          const active = stage.id === activeId;
          return (
            <li key={stage.id} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onJump(stage.id)}
                title={stage.title}
                className="group flex w-full flex-col items-center gap-1.5 py-2"
              >
                <span
                  className={
                    stage.complete
                      ? "h-1.5 w-full rounded-full bg-emerald-400"
                      : active
                        ? "h-1.5 w-full rounded-full bg-afca-yellow"
                        : "h-1.5 w-full rounded-full bg-afca-blue/50 transition group-hover:bg-afca-sky"
                  }
                />
                <span
                  className={
                    stage.complete
                      ? "text-[10px] font-bold text-emerald-400"
                      : active
                        ? "text-[10px] font-bold text-afca-yellow"
                        : "text-[10px] font-bold text-afca-sky/60 transition group-hover:text-white"
                  }
                >
                  {stage.complete ? "✓" : index + 1}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 text-[11px] font-bold tracking-tight text-white">
        {activeLabel}
        <span className="ml-2 font-normal text-afca-skylight/60">
          Step {activeIndex + 1} of {stages.length}
        </span>
      </p>
    </div>
  );
}

function optionsFor(field: FieldDef, state: ComplaintState): readonly string[] | null {
  if (field.options) return field.options;
  if (field.path === "service.subtype") return SERVICE_SUBTYPES[state.service.type] ?? null;
  return null;
}

/**
 * The "what is this asking me?" answer, one tap or hover away.
 *
 * Hover alone would strand anyone on a touch screen or a keyboard, and this
 * form has interpreter and support-needs fields — the people least served by
 * hover-only help are exactly the ones it asks about. So: hover, focus and
 * click all open it, Escape closes it, and the bubble is wired to the label
 * with aria-describedby rather than left as decoration.
 */
function InfoTooltip({ label, help }: { label: string; help: string }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const id = useId();
  const open = pinned || hovered;

  return (
    <span
      className="relative flex-none"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((was) => !was)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onKeyDown={(event) => {
          // Both flags: focus opens the bubble too, so clearing only `pinned`
          // would leave a keyboard user with no way to dismiss it short of
          // tabbing away.
          if (event.key !== "Escape") return;
          setPinned(false);
          setHovered(false);
        }}
        className={
          open
            ? "flex h-4 w-4 items-center justify-center rounded-full bg-afca-blue text-[9px] font-bold text-white"
            : "flex h-4 w-4 items-center justify-center rounded-full bg-afca-skylight text-[9px] font-bold text-afca-blue transition hover:bg-afca-blue hover:text-white"
        }
      >
        i
      </button>
      {open && (
        // Anchored left, not right. The icon trails the label, so it sits near
        // the left edge of the pane — hanging the bubble off its right edge
        // pushes it into the scroll container's unreachable negative-x overflow
        // and silently crops it. Growing rightwards, 208px clears the pane.
        <span
          id={id}
          role="tooltip"
          className="absolute left-0 top-5 z-20 w-52 rounded-lg bg-afca-navy px-2.5 py-1.5 text-[10px] font-normal leading-snug text-white shadow-lg"
        >
          {help}
        </span>
      )}
    </span>
  );
}

/**
 * A field is both a steering target (click the label to send the conversation
 * back to it) and directly editable, so nothing is a dead end.
 */
function Field({
  field,
  state,
  focused,
  justChanged,
  onFocusField,
  onEdit,
  onCommit,
}: {
  field: FieldDef;
  state: ComplaintState;
  focused: boolean;
  /** Written by the turn that just landed — flashed so the write is visible. */
  justChanged: boolean;
  onFocusField: (path: string) => void;
  onEdit: (path: string, value: unknown) => void;
  /** Called when the person leaves a field, for checks too eager per keystroke. */
  onCommit: (path: string) => void;
}) {
  const value = getPath(state, field.path);
  const answered = isAnswered(field, state);
  const options = optionsFor(field, state);
  // Whether this field is being typed into, which is the only time a masked
  // account number shows in full. See the value expression below.
  const [editing, setEditing] = useState(false);

  const control = (() => {
    if (field.kind === "consent") {
      return (
        <label className="flex items-center gap-2 text-xs font-semibold text-afca-navy">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => onEdit(field.path, event.target.checked)}
            className="h-4 w-4 rounded border-afca-line accent-afca-blue"
          />
          I agree
        </label>
      );
    }

    if (field.kind === "bool") {
      return (
        <div className="flex gap-1.5">
          {[true, false].map((option) => (
            <button
              key={String(option)}
              type="button"
              onClick={() => onEdit(field.path, option)}
              className={
                value === option
                  ? "min-h-11 rounded-full bg-afca-navy px-5 py-2 text-sm font-semibold text-white"
                  : "min-h-11 rounded-full bg-white px-5 py-2 text-sm text-afca-navy ring-1 ring-afca-line transition hover:bg-afca-skylight"
              }
            >
              {option ? "Yes" : "No"}
            </button>
          ))}
        </div>
      );
    }

    if (options) {
      return (
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onEdit(field.path, event.target.value)}
          className="w-full rounded-lg border border-afca-line bg-white px-2.5 py-1.5 text-xs text-afca-navy outline-none focus:border-afca-blue"
        >
          <option value="">—</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option === "not_sure" ? "Not sure" : option}
            </option>
          ))}
        </select>
      );
    }

    if (field.kind === "list") {
      const list = Array.isArray(value) ? (value as string[]) : [];
      const suggestions = field.path === "complaint.issues" ? SERVICE_ISSUES[state.service.type] : undefined;
      return (
        <div className="space-y-1">
          {list.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {list.map((item) => (
                <li key={item} className="rounded-full bg-afca-skylight px-2 py-0.5 text-[11px] font-semibold text-afca-navy">
                  {item}
                  <button
                    type="button"
                    className="ml-1 text-afca-blue/60 hover:text-afca-navy"
                    onClick={() => onEdit(field.path, list.filter((entry) => entry !== item))}
                    aria-label={`Remove ${item}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {suggestions && (
            <select
              value=""
              onChange={(event) => {
                if (event.target.value) onEdit(field.path, [...new Set([...list, event.target.value])]);
              }}
              className="w-full rounded-lg border border-afca-line bg-white px-2.5 py-1.5 text-xs text-afca-navy outline-none focus:border-afca-blue"
            >
              <option value="">Add an issue…</option>
              {suggestions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
          {/* Only Superannuation and Credit have a suggestion list, but "What
              went wrong" is required for all six service types — without this
              the field is unfillable, and the form uncompletable, for the other
              four. Free text here mirrors what the subtype field already does
              for the service types that are not modelled in full. */}
          {!suggestions && field.path === "complaint.issues" && (
            <input
              type="text"
              placeholder="Type what went wrong, then press Enter"
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const entry = event.currentTarget.value.trim();
                if (entry === "") return;
                onEdit(field.path, [...new Set([...list, entry])]);
                event.currentTarget.value = "";
              }}
              className="w-full rounded-lg border border-afca-line bg-white px-2.5 py-1.5 text-xs text-afca-navy outline-none focus:border-afca-blue"
            />
          )}
        </div>
      );
    }

    if (field.kind === "longtext") {
      return (
        <textarea
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onEdit(field.path, event.target.value)}
          rows={4}
          // Stops the typing at the limit rather than letting someone write
          // past it and silently losing the tail on the way into the state.
          maxLength={NARRATIVE_MAX}
          className="w-full rounded-lg border border-afca-line bg-white px-2.5 py-1.5 text-xs text-afca-navy outline-none focus:border-afca-blue"
        />
      );
    }

    const text = (
      <input
        type={field.kind === "date" ? "text" : field.kind === "email" ? "email" : "text"}
        // Dates are stored ISO and shown day-first. A part-typed date is not
        // ISO, so it passes through as typed and reads back as DD/MM/YYYY once
        // blur has committed it. Someone typing a full ISO date by hand sees it
        // flip as the last digit lands — odd, but this is an Australian form
        // and it lands on the format we want.
        value={
          typeof value !== "string"
            ? ""
            : field.kind === "date"
              ? formatDateAU(value)
              : // An account number is masked while it sits there and shown in
                // full while it is being typed. Masking the value outright
                // would make the field uneditable — the person would be typing
                // into their own bullets — so the swap is on focus, which also
                // means nobody is ever prevented from checking what they
                // entered. The state always holds what they typed.
                field.path === "firm.account_number" && !editing
                ? maskAccount(value)
                : value
        }
        onChange={(event) => onEdit(field.path, event.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          onCommit(field.path);
        }}
        placeholder={field.kind === "date" ? "DD/MM/YYYY — e.g. 3 Sept 2025" : ""}
        className="w-full rounded-lg border border-afca-line bg-white px-2.5 py-1.5 text-xs text-afca-navy outline-none focus:border-afca-blue"
      />
    );

    if (field.kind !== "date") return text;

    // Typing stays the primary way in — it accepts "3 Sept" and the other
    // shapes people actually write. The picker is for the person who would
    // rather not think about format at all, and it hands back ISO, which is
    // already what we store. Its own value is blanked while a date is
    // part-typed: type="date" takes nothing but ISO and complains otherwise.
    //
    // The date input lies invisibly ON TOP of the calendar button at full
    // size, rather than being hidden away and opened by script. Chrome will
    // not anchor a picker to something it cannot measure — showPicker() on a
    // 1px sr-only input throws NotAllowedError even from a real click — and
    // its own calendar indicator, stretched over the whole box, opens the
    // popup on an ordinary click with nothing for us to call.
    return (
      <div className="flex items-center gap-1.5">
        {text}
        <span className="relative shrink-0">
          <span
            aria-hidden
            className="pointer-events-none flex h-[30px] w-[34px] items-center justify-center rounded-lg border border-afca-line bg-white text-xs text-afca-blue"
          >
            📅
          </span>
          <input
            type="date"
            value={typeof value === "string" && ISO_DATE.test(value) ? value : ""}
            // A picked date is already whole, so it commits at once rather
            // than waiting for a blur that a popup never really produces.
            onChange={(event) => {
              onEdit(field.path, event.target.value);
              onCommit(field.path);
            }}
            // Neither a birth nor a complaint can be in the future, and the
            // form says so on commit — the picker just declines to offer it.
            max={todayIso()}
            min="1900-01-01"
            title="Pick from a calendar"
            aria-label={`Pick ${field.label.toLowerCase()} from a calendar`}
            className="date-picker-overlay absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </span>
      </div>
    );
  })();

  return (
    <div
      // The flash is how a write the chat claims becomes a write the person
      // sees. It is keyed on the turn, not on the value, so correcting a field
      // back to something it held earlier still shows movement.
      data-just-changed={justChanged ? "true" : undefined}
      className={
        focused
          ? "rounded-xl border-2 border-afca-sky bg-afca-skylight/60 p-2.5"
          : justChanged
            ? "field-flash rounded-xl border-2 border-transparent p-2.5"
            : "rounded-xl border-2 border-transparent p-2.5 transition hover:bg-afca-skylight/40"
      }
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onFocusField(field.path)}
            className="text-left text-xs font-bold text-afca-navy transition hover:text-afca-blue hover:underline"
            title="Ask me about this"
          >
            {field.label}
            {field.required && !answered && <span className="ml-1 text-afca-amber">•</span>}
            {field.sensitive && <span className="ml-1 text-[10px] font-normal text-afca-blue/60">optional</span>}
          </button>
          {field.help && <InfoTooltip label={field.label} help={field.help} />}
        </span>
        {answered && <span className="flex-none text-[10px] font-bold text-emerald-600">✓</span>}
      </div>
      {control}
    </div>
  );
}

export function FormPane({
  state,
  stages,
  activeStageId,
  focusPath,
  changed,
  onFocusField,
  onEdit,
  onCommit,
  onAttach,
  children,
}: {
  state: ComplaintState;
  stages: StageStatus[];
  activeStageId: string | null;
  focusPath: string | null;
  /**
   * Paths the last turn actually wrote, from the route's own before/after
   * diff. The chat says what it did; this is the form saying the same thing,
   * which is the half the person can check.
   */
  changed: readonly string[];
  onFocusField: (path: string) => void;
  onEdit: (path: string, value: unknown) => void;
  onCommit: (path: string) => void;
  onAttach: (names: string[]) => void;
  children?: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Anything shown above the form — the review panel, a draft card — mounts at
  // the top of this pane while it keeps whatever offset the person had scrolled
  // to. Several stages down the form that put the review panel thousands of
  // pixels above the viewport: the screen did not visibly change, so "Review"
  // read as a dead button and the Download JSON that /privacy points people to
  // could not be found. Below `lg` the window scrolls rather than this
  // container, so scrolling the panel itself into view is what covers both.
  const overlayKey = revealKey(children);
  useEffect(() => {
    if (overlayKey === null) return;
    scroller.current?.firstElementChild?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [overlayKey]);

  function jump(id: string): void {
    document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-afca-mist">
      <ProgressRail stages={stages} activeId={activeStageId} onJump={jump} />
      <div ref={scroller} className="flex-1 overflow-y-auto p-4">
        {children}
        {STAGES.filter((stage) => stage.fields.length > 0).map((stage) => (
          <div key={stage.id} id={`stage-${stage.id}`} className="mb-5 scroll-mt-4">
            {/* The section header carries why AFCA asks for any of this. The
                fields already say what to type; coaching someone to write a
                complaint that meets the criteria is the half of this product
                the plumbing cannot do. Same tooltip component as the fields,
                so there is one thing to learn rather than two. */}
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-afca-blue">
              {stage.title}
              {stage.why && <InfoTooltip label={`why ${stage.title} matters`} help={stage.why} />}
            </h3>
            <div className="space-y-0.5 rounded-2xl border border-afca-line bg-white p-2 shadow-sm">
              {stage.fields
                .filter((field) => applies(field, state))
                .map((field) => (
                  <Field
                    key={field.path}
                    field={field}
                    state={state}
                    focused={focusPath === field.path}
                    justChanged={changed.includes(field.path)}
                    onFocusField={onFocusField}
                    onEdit={onEdit}
                    onCommit={onCommit}
                  />
                ))}
              {/* Not a form field — nobody types this. It is what the directory
                  resolved from the firm's name, and watching it appear is the
                  point of the demo's first beat, so it belongs beside the firm
                  rather than only in the review. `summarise` shows it the same
                  way. */}
              {stage.id === "firm" && state.firm.afca_member_no && (
                <div className="flex items-center justify-between px-2.5 py-2 text-xs">
                  <span className="font-semibold text-afca-navy/70">AFCA member number</span>
                  <span className="font-mono font-bold text-afca-navy">
                    {state.firm.afca_member_no}
                  </span>
                </div>
              )}
              {stage.id === "attachments" && (
                <div className="p-2.5">
                  <input
                    type="file"
                    multiple
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []).map((file) => file.name);
                      if (files.length > 0) onAttach(files);
                    }}
                    className="w-full text-[11px] text-afca-navy/60 file:mr-2 file:rounded-full file:border-0 file:bg-afca-skylight file:px-3 file:py-1 file:text-[11px] file:font-semibold file:text-afca-navy"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
