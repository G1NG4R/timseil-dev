import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * A labelled input, with its error tied to it.
 *
 * THE HANDOFF'S VERSION CANNOT BE A SERVER COMPONENT, and that is this phase's
 * finding on these four files rather than a preference. It generates its ids
 * with `useId()`, and a hook makes the component client-only — which would ship
 * JavaScript for markup that has no behaviour, on the one page (H8's contact
 * form) where the field appears in numbers. ADR 0043 predicted a find of this
 * class for the remaining handoff components; this is it, and it is smaller
 * than the ThemeSwitch one.
 *
 * SO `name` IS REQUIRED AND THE IDS COME FROM IT. A form field has a name
 * anyway — it is what the value is posted under — and deriving from it gives
 * ids that are stable across renders and readable in a bug report, which
 * `useId`'s `«r3»` is not.
 *
 * `error` is a string, never a boolean: a field that is wrong owes the reason,
 * which is STATE.05's rule for every dead state on this site. Validation
 * happens on submit and not on every keystroke — the sheet is explicit, and the
 * caller owns it either way.
 */
export function Field({
  name,
  label,
  error,
  hint,
  counter,
  multiline,
  ...rest
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  counter?: string;
  multiline?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement> & TextareaHTMLAttributes<HTMLTextAreaElement>, "name">) {
  const errorId = `${name}-error`;
  const aside = counter ?? hint;

  // `value` may be a controlled empty string, so the filled state asks whether
  // there is anything there rather than whether the prop was passed. React types
  // it without `null`, and the linter is right that testing for one is noise.
  const filled = rest.value !== undefined && String(rest.value) !== "";

  const shared = {
    id: name,
    name,
    className: "field-input",
    "data-filled": filled ? "" : undefined,
    "aria-invalid": error === undefined ? undefined : true,
    "aria-describedby": error === undefined ? undefined : errorId,
  } as const;

  return (
    <div className="field">
      <div className="field-top">
        <label className="field-label" htmlFor={name}>
          {label}
        </label>
        {aside === undefined ? null : <span className="field-aside">{aside}</span>}
      </div>

      {multiline === true ? (
        <textarea {...shared} {...rest} />
      ) : (
        <input {...shared} {...rest} />
      )}

      {error === undefined ? null : (
        <p className="field-error" id={errorId}>
          ▸ {error}
        </p>
      )}
    </div>
  );
}
