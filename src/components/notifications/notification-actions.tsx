"use client";

import { useTransition } from "react";
import { CheckIcon as Check, ChecksIcon as CheckCheck, CircleNotchIcon as Loader2 } from "@phosphor-icons/react/ssr";
import { toast } from "sonner";

import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/read-actions";

export function MarkReadButton({ notificationId }: { notificationId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}

      onClick={() =>
        startTransition(async () => {
          const result = await markNotificationRead(notificationId);
          if (result.error) toast.error(result.error);
        })
      }
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-base font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Check className="h-4 w-4" />
      )}
      Mark as read
    </button>
  );
}

export function MarkAllReadButton({ disabled }: { disabled?: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsRead();
          if (result.error) toast.error(result.error);
          else toast.success("All caught up.");
        })
      }
      className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-3 text-base font-medium transition-colors hover:bg-muted disabled:opacity-50"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <CheckCheck className="h-4 w-4" />
      )}
      Mark all read
    </button>
  );
}
