import { cn } from "@/lib/utils";
import { percentOf, type BarDatum, type MonthBucket } from "@/lib/osa/report-charts";

/**
 * The Reports page's charts, drawn as plain HTML on the server: no chart
 * library reaches the browser, they print, and they read in both themes
 * through the --chart-* tokens in globals.css. Hover or keyboard focus on a
 * column or bar shows its detail; every chart also has its numbers as text.
 */

/** Height of the column plot, in pixels. Labels sit outside it. */
const PLOT_HEIGHT = 144;

export function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-5", className)}>
      <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
      {description && <p className="mt-0.5 text-base text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Cases filed per month: one column per month, its total above it, the split on hover. */
export function MonthlyColumns({ buckets }: { buckets: MonthBucket[] }) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.total));
  const total = buckets.reduce((sum, bucket) => sum + bucket.total, 0);

  return (
    <div>
      <ol className="flex items-end gap-2 border-b border-border sm:gap-4" style={{ height: PLOT_HEIGHT + 28 }}>
        {buckets.map((bucket, index) => {
          // Tooltips open toward the middle, so the outer ones stay on screen.
          const anchor = index < buckets.length / 2 ? "left-0" : "right-0";
          const height = bucket.total === 0 ? 0 : Math.max(4, Math.round((bucket.total / max) * PLOT_HEIGHT));
          return (
            <li
              key={bucket.key}
              tabIndex={0}
              aria-label={`${bucket.fullLabel}: ${bucket.total} case${bucket.total === 1 ? "" : "s"} (${bucket.minor} minor, ${bucket.major} major, ${bucket.confidential} confidential)`}
              className="group relative flex h-full flex-1 flex-col items-center justify-end rounded-t-md outline-none focus-visible:ring-3 focus-visible:ring-tup-maroon-600/30"
            >
              <span className="mb-1 text-sm font-semibold tabular-nums">{bucket.total}</span>
              <span
                aria-hidden="true"
                className="w-full max-w-12 rounded-t-[4px] bg-[var(--chart-bar)] transition-opacity group-hover:opacity-80"
                style={{ height }}
              />
              {/* Tooltip */}
              <span
                role="presentation"
                className={cn(
                  "pointer-events-none invisible absolute bottom-full z-10 mb-1 w-max max-w-64 rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100",
                  anchor,
                )}
              >
                <span className="block font-semibold">{bucket.fullLabel}</span>
                <span className="block tabular-nums">{bucket.total} filed</span>
                <span className="block tabular-nums text-muted-foreground">
                  {bucket.minor} minor · {bucket.major} major · {bucket.confidential} confidential
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <ol aria-hidden="true" className="mt-1.5 flex gap-2 sm:gap-4">
        {buckets.map((bucket) => (
          <li key={bucket.key} className="flex-1 text-center text-sm text-muted-foreground">
            {bucket.label}
          </li>
        ))}
      </ol>

      <details className="mt-3 text-base">
        <summary className="cursor-pointer font-medium text-tup-maroon-700">Show the numbers</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left tabular-nums">
            <thead className="text-sm text-muted-foreground">
              <tr>
                <th className="py-1 pr-3 font-medium">Month</th>
                <th className="py-1 pr-3 text-right font-medium">Minor</th>
                <th className="py-1 pr-3 text-right font-medium">Major</th>
                <th className="py-1 pr-3 text-right font-medium">Confidential</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {buckets.map((bucket) => (
                <tr key={bucket.key}>
                  <td className="py-1 pr-3">{bucket.fullLabel}</td>
                  <td className="py-1 pr-3 text-right">{bucket.minor}</td>
                  <td className="py-1 pr-3 text-right">{bucket.major}</td>
                  <td className="py-1 pr-3 text-right">{bucket.confidential}</td>
                  <td className="py-1 text-right font-semibold">{bucket.total}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1 pr-3">Six months</td>
                <td className="py-1 pr-3 text-right">{buckets.reduce((s, b) => s + b.minor, 0)}</td>
                <td className="py-1 pr-3 text-right">{buckets.reduce((s, b) => s + b.major, 0)}</td>
                <td className="py-1 pr-3 text-right">{buckets.reduce((s, b) => s + b.confidential, 0)}</td>
                <td className="py-1 text-right">{total}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/**
 * One labelled bar per row, scaled to the largest so differences show, with
 * the count and its share of the whole written at the end of each bar.
 * `barClass` colours a row; the default is the single-series maroon.
 */
export function BarRows({
  data,
  total,
  barClass,
  empty,
}: {
  data: BarDatum[];
  /** The whole the shares are of; defaults to the sum of the rows. */
  total?: number;
  barClass?: (datum: BarDatum, index: number) => string;
  empty: string;
}) {
  if (data.length === 0) {
    return <p className="py-6 text-center text-base text-muted-foreground">{empty}</p>;
  }
  const max = Math.max(1, ...data.map((datum) => datum.value));
  const whole = total ?? data.reduce((sum, datum) => sum + datum.value, 0);

  return (
    <ul className="space-y-1">
      {data.map((datum, index) => (
        <li
          key={datum.label}
          className="grid grid-cols-[minmax(6.5rem,11rem)_1fr] items-center gap-3 rounded-md px-1 py-1 hover:bg-muted/50"
        >
          <span className="truncate text-base" title={datum.label}>
            {datum.label}
          </span>
          <span className="flex min-w-0 items-center gap-2">
            {datum.value > 0 && (
              <span
                aria-hidden="true"
                className={cn("h-3 rounded-r-[4px]", barClass ? barClass(datum, index) : "bg-[var(--chart-bar)]")}
                style={{ width: `${Math.max(2, (datum.value / max) * 85)}%` }}
              />
            )}
            <span className="shrink-0 whitespace-nowrap text-base tabular-nums">
              <span className="font-semibold">{datum.value}</span>
              <span className="ml-1 text-sm text-muted-foreground">{percentOf(datum.value, whole)}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
