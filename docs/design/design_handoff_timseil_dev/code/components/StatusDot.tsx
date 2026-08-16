type Status = 'live' | 'degraded' | 'offline';

const color: Record<Status, string> = {
  live: 'var(--acc)', degraded: 'var(--amber)', offline: 'var(--alert)',
};

/** Zustand nie nur über Farbe: das Wort steht immer daneben. */
export function StatusDot({ status, label }: { status: Status; label?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-8)' }}>
      <span
        aria-hidden
        style={{
          width: 7, height: 7, borderRadius: 'var(--radius-dot)', background: color[status],
          animation: status === 'live' ? 'ts-pulse 2.4s ease-in-out infinite' : undefined,
        }}
      />
      <span style={{ font: `600 var(--t-mono-11)/1 var(--mono)`, letterSpacing: 'var(--ls-head)', color: color[status] }}>
        {(label ?? status).toUpperCase()}
      </span>
    </span>
  );
}
