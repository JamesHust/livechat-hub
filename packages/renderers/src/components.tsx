/**
 * Built-in generative-UI components — a small starter set the agent can render
 * by name via a `canvas` / `CUSTOM_UI` part with no host registration. Hosts
 * override or extend these by passing their own map to the SDK (`components`);
 * {@link resolveComponents} merges host entries over these defaults.
 *
 * These render inside the message list but live in this package (which Tailwind
 * does NOT scan), so they are styled with inline `var(--lch-*)` tokens rather
 * than utility classes — keeping them Shadow-DOM-safe and theme-reactive.
 */
import type { CSSProperties } from 'react';
import type {
  GenerativeComponent,
  GenerativeComponentMap,
  GenerativeComponentProps,
} from './types';

interface Bar {
  label: string;
  value: number;
}

/** Coerce an unknown props payload into a typed bar list (defensive). */
function toBars(value: unknown): Bar[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const numeric = typeof record.value === 'number' ? record.value : Number(record.value);
    if (!Number.isFinite(numeric)) return [];
    return [{ label: String(record.label ?? ''), value: numeric }];
  });
}

const chartCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 12,
  borderRadius: 'var(--lch-radius-sm, 8px)',
  border: '1px solid var(--lch-border)',
  background: 'var(--lch-surface)',
};

/**
 * A dependency-free vertical bar chart. Props: `title?`, `unit?`, and
 * `bars: { label, value }[]`. The visual bars are decorative (`aria-hidden`);
 * the figure carries a text summary for screen readers.
 */
export function BarChart({ props }: GenerativeComponentProps) {
  const title = typeof props.title === 'string' ? props.title : undefined;
  const unit = typeof props.unit === 'string' ? props.unit : '';
  const bars = toBars(props.bars);
  const max = bars.reduce((m, b) => Math.max(m, b.value), 0) || 1;
  const summary = bars.map((b) => `${b.label} ${b.value}${unit}`).join(', ');

  return (
    <figure style={{ ...chartCardStyle, margin: 0 }}>
      {title && <figcaption style={{ fontWeight: 600 }}>{title}</figcaption>}
      <div
        role="img"
        aria-label={title ? `${title}: ${summary}` : summary}
        style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}
      >
        {bars.map((bar, i) => (
          <div
            key={i}
            aria-hidden="true"
            style={{
              display: 'flex',
              flex: 1,
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              height: '100%',
            }}
          >
            <div style={{ display: 'flex', flex: 1, alignItems: 'flex-end', width: '100%' }}>
              <div
                style={{
                  width: '100%',
                  height: `${Math.max(4, (bar.value / max) * 100)}%`,
                  borderRadius: '4px 4px 0 0',
                  background: 'var(--lch-primary)',
                  transition: 'height 0.3s ease',
                }}
              />
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--lch-text)' }}>
              {bar.value}
              {unit}
            </span>
            <span
              style={{
                fontSize: '0.7rem',
                color: 'var(--lch-text-muted, var(--lch-text))',
                opacity: 0.7,
              }}
            >
              {bar.label}
            </span>
          </div>
        ))}
      </div>
    </figure>
  );
}

interface StatRow {
  label: string;
  value: string;
}

function toRows(value: unknown): StatRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    return [{ label: String(record.label ?? ''), value: String(record.value ?? '') }];
  });
}

/** A simple label/value list. Props: `title?`, `items: { label, value }[]`. */
export function StatList({ props }: GenerativeComponentProps) {
  const title = typeof props.title === 'string' ? props.title : undefined;
  const rows = toRows(props.items);
  return (
    <div style={chartCardStyle}>
      {title && <strong>{title}</strong>}
      <dl style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: 0 }}>
        {rows.map((row, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <dt style={{ color: 'var(--lch-text-muted, var(--lch-text))', opacity: 0.75 }}>
              {row.label}
            </dt>
            <dd style={{ margin: 0, fontWeight: 600 }}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The starter generative components available to every deployment by default. */
export const defaultComponents: GenerativeComponentMap = {
  bar_chart: BarChart as GenerativeComponent,
  stat_list: StatList as GenerativeComponent,
};

/** Merge host-registered components over the built-in defaults. */
export function resolveComponents(overrides?: GenerativeComponentMap): GenerativeComponentMap {
  if (!overrides) return defaultComponents;
  return { ...defaultComponents, ...overrides };
}
