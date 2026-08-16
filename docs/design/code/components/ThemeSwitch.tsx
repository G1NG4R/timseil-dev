'use client';
import { useEffect, useState } from 'react';

export const THEMES = [
  { id: '',          label: 'Terminal Noir',     swatch: '#00E5FF' },
  { id: 'mocha',     label: 'Catppuccin Mocha',  swatch: '#CBA6F7' },
  { id: 'amber',     label: 'Amber CRT',         swatch: '#FFB74A' },
  { id: 'phosphor',  label: 'Phosphor',          swatch: '#2EE6A6' },
  { id: 'tokyo',     label: 'Tokyo Night',       swatch: '#7AA2F7' },
  { id: 'latte',     label: 'Catppuccin Latte',  swatch: '#EFF1F5' },
  { id: 'gruvbox',   label: 'Gruvbox Light',     swatch: '#FBF1C7' },
] as const;

export const THEME_KEY = 'ts.theme';

/** Gehört in die Fußzeile, nicht in die Navigation: es ist eine Vorliebe,
 *  kein Ziel. Ohne Wahl folgt die Seite prefers-color-scheme (siehe tokens.css).
 *  Das Setzen vor dem ersten Paint macht das Inline-Skript im Layout. */
export function ThemeSwitch() {
  const [active, setActive] = useState<string>('');

  useEffect(() => {
    setActive(document.documentElement.dataset.theme ?? '');
  }, []);

  function pick(id: string) {
    const el = document.documentElement;
    if (id) el.dataset.theme = id; else delete el.dataset.theme;
    try { id ? localStorage.setItem(THEME_KEY, id) : localStorage.removeItem(THEME_KEY); } catch {}
    setActive(id);
  }

  return (
    <div role="radiogroup" aria-label="Farbschema"
         style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-8)' }}>
      <span style={{ font: `500 var(--t-mono-9)/1 var(--mono)`, letterSpacing: '.12em', color: 'var(--dim)' }}>
        THEME
      </span>
      {THEMES.map(t => {
        const on = t.id === active;
        return (
          <button
            key={t.id || 'noir'}
            role="radio"
            aria-checked={on}
            aria-label={t.label}
            title={t.label}
            onClick={() => pick(t.id)}
            style={{
              width: 11, height: 11, padding: 0, cursor: 'pointer',
              background: t.swatch,
              border: `1px solid ${on ? t.swatch : 'var(--line-strong)'}`,
              borderRadius: 'var(--radius)',
              opacity: on ? 1 : 0.55,
              transition: 'opacity var(--d-color) linear',
            }}
          />
        );
      })}
    </div>
  );
}
