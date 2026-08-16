import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const base: React.CSSProperties = {
  display: 'inline-block',
  font: `600 var(--t-mono-11)/1 var(--mono)`,
  letterSpacing: '.13em',
  padding: '12px 20px',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
  transition: 'color var(--d-color) linear, background var(--d-color) linear, border-color var(--d-color) linear',
};

const variants: Record<Variant, React.CSSProperties> = {
  primary:   { background: 'var(--acc)', color: 'var(--on-cyan)', border: '1px solid var(--acc)' },
  secondary: { background: 'transparent', color: 'var(--ink-2)', border: '1px solid var(--line-strong)' },
  ghost:     { background: 'transparent', color: 'var(--dim)', border: '1px solid transparent', padding: '12px 4px' },
};

export function Button({
  children, variant = 'primary', ...rest
}: { children: ReactNode; variant?: Variant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} data-variant={variant} style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  );
}

/* Hover gehört in CSS, nicht in JS — eine Regel pro Variante:
   [data-variant="primary"]:hover   { background: var(--acc-hi); border-color: var(--acc-hi) }
   [data-variant="secondary"]:hover { color: var(--acc); border-color: rgba(0,229,255,.5) }
   [data-variant="ghost"]:hover     { color: var(--acc) }
   Kein transform, kein scale: Hover verschiebt nichts. */
