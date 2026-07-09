interface Props {
  label: string;
  /** the cow's series, oldest first */
  series: number[];
  /** herd-mean series drawn dimmed behind, for comparison */
  compare?: number[];
  /** formatted current value shown on the right */
  value: string;
  colour?: string;
}

function path(values: number[], min: number, max: number): string {
  const range = max - min || 1;
  const n = values.length;
  return values
    .map((v, i) => {
      const x = (i / Math.max(1, n - 1)) * 100;
      const y = 26 - ((v - min) / range) * 24;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Tiny 24 h history chart: cow line in colour, herd mean dimmed behind. */
export default function Sparkline({ label, series, compare, value, colour = '#4fc38a' }: Props) {
  if (series.length < 3) return null;
  const all = compare ? series.concat(compare) : series;
  const min = Math.min(...all);
  const max = Math.max(...all);

  return (
    <div className="sparkline">
      <div className="sparkline-head">
        <span className="dim">{label}</span>
        <span>{value}</span>
      </div>
      <svg viewBox="0 0 100 28" preserveAspectRatio="none">
        {compare && compare.length >= 3 && (
          <path d={path(compare, min, max)} fill="none" stroke="#5a6b7a" strokeWidth="1" strokeDasharray="2 2" />
        )}
        <path d={path(series, min, max)} fill="none" stroke={colour} strokeWidth="1.5" />
      </svg>
    </div>
  );
}
