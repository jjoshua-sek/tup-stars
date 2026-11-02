"use client";

import Link from "next/link";
import { BellIcon as Bell, QuestionIcon as HelpCircle, ListIcon as Menu } from "@phosphor-icons/react/ssr";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { APP_NAME } from "@/lib/brand";
import { announceSignOut } from "@/components/auth/session-guard";
import { useRouter } from "next/navigation";
import { TextSizeSwitch } from "@/components/layout/text-size-switch";
import { TupSeal } from "@/components/layout/tup-seal";

interface TupHeaderProps {
  onMenuClick: () => void;
  /** Display name for the user block on the right */
  userName?: string;
  /** Short role descriptor below the name (e.g. "BSIT · 4th Year" or "OSA Officer") */
  userSubtitle?: string;
  /** Mark provisional photo via amber dot in the corner of the avatar */
  photoIsProvisional?: boolean;
  /** Whether this is the admin/staff console (changes branding line) */
  isStaffConsole?: boolean;
  notificationCount?: number;
  role: "student" | "staff" | "admin";
}

/**
 * Full-width TUP header, after the university's own site (tup.edu.ph).
 *
 * - Left: the campus under a crimson veil, cut on a slant (.tup-header-photo
 *   in globals.css), with the seal and the university's name. On desktop
 *   the seal is large and hangs below the bar, over the top of the sidebar.
 * - Right, on TUP's slate: "Hello" and the person's first name with their
 *   role or course below (wide screens), the text size switch, Help, the
 *   notification bell and the account menu. Below 1280px the greeting moves
 *   into the account menu.
 * - A 3px gold rule along the bottom.
 *
 * It sits above the sidebar and page, sticky to the top. Its height is
 * --header-h, which the sidebar uses for its own offset.
 */
export function TupHeader({
  onMenuClick,
  userName = "User",
  userSubtitle,
  photoIsProvisional,
  isStaffConsole,
  notificationCount = 0,
  role,
}: TupHeaderProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    announceSignOut();
    router.push("/login");
  };

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const firstName = userName.split(" ")[0];
  const area = isStaffConsole ? "OSA Console" : "Student Portal";

  return (
    <header className="sticky top-0 z-40 flex h-[var(--header-h)] items-stretch border-b-[3px] border-tup-gold-500 bg-[#46434e] text-white">
      {/* LEFT: the campus photo, the seal and the university's name */}
      <div className="relative flex min-w-0 items-center gap-2 pl-2 pr-12 sm:gap-3 sm:pl-4 lg:pl-6 lg:pr-16 2xl:min-w-[50%]">
        <div className="tup-header-photo absolute inset-0" aria-hidden="true" />

        <button
          type="button"
          onClick={onMenuClick}
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-md text-white hover:bg-white/15 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>

        <Link
          href={role === "student" ? "/dashboard" : "/staff/dashboard"}
          className="relative flex min-w-0 items-center gap-3 self-stretch lg:gap-4"
        >
          {/* Desktop: 7rem, starting 0.5rem from the top, so it hangs 2rem below the bar. */}
          <TupSeal className="size-11 lg:size-28 lg:self-start lg:mt-2 lg:shadow-lg" />

          <div className="tup-header-name min-w-0 leading-tight">
            {/* Wraps to a second line rather than being cut off when space is short (A++). */}
            <div className="line-clamp-2 text-base font-bold uppercase tracking-wide text-balance sm:text-lg">
              <span className="tup-name-short lg:hidden">TUP Manila</span>
              <span className="tup-name-full hidden lg:inline">Technological University of the Philippines</span>
            </div>
            <div className="mt-0.5 truncate text-sm font-semibold uppercase italic tracking-wide">
              <span className="hidden lg:inline">Manila · </span>
              {/* A phone has room for the area only. */}
              <span className="hidden sm:inline">{APP_NAME} · </span>
              {area}
            </div>
          </div>
        </Link>
      </div>

      {/* RIGHT, on the slate: greeting, text size, Help, notifications, account */}
      <div className="ml-auto flex shrink-0 items-center gap-3 pr-3 sm:gap-5 sm:pr-6">
        <div className="hidden max-w-[15rem] leading-tight xl:block">
          <div className="truncate text-lg font-bold uppercase tracking-wide">Hello, {firstName}</div>
          {userSubtitle && (
            <div className="mt-0.5 truncate text-sm font-semibold uppercase italic tracking-wide text-white/80">
              {userSubtitle}
            </div>
          )}
        </div>
        <TextSizeSwitch className="hidden sm:flex" />

        <Link
          href="/help"
          className="hidden sm:inline text-sm text-white/85 hover:text-white transition-colors"
        >
          <HelpCircle className="h-4 w-4 inline mr-1 -mt-0.5" />
          Help
        </Link>

        <Link
          href={role === "student" ? "/notifications" : "/staff/notifications"}
          className="relative text-white/85 hover:text-white transition-colors"
          aria-label={`Notifications (${notificationCount})`}
        >
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span
              className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-tup-gold-500 text-tup-maroon-700 text-sm font-bold flex items-center justify-center font-mono"
              aria-hidden="true"
            >
              {notificationCount > 99 ? "99+" : notificationCount}
            </span>
          )}
        </Link>

        {/* User block with separator on its left */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center rounded-full sm:border-l sm:border-white/20 sm:pl-5"
            aria-label={`Account menu for ${userName}`}
          >
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/15 text-sm font-semibold text-white">
                {initials}
              </div>
              {photoIsProvisional && (
                <span
                  aria-label="Provisional photo"
                  className="absolute -bottom-0.5 -right-0.5 block h-3 w-3 rounded-full border border-[#46434e] bg-tup-gold-500"
                />
              )}
            </div>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60">
            {/* Who is signed in: the greeting's place below 1280px, and a check for everyone. */}
            <div className="px-2 py-2 leading-tight">
              <div className="truncate text-base font-semibold">{userName}</div>
              {userSubtitle && <div className="truncate text-sm text-muted-foreground">{userSubtitle}</div>}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <Link
                href={role === "student" ? "/profile" : "/staff/settings"}
                className="w-full"
              >
                {role === "student" ? "My Profile" : "Account"}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Link
                href={role === "student" ? "/settings" : "/staff/settings"}
                className="w-full"
              >
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} variant="destructive">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
