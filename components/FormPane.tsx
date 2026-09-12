"use client";

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
 * A field is both a steering target (click the label to send the conversation
 * back to it) and directly editable, so nothing is a dead end.
 */
function Field({
  field,
  state,
  focused,
  onFocusField,
  onEdit,
  onCommit,
}: {
  field: FieldDef;
  state: ComplaintState;
  focused: boolean;
  onFocusField: (path: string) => void;
  onEdit: (path: string, value: unknown) => void;
  /** Called when the person leaves a field, for checks too eager per keystroke. */
  onCommit: (path: string) => void;
}) {
  const value = getPath(state, field.path);
  const answered = isAnswered(field, state);
  const options = optionsFor(field, state);

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
          {!suggestions && (
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

    return (
      <input
        type={field.kind === "date" ? "text" : field.kind === "email" ? "email" : "text"}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onEdit(field.path, event.target.value)}
        onBlur={() => onCommit(field.path)}
        placeholder={field.kind === "date" ? "e.g. 3 Sept 2025" : ""}
        className="w-full rounded-lg border border-afca-line bg-white px-2.5 py-1.5 text-xs text-afca-navy outline-none focus:border-afca-blue"
      />
    );
  })();

  return (
    <div
      className={
        focused
          ? "rounded-xl border-2 border-afca-sky bg-afca-skylight/60 p-2.5"
          : "rounded-xl border-2 border-transparent p-2.5 transition hover:bg-afca-skylight/40"
      }
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
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
        {answered && <span className="text-[10px] font-bold text-emerald-600">✓</span>}
      </div>
      {control}
      {field.help && <p className="mt-1 text-[10px] text-afca-navy/50">{field.help}</p>}
    </div>
  );
}

export function FormPane({
  state,
  stages,
  activeStageId,
  focusPath,
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
  onFocusField: (path: string) => void;
  onEdit: (path: string, value: unknown) => void;
  onCommit: (path: string) => void;
  onAttach: (names: string[]) => void;
  children?: React.ReactNode;
}) {
  function jump(id: string): void {
    document.getElementById(`stage-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-afca-mist">
      <ProgressRail stages={stages} activeId={activeStageId} onJump={jump} />
      <div className="flex-1 overflow-y-auto p-4">
        {children}
        {STAGES.filter((stage) => stage.fields.length > 0).map((stage) => (
          <div key={stage.id} id={`stage-${stage.id}`} className="mb-5 scroll-mt-4">
            <h3 className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-afca-blue">
              {stage.title}
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
                    onFocusField={onFocusField}
                    onEdit={onEdit}
                    onCommit={onCommit}
                  />
                ))}
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
