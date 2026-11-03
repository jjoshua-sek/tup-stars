import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeLocalPath } from "@/lib/utils/safe-path";

/**
 * Auth callback handler for Supabase.
 * Handles the redirect after email verification, password reset,
 * or OAuth sign-in (if added later).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // A path on this site only: glued onto the origin as given, "next=.evil.com"
  // made the address tup-usms.vercel.app.evil.com, another site.
  const next = safeLocalPath(searchParams.get("next")) ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check user role to redirect appropriately.
      // app_metadata is server-controlled — user_metadata is user-modifiable, never trust it for auth.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const role = user?.app_metadata?.role || "student";
      const redirectTo =
        role === "staff" || role === "admin"
          ? "/staff/dashboard"
          : next;

      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // Auth error — redirect to login with error message
  return NextResponse.redirect(
    `${origin}/login?error=auth_callback_failed`
  );
}
