// Spiegel der Tokens für JS-Logik (Canvas, Messungen, Animationen).
// Farben und Größen bleiben in tokens.css die Quelle — hier stehen nur
// Werte, die Code braucht, nicht CSS.

export const duration = {
  row: 90, color: 120, bracket: 140, glow: 160,
  scramble: 220, glitch: 280, wipe: 340, reveal: 420, decode: 540,
} as const;

export const easing = {
  snap: 'cubic-bezier(.2,.9,.1,1)',
  wipe: 'cubic-bezier(.4,0,.2,1)',
  out: 'ease-out',
} as const;

export const scroll = {
  headerWipe: { start: 'entry 12%', end: 'entry 60%' },
  rowStagger: 60,
  graphColumn: 12,
  pinViewports: 1.4,
  parallax: { ruler: 0.4, grid: 0.15 },
} as const;

/** Zustände des Trainings-Logs. Abgeleitet aus Projektbelegen, nie gesetzt. */
export type SkillState = 'CORE' | 'APPLIED' | 'LEARNING' | 'QUEUED';

export function skillState(liveProjects: number, inBuild: number): SkillState {
  if (liveProjects >= 2) return 'CORE';
  if (liveProjects === 1) return 'APPLIED';
  if (inBuild > 0) return 'LEARNING';
  return 'QUEUED';
}

/** Systemzustand steuert, ob Metriken überhaupt gerendert werden. */
export type SystemState = 'live' | 'in_build' | 'planned';
export const showsMetrics = (s: SystemState) => s === 'live';
