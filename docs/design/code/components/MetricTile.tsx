/** Zeigt nie 0 statt fehlender Daten: ohne Wert steht "— NO DATA".
 *  Metriken werden ausschließlich für Systeme mit state === 'live' gerendert. */
export function MetricTile({ label, value, unit, warn }: {
  label: string; value?: number | string; unit?: string; warn?: boolean;
}) {
  const has = value !== undefined && value !== null;
  return (
    <div style={{
      padding: 'var(--s-12)', background: 'var(--panel)',
      border: `1px ${has ? 'solid' : 'dashed'} var(--line-soft)`, borderRadius: 'var(--radius)',
    }}>
      <div style={{ font: `400 var(--t-mono-9)/1 var(--mono)`, letterSpacing: '.12em', color: 'var(--dim)', marginBottom: 'var(--s-6)' }}>
        {label.toUpperCase()}
      </div>
      <div style={{
        font: `600 var(--t-disp-26)/1 var(--mono)`, fontVariantNumeric: 'tabular-nums',
        color: has ? (warn ? 'var(--amber)' : 'var(--ink)') : 'var(--dim)',
      }}>
        {has ? value : '—'}
        {has && unit && <span style={{ fontSize: 'var(--t-mono-11)', color: 'var(--dim)' }}>{unit}</span>}
        {!has && <span style={{ fontSize: 'var(--t-mono-11)' }}> NO DATA</span>}
      </div>
    </div>
  );
}
