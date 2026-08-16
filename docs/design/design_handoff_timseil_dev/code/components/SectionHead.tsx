/** SYS.NN + Titel + optionale Meta rechts. Der Kopf wipet beim Scrollen ein —
 *  Endzustand ist der Default, die Animation steckt in .reveal (globals.css). */
export function SectionHead({ id, title, meta }: { id: string; title: string; meta?: string }) {
  return (
    <div
      className="reveal"
      style={{
        display: 'flex', alignItems: 'baseline', gap: 'var(--s-16)',
        borderBottom: '1px solid var(--line)', paddingBottom: 'var(--s-12)', marginBottom: 'var(--s-34)',
      }}
    >
      <span style={{ font: `600 var(--t-mono-12)/1 var(--mono)`, letterSpacing: '.14em', color: 'var(--acc)' }}>{id}</span>
      <span style={{ font: `600 var(--t-mono-12)/1 var(--mono)`, letterSpacing: '.20em', color: 'var(--ink)' }}>
        {title.toUpperCase()}
      </span>
      <span style={{ flex: 1 }} />
      {meta && (
        <span style={{ font: `500 var(--t-mono-9)/1 var(--mono)`, letterSpacing: '.12em', color: 'var(--dim)' }}>
          {meta.toUpperCase()}
        </span>
      )}
    </div>
  );
}
