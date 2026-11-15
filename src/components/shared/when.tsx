import { cn } from "@/lib/utils";
import { formatManilaDateTime, timeAgo } from "@/lib/utils/time";

/**
 * When something happened: the exact date and time, Manila, with how long
 * ago underneath. Lists used to show only "2 days ago", which is no use on a
 * printout or in a dispute over when a report came in.
 */
export function When({ at, className }: { at: string; className?: string }) {
  const ago = timeAgo(at);
  return (
    <time dateTime={at} className={cn("whitespace-nowrap text-right text-sm text-muted-foreground", className)}>
      <span className="block">{formatManilaDateTime(at)}</span>
      {/* Past a few weeks timeAgo gives the date itself, already shown above. */}
      {/ago$|^just now$/.test(ago) && <span className="block text-xs">{ago}</span>}
    </time>
  );
}
