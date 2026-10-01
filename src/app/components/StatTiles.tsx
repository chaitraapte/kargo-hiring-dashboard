import type { Stats } from "@/lib/types";

const BAND_ORDER = ["PRIORITY_SHORTLIST", "SHORTLIST", "HOLD", "DECLINE_QUEUE"] as const;
const BAND_BAR_COLOR: Record<string, string> = {
  PRIORITY_SHORTLIST: "bg-emerald-400",
  SHORTLIST: "bg-navy-400",
  HOLD: "bg-amber-400",
  DECLINE_QUEUE: "bg-stone-300",
};

export function StatTiles({ stats }: { stats: Stats }) {
  const bandTotal = BAND_ORDER.reduce((sum, b) => sum + (stats.bandCounts[b] ?? 0), 0) || 1;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1.4fr]">
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-sm text-stone-500">Total resumes</p>
        <p className="mt-1 text-4xl font-semibold tracking-tight text-navy-950">{stats.total}</p>
        <div className="mt-6 flex h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
          {BAND_ORDER.map((b) => {
            const count = stats.bandCounts[b] ?? 0;
            if (count === 0) return null;
            return (
              <div
                key={b}
                className={BAND_BAR_COLOR[b]}
                style={{ width: `${(count / bandTotal) * 100}%` }}
                title={`${b.replace("_", " ")}: ${count}`}
              />
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
          {BAND_ORDER.map((b) => (
            <span key={b} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${BAND_BAR_COLOR[b]}`} />
              {b.replace("_", " ")}: {stats.bandCounts[b] ?? 0}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <AssetTile label="Sent to interview" value={stats.advanced} tint="bg-emerald-50 text-emerald-900" dot="bg-emerald-500" />
        <AssetTile label="Rejected" value={stats.declined} tint="bg-rose-50 text-rose-900" dot="bg-rose-500" />
        <AssetTile label="Pending review" value={stats.pending} tint="bg-amber-50 text-amber-900" dot="bg-amber-500" />
      </div>
    </div>
  );
}

function AssetTile({ label, value, tint, dot }: { label: string; value: number; tint: string; dot: string }) {
  return (
    <div className={`flex flex-col justify-between rounded-3xl p-5 shadow-sm ${tint}`}>
      <div className="flex items-center justify-between">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      </div>
      <div>
        <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs opacity-70">{label}</p>
      </div>
    </div>
  );
}
