export function inr(n: number, digits = 2): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}₹${abs.toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function usdt(n: number, digits = 4): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toFixed(digits)}`;
}

export function px(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 10) return n.toFixed(3);
  if (n >= 1) return n.toFixed(4);
  return n.toPrecision(4);
}

export function pct(n: number, digits = 3): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(digits)}%`;
}

export function bps(n: number): string {
  return `${(n * 1e4).toFixed(1)} bp`;
}

export function base(symbol: string): string {
  return symbol.replace(/USDT$/i, "");
}

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

export function hhmmss(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-IN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function clsDelta(n: number): string {
  if (n > 0) return "text-long";
  if (n < 0) return "text-short";
  return "text-muted";
}
