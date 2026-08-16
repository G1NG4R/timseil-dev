import { useId } from 'react';

/** Label über dem Feld, Fehler am Feld angebunden, Zähler rechts oben.
 *  Prüfung erst beim Absenden — nicht bei jedem Tastendruck. */
export function Field({
  label, error, hint, counter, multiline, ...rest
}: {
  label: string; error?: string; hint?: string; counter?: string; multiline?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement> & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const errId = `${id}-err`;
  const border = error ? 'var(--alert)' : rest.value ? 'rgba(0,229,255,.4)' : 'var(--line-strong)';
  const field: React.CSSProperties = {
    width: '100%', padding: '13px 15px',
    background: 'var(--bg)', border: `1px solid ${border}`, borderRadius: 'var(--radius)',
    color: 'var(--ink)', font: `400 var(--t-body-13)/1.7 var(--mono)`,
    outline: 'none', transition: 'border-color var(--d-color) linear',
  };
  const Tag = (multiline ? 'textarea' : 'input') as 'input';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-8)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-10)' }}>
        <label htmlFor={id} style={{ font: `500 var(--t-mono-10)/1 var(--mono)`, letterSpacing: 'var(--ls-label)', color: 'var(--steel)' }}>
          {label.toUpperCase()}
        </label>
        <span style={{ flex: 1 }} />
        {(counter ?? hint) && (
          <span style={{ font: `400 var(--t-mono-9)/1 var(--mono)`, color: 'var(--dim)' }}>{counter ?? hint}</span>
        )}
      </div>
      <Tag id={id} aria-invalid={!!error} aria-describedby={error ? errId : undefined} style={field} {...rest} />
      {error && (
        <div id={errId} style={{ font: `400 var(--t-mono-10)/1.6 var(--mono)`, color: 'var(--alert)' }}>
          ▸ {error}
        </div>
      )}
    </div>
  );
}
