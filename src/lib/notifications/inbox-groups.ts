import { startOfManilaDay } from "@/lib/utils/time";

/** The fields the header's notification panel shows. */
export interface InboxItem {
  id: string;
  title: string;
  body: string;
  priority: "low" | "normal" | "high" | "urgent";
  is_read: boolean;
  action_url: string | null;
  action_label: string | null;
  created_at: string;
}

export interface InboxGroup {
  label: "New" | "Today" | "Earlier";
  items: InboxItem[];
}

/**
 * Sorts notices the way the header panel lists them: unread ones under New,
 * then those already read today (Manila time) under Today, then Earlier.
 * Each group keeps the newest first; empty groups are left out.
 */
export function groupNotifications(items: InboxItem[], now: Date = new Date()): InboxGroup[] {
  const todayStart = startOfManilaDay(now).getTime();
  const newest = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at));

  const groups: InboxGroup[] = [
    { label: "New", items: newest.filter((item) => !item.is_read) },
    { label: "Today", items: newest.filter((item) => item.is_read && new Date(item.created_at).getTime() >= todayStart) },
    { label: "Earlier", items: newest.filter((item) => item.is_read && new Date(item.created_at).getTime() < todayStart) },
  ];
  return groups.filter((group) => group.items.length > 0);
}
