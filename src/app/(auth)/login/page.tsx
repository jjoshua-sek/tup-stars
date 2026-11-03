import type { Metadata } from "next";
import { Suspense } from "react";

import { AlreadySignedIn } from "@/components/auth/already-signed-in";
import { LoginForm } from "@/components/auth/login-form";
import { TwoStepCode } from "@/components/auth/two-step-code";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { needsSecondStep } from "@/lib/auth/two-step";
import { isOfflineMode } from "@/lib/offline/mode";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Sign In",
};

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const role = user.app_metadata?.role;
    const isStaff = role === "staff" || role === "admin";
    // Accounts sign in as <STUDENT-NUMBER>@tup.edu.ph; show the number.
    const loginId = user.email?.split("@")[0]?.toUpperCase() ?? "this account";
    const destination = isStaff ? "/staff/dashboard" : "/dashboard";

    // Password given but not yet the code (two-step sign-in is on): the
    // proxy sends every page here until it is.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (needsSecondStep({ accessToken: session?.access_token, factors: user.factors })) {
      return (
        <Suspense fallback={null}>
          <TwoStepCode loginId={loginId} destination={destination} />
        </Suspense>
      );
    }

    return (
      <AlreadySignedIn loginId={loginId} destination={destination} />
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      }
    >
      <LoginForm offline={isOfflineMode()} />
    </Suspense>
  );
}
