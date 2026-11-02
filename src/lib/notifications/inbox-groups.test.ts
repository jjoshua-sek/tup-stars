import { describe, expect, it } from "vitest";

import { groupNotifications, type InboxItem } from "./inbox-groups";

const item = (id: string, created_at: string, is_read: boolean): InboxItem => ({
  id,
  title: id,
  body: "",
  priority: "normal",
  is_read,
  action_url: null,
  action_label: null,
  created_at,
});

// 3:00 PM on November 2, 2026, Manila (UTC+8).
const now = new Date("2026-11-02T07:00:00Z");

describe("groupNotifications", () => {
  it("puts unread notices under New, then read ones under Today and Earlier, newest first", () => {
    const groups = groupNotifications(
      [
        item("old-read", "2026-10-30T02:00:00Z", true),
        item("today-read", "2026-11-02T01:00:00Z", true),
        item("old-unread", "2026-10-28T02:00:00Z", false),
        item("new-unread", "2026-11-02T06:00:00Z", false),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ["New", ["new-unread", "old-unread"]],
      ["Today", ["today-read"]],
      ["Earlier", ["old-read"]],
    ]);
  });

  it("starts Today at midnight Manila time, not UTC", () => {
    // 12:30 AM on November 2 in Manila is still November 1 in UTC.
    const groups = groupNotifications([item("after-midnight", "2026-11-01T16:30:00Z", true)], now);
    expect(groups).toEqual([{ label: "Today", items: [expect.objectContaining({ id: "after-midnight" })] }]);
  });

  it("leaves out empty groups", () => {
    expect(groupNotifications([], now)).toEqual([]);
    expect(groupNotifications([item("a", "2026-11-02T06:00:00Z", false)], now).map((g) => g.label)).toEqual(["New"]);
  });
});
