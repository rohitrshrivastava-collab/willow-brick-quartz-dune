export function Spark({
  values,
  className = "",
  positive = true,
}: {
  values: number[];
  className?: string;
  positive?: boolean;
}) {
  if (values.length < 2) {
    return <svg className={className} viewBox="0 0 80 24" aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 80;
      const y = 22 - ((v - min) / span) * 20;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className={className} viewBox="0 0 80 24" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={positive ? "currentColor" : "currentColor"}
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
