export function Badge({ tone, children }: { tone: "ok" | "warn" | "muted"; children: React.ReactNode }) {
  const cls = {
    ok: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
    warn: "bg-amber-50 text-amber-800 ring-amber-600/20",
    muted: "bg-gray-50 text-gray-600 ring-gray-500/20",
  }[tone];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${cls}`}>{children}</span>;
}
