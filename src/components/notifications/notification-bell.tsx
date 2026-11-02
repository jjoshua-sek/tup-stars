"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  BellIcon,
  ChecksIcon,
  CircleNotchIcon,
  WarningCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { groupNotifications, type InboxItem } from "@/lib/notifications/inbox-groups";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/read-actions";
import { createClient } from "@/lib/supabase/client";
import { loose } from "@/lib/supabase/loose";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils/time";

const SHOWN = 15;

type Filter = "all" | "unread";
type Load = { state: "loading" } | { state: "error" } | { state: "ready"; items: InboxItem[] };

/**
 * The header bell: a panel of the latest notices, like Facebook's. It reads
 * with the browser's own session, filtered to the signed-in person (staff may
 * read students' notices elsewhere, so RLS alone would let others' rows in),
 * which also works on the offline copy. Pressing a notice marks it read and
 * opens it; See all opens the full inbox, which keeps the email delivery notes.
 */
export function NotificationBell({
  inboxHref,
  unreadCount,
}: {
  inboxHref: "/notifications" | "/staff/notifications";
  unreadCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [markingAll, setMarkingAll] = useState(false);

  async function fetchItems(next: Filter) {
    setLoad({ state: "loading" });
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return setLoad({ state: "error" });

    let query = loose(supabase)
      .from("notifications")
      .select("id, title, body, priority, is_read, action_url, action_label, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(SHOWN);
    if (next === "unread") query = query.eq("is_read", false);

    const { data, error } = await query;
    setLoad(error ? { state: "error" } : { state: "ready", items: (data as InboxItem[] | null) ?? [] });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) void fetchItems(filter);
  }

  function choose(next: Filter) {
    setFilter(next);
    void fetchItems(next);
  }

  function openItem(item: InboxItem) {
    setOpen(false);
    router.push(item.action_url ?? inboxHref);
    if (!item.is_read) {
      void markNotificationRead(item.id).then((result) => {
        if (result.error) toast.error(result.error);
        else router.refresh(); // the count on the bell comes from the layout
      });
    }
  }

  async function markAll() {
    setMarkingAll(true);
    const result = await markAllNotificationsRead();
    setMarkingAll(false);
    if (result.error) return toast.error(result.error);
    router.refresh();
    void fetchItems(filter);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        className="relative grid h-10 w-10 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/15 hover:text-white data-[popup-open]:bg-white/20 data-[popup-open]:text-white"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
      >
        <BellIcon className="h-6 w-6" />
        {unreadCount > 0 && (
          <span
            className="absolute top-0.5 right-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-tup-gold-500 px-1 font-mono text-sm font-bold text-tup-maroon-700"
            aria-hidden="true"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(26rem,calc(100vw-1rem))] gap-0 p-0"
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
          <h2 className="text-xl font-bold tracking-tight">Notifications</h2>
          <Link
            href={inboxHref}
            onClick={() => setOpen(false)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-base font-medium text-tup-maroon-600 hover:bg-muted"
          >
            See all
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>

        <div role="group" aria-label="Show" className="flex gap-2 px-4 pb-3">
          {(["all", "unread"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => choose(value)}
              className={cn(
                "min-h-10 rounded-full px-4 text-base font-semibold transition-colors",
                filter === value ? "bg-tup-maroon-600 text-white" : "text-foreground hover:bg-muted",
              )}
            >
              {value === "all" ? "All" : `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
            </button>
          ))}
        </div>

        <div className="max-h-[min(32rem,65vh)] overflow-y-auto border-t border-border">
          {load.state === "loading" ? (
            <p className="flex items-center gap-2 px-4 py-6 text-base text-muted-foreground">
              <CircleNotchIcon className="h-5 w-5 animate-spin" />
              Loading your notifications…
            </p>
          ) : load.state === "error" ? (
            <p className="px-4 py-6 text-base text-muted-foreground">
              Your notifications could not be loaded. Press See all to open the full list.
            </p>
          ) : load.items.length === 0 ? (
            <p className="px-4 py-6 text-base text-muted-foreground">
              {filter === "unread" ? "Nothing unread. You're all caught up." : "No notifications yet."}
            </p>
          ) : (
            groupNotifications(load.items).map((group) => (
              <section key={group.label} aria-label={group.label} className="py-1">
                <h3 className="px-4 pt-2 pb-1 text-base font-bold">{group.label}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <NoticeRow item={item} onOpen={() => openItem(item)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={markAll}
            disabled={markingAll || unreadCount === 0}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-base font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {markingAll ? <CircleNotchIcon className="h-4 w-4 animate-spin" /> : <ChecksIcon className="h-4 w-4" />}
            Mark all as read
          </button>
          <Link
            href={inboxHref}
            onClick={() => setOpen(false)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-base font-medium text-tup-maroon-600 hover:bg-muted"
          >
            See all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const PRIORITY_ICON = {
  urgent: { icon: WarningIcon, className: "bg-red-100 text-red-700", label: "Urgent" },
  high: { icon: WarningCircleIcon, className: "bg-amber-100 text-amber-800", label: "Important" },
  normal: { icon: BellIcon, className: "bg-tup-maroon-100 text-tup-maroon-700", label: null },
  low: { icon: BellIcon, className: "bg-muted text-muted-foreground", label: null },
} as const;

function NoticeRow({ item, onOpen }: { item: InboxItem; onOpen: () => void }) {
  const meta = PRIORITY_ICON[item.priority];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted",
        !item.is_read && "bg-tup-maroon-600/[0.04]",
      )}
    >
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", meta.className)}>
        <meta.icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base leading-snug">
          {meta.label && <span className="font-bold">{meta.label}: </span>}
          <span className={cn(!item.is_read && "font-semibold")}>{item.title}</span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{item.body}</span>
        <span className={cn("mt-0.5 block text-sm", item.is_read ? "text-muted-foreground" : "font-semibold text-tup-maroon-600")}>
          {timeAgo(item.created_at)}
        </span>
      </span>
      {!item.is_read && (
        <span className="mt-4 h-3 w-3 shrink-0 rounded-full bg-tup-maroon-600" aria-label="Unread" role="img" />
      )}
    </button>
  );
}
