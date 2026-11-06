"use client";

import { AppShell } from "@/components/layout/app-shell";

interface StudentShellProps {
  children: React.ReactNode;
  userName: string;
  userAvatar?: string;
  userSubtitle?: string;
  /** The current term, shown in the header (lib/settings/active-term). */
  termLabel?: string;
  photoIsProvisional?: boolean;
  notificationCount: number;
  sidebarBadges?: Record<string, number>;
  idleMinutes: number;
}

export function StudentShell({
  children,
  userName,
  userAvatar,
  userSubtitle,
  termLabel,
  photoIsProvisional,
  notificationCount,
  sidebarBadges,
  idleMinutes,
}: StudentShellProps) {
  return (
    <AppShell
      role="student"
      idleMinutes={idleMinutes}
      userName={userName}
      userAvatar={userAvatar}
      userSubtitle={userSubtitle}
      termLabel={termLabel}
      photoIsProvisional={photoIsProvisional}
      notificationCount={notificationCount}
      sidebarBadges={sidebarBadges}
    >
      {children}
    </AppShell>
  );
}
