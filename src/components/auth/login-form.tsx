"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  loginSchema,
  staffLoginSchema,
  type LoginInput,
  type StaffLoginInput,
} from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { loginEmailFor } from "@/lib/accounts/enrollment";
import { recordSignIn } from "@/lib/accounts/account-actions";
import { OFFLINE_SIGN_IN_FAILED } from "@/lib/offline/mode";
import { safeLocalPath } from "@/lib/utils/safe-path";
import { cn } from "@/lib/utils";
import { announceSignIn, markTabOpen } from "@/components/auth/session-guard";
import { TwoStepCode } from "@/components/auth/two-step-code";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EyeIcon as Eye,
  EyeSlashIcon as EyeOff,
  CircleNotchIcon as Loader2,
  StudentIcon as Student,
  IdentificationBadgeIcon as Badge,
} from "@phosphor-icons/react/ssr";
import Link from "next/link";

type Audience = "student" | "staff";

/** The tab this browser used last; an office computer opens on Staff. */
const TAB_KEY = "stars-login-tab";

/** What the password step hands on: who signed in, and how they said they would. */
interface Attempt {
  audience: Audience;
  loginId: string;
  birthDate?: string;
}

/**
 * The sign-in page, in two tabs (adviser feedback, November 2026):
 *
 * - "Student": student number (TUPM-YY-NNNN), password and birth date, the
 *   way the TUP ERS signs students in. The birth date is checked against
 *   the student's record.
 * - "Staff": staff ID (STAFF-YY-NNNN) and password. Staff IDs no longer
 *   look like student numbers (migration 00059).
 *
 * Each tab only admits its own kind of account, so a staff member cannot
 * sign in as a student or the reverse. Both share the rest: the 5-attempt
 * cooldown, two-step sign-in, and the role-aware landing page.
 */
export function LoginForm({ offline = false }: { offline?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  // Why the user is looking at this page, when something sent them here:
  //   link-expired    /auth/confirm — a one-time link was used or expired
  //   session-expired the proxy or SessionGuard — idle past the limit
  //   site-closed     SessionGuard — every tab was closed, then reopened
  const notice = searchParams.get("notice");
  const linkExpired = notice === "link-expired";
  const signedOut =
    notice === "session-expired"
      ? "You were signed out because there was no activity for a while. Sign in again to continue."
      : notice === "site-closed"
        ? "You were signed out because the site was closed. Sign in again to continue."
        : null;

  const [audience, setAudience] = useState<Audience>(searchParams.get("as") === "staff" ? "staff" : "student");
  const [isLoading, setIsLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  // A timer ends the cooldown. Comparing a stored time with Date.now() while
  // rendering left the button disabled after the 30 seconds were up, since
  // nothing renders the form again on its own.
  const [isInCooldown, setIsInCooldown] = useState(false);
  // Set after a correct password on an account with two-step sign-in on:
  // the form gives way to the code step, then finishes the sign-in.
  const [secondStep, setSecondStep] = useState<{ role: string; userId: string; attempt: Attempt } | null>(null);

  // The remembered tab is read after the first render, so the server's
  // HTML and the browser's first render agree.
  useEffect(() => {
    if (searchParams.get("as")) return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a stored preference, read once on mount
      if (window.localStorage.getItem(TAB_KEY) === "staff") setAudience("staff");
    } catch {
      // Storage blocked: start on Student.
    }
  }, [searchParams]);

  const chooseAudience = (next: Audience) => {
    setAudience(next);
    try {
      window.localStorage.setItem(TAB_KEY, next);
    } catch {
      // Not remembered; nothing else depends on it.
    }
  };

  const invalidMessage = audience === "staff" ? "Invalid staff ID or password." : "Invalid student number or password.";

  const handleFailedAttempt = (message: string) => {
    const newAttempts = failedAttempts + 1;
    setFailedAttempts(newAttempts);

    if (newAttempts >= 5) {
      // 30-second cooldown after 5 failed attempts
      setIsInCooldown(true);
      window.setTimeout(() => setIsInCooldown(false), 30_000);
      setFailedAttempts(0);
      toast.error("Too many failed attempts. Please wait 30 seconds before trying again.");
    } else {
      toast.error(message);
    }
  };

  /** The password step, for either tab. */
  const signIn = async (attempt: Attempt, password: string) => {
    if (isInCooldown) {
      toast.error("Too many attempts. Please wait before trying again.");
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();
      let { data: authData, error } = await supabase.auth.signInWithPassword({
        email: loginEmailFor(attempt.loginId),
        password,
      });

      // Until migration 00059 has run, a staff account still signs in at
      // its old student-style address (STAFF-26-0001 was TUPM-26-0001).
      if ((error || !authData.user) && attempt.audience === "staff") {
        ({ data: authData, error } = await supabase.auth.signInWithPassword({
          email: loginEmailFor(attempt.loginId.replace(/^STAFF-/, "TUPM-")),
          password,
        }));
      }

      if (error || !authData.user) {
        // On the offline copy a student's correct password fails too (only
        // staff passwords are copied), so say why. One message for both
        // cases: telling them apart would show which numbers are students.
        handleFailedAttempt(offline && attempt.audience === "student" ? OFFLINE_SIGN_IN_FAILED : invalidMessage);
        return;
      }

      // Determine the user's role from app_metadata (server-controlled, secure).
      // Never read role from user_metadata — users can self-modify that.
      const role = authData.user.app_metadata?.role || "student";
      const isStaffAccount = role === "staff" || role === "admin";

      // Each tab admits its own kind of account only.
      if (isStaffAccount !== (attempt.audience === "staff")) {
        await supabase.auth.signOut({ scope: "local" });
        handleFailedAttempt(
          isStaffAccount
            ? "This is a staff account. Sign in on the Staff tab with your staff ID."
            : "This is a student account. Sign in on the Student tab with your student number.",
        );
        return;
      }

      // Two-step sign-in comes before anything is read: until the code is
      // given, the database refuses this session's reads (migration 00056),
      // so the birth-date check below would find no record.
      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (level?.currentLevel === "aal1" && level.nextLevel === "aal2") {
        setSecondStep({ role, userId: authData.user.id, attempt });
        return;
      }

      await finishSignIn(role, authData.user.id, attempt);
    } catch (err) {
      console.error("Login error:", err);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  /** Everything after the password (and the code, when two-step is on). */
  const finishSignIn = async (role: string, userId: string, attempt: Attempt) => {
    const supabase = createClient();
    try {
      // For students: do birthday verification AND check profile completion in
      // one query, so we can route them directly to /profile or /dashboard
      // and avoid the redirect chain that causes the "white screen" issue.
      let studentNeedsOnboarding = false;
      if (role === "student") {
        const { data: studentRecord } = await supabase
          .from("students")
          .select("birth_date, profile_completed_at")
          .eq("user_id", userId)
          .maybeSingle();

        const studentData = studentRecord as
          | { birth_date: string | null; profile_completed_at: string | null }
          | null;

        // Birthday verification (only when a profile already has a birth_date set).
        // The form gives YYYY-MM-DD; the stored value may carry a time, so
        // only the calendar date is compared.
        if (studentData?.birth_date && attempt.birthDate !== studentData.birth_date.split("T")[0]) {
          // "local": end only the session this attempt just created. The
          // default ("global") ended every session the account had on
          // every device, so anyone who knew a student's password but not
          // their birth date could sign them out everywhere at will.
          await supabase.auth.signOut({ scope: "local" });
          setSecondStep(null);
          handleFailedAttempt("Birth date does not match our records.");
          return;
        }

        // No profile or incomplete? Send straight to /profile (avoids
        // the /dashboard → /profile redirect chain).
        studentNeedsOnboarding = !studentData || !studentData.profile_completed_at;
      }

      // Successful login — pick destination and navigate ONCE.
      setFailedAttempts(0);
      // For the account's own sign-in history (Settings). Recording it must
      // never be the reason a sign-in fails.
      try {
        await recordSignIn();
      } catch (recordError) {
        console.error("Could not record the sign-in:", recordError);
      }
      toast.success("Signed in successfully!");
      // This tab is now open on a signed-in session, so the page it lands on
      // must not mistake itself for the site being reopened after closing.
      markTabOpen();
      announceSignIn();

      // Only ever a path on this site. Following ?redirect= as given made
      // /login?redirect=https://… an open redirect, sending someone to
      // another site straight after they typed their password here
      // (safeLocalPath also refuses "/\evil.com", which browsers read as "//").
      const safeRedirect = safeLocalPath(redirectTo);

      let destination: string;
      if (safeRedirect) {
        destination = safeRedirect;
      } else if (role === "staff" || role === "admin") {
        destination = "/staff/dashboard";
      } else if (studentNeedsOnboarding) {
        destination = "/profile";
      } else {
        destination = "/dashboard";
      }

      // router.replace() (not push) so the back button doesn't return to /login.
      // No router.refresh() — the route change triggers a fresh server render
      // by itself, and refresh() can race with replace() causing white-screen issues.
      router.replace(destination);
    } catch (err) {
      console.error("Login error:", err);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (secondStep) {
    return (
      <TwoStepCode
        loginId={secondStep.attempt.loginId}
        onVerified={() => finishSignIn(secondStep.role, secondStep.userId, secondStep.attempt)}
      />
    );
  }

  const disabled = isLoading || isInCooldown;

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Form header */}
      <div className="mb-6">
        <h3 className="text-2xl font-semibold tracking-tight mb-1.5">Welcome back</h3>
        <p className="text-base text-muted-foreground">Sign in with your TUP institutional account to continue.</p>
      </div>

      {signedOut && (
        <div role="status" className="mb-5 rounded-lg border border-border bg-muted/50 px-3.5 py-3 text-base leading-relaxed">
          <p className="font-semibold">Signed out for your security</p>
          <p className="mt-0.5 text-muted-foreground">{signedOut}</p>
        </div>
      )}

      {linkExpired && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-base leading-relaxed text-amber-950"
        >
          <p className="font-semibold">That sign-in link no longer works.</p>
          <p className="mt-0.5">
            Links work once and expire after a short time. To get a new one, use{" "}
            <Link href="/reset-password" className="font-semibold underline underline-offset-2">
              Forgot password?
            </Link>{" "}
            or ask the Office of Student Affairs.
          </p>
        </div>
      )}

      {/* Who is signing in */}
      <div role="tablist" aria-label="Who is signing in" className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {(
          [
            { value: "student", label: "Student", Icon: Student },
            { value: "staff", label: "Staff", Icon: Badge },
          ] as const
        ).map(({ value, label, Icon }) => {
          const selected = audience === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              id={`login-tab-${value}`}
              aria-selected={selected}
              aria-controls={`login-panel-${value}`}
              onClick={() => chooseAudience(value)}
              disabled={isLoading}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-md text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-tup-maroon-600/30",
                selected
                  ? "bg-tup-maroon-600 text-white shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`login-panel-${audience}`} aria-labelledby={`login-tab-${audience}`}>
        {audience === "student" ? (
          <StudentFields
            disabled={disabled}
            isLoading={isLoading}
            isInCooldown={isInCooldown}
            onSubmit={(form) => signIn({ audience: "student", loginId: form.student_number, birthDate: form.birth_date }, form.password)}
          />
        ) : (
          <StaffFields
            disabled={disabled}
            isLoading={isLoading}
            isInCooldown={isInCooldown}
            onSubmit={(form) => signIn({ audience: "staff", loginId: form.staff_id }, form.password)}
          />
        )}
      </div>

      {/* DPA notice card — institutional touch matching the mockup */}
      <div className="mt-6 px-3.5 py-3 bg-muted rounded-md border-l-[3px] border-l-tup-gold-500 text-sm text-muted-foreground leading-relaxed">
        <strong className="text-foreground font-semibold">Data Privacy Notice</strong>
        <p className="mt-0.5">
          By signing in, you acknowledge that your data will be processed in accordance with the Data Privacy Act of
          2012. Concerns submitted may be processed by a third-party AI service to assist administrative review.
        </p>
      </div>
    </div>
  );
}

interface FieldsProps<T> {
  disabled: boolean;
  isLoading: boolean;
  isInCooldown: boolean;
  onSubmit: (form: T) => Promise<void>;
}

function StudentFields({ disabled, isLoading, isInCooldown, onSubmit }: FieldsProps<LoginInput>) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { student_number: "", password: "", birth_date: "" },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" data-offline-allowed>
      <div className="space-y-1.5">
        <Label htmlFor="student_number" className="text-sm font-medium">
          Student number
        </Label>
        <Input
          id="student_number"
          placeholder="TUPM-22-0000"
          autoComplete="username"
          disabled={disabled}
          {...register("student_number")}
          className={errors.student_number ? "border-destructive" : ""}
        />
        {errors.student_number && <p className="text-sm text-destructive">{errors.student_number.message}</p>}
      </div>

      <PasswordField
        register={register("password")}
        error={errors.password?.message}
        disabled={disabled}
        aside={
          <Link href="/reset-password" className="text-sm font-medium text-tup-maroon-600 hover:underline">
            Forgot password?
          </Link>
        }
      />

      <div className="space-y-1.5">
        <Label htmlFor="birth_date" className="text-sm font-medium">
          Birth date
        </Label>
        <Input
          id="birth_date"
          type="date"
          autoComplete="bday"
          disabled={disabled}
          {...register("birth_date")}
          className={errors.birth_date ? "border-destructive" : ""}
        />
        {errors.birth_date && <p className="text-sm text-destructive">{errors.birth_date.message}</p>}
      </div>

      <SubmitButton isLoading={isLoading} isInCooldown={isInCooldown} disabled={disabled} />
    </form>
  );
}

function StaffFields({ disabled, isLoading, isInCooldown, onSubmit }: FieldsProps<StaffLoginInput>) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StaffLoginInput>({
    resolver: zodResolver(staffLoginSchema),
    defaultValues: { staff_id: "", password: "" },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" data-offline-allowed>
      <div className="space-y-1.5">
        <Label htmlFor="staff_id" className="text-sm font-medium">
          Staff ID
        </Label>
        <Input
          id="staff_id"
          placeholder="STAFF-26-0000"
          autoComplete="username"
          disabled={disabled}
          {...register("staff_id")}
          className={errors.staff_id ? "border-destructive" : ""}
        />
        {errors.staff_id && <p className="text-sm text-destructive">{errors.staff_id.message}</p>}
      </div>

      <PasswordField register={register("password")} error={errors.password?.message} disabled={disabled} />

      <p className="text-sm text-muted-foreground">
        Forgot your password or staff ID? The STARS administrator can send you a reset link.
      </p>

      <SubmitButton isLoading={isLoading} isInCooldown={isInCooldown} disabled={disabled} />
    </form>
  );
}

function PasswordField({
  register,
  error,
  disabled,
  aside,
}: {
  register: UseFormRegisterReturn<"password">;
  error?: string;
  disabled: boolean;
  aside?: React.ReactNode;
}) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor="password" className="text-sm font-medium">
          Password
        </Label>
        {aside}
      </div>
      <div className="relative">
        <Input
          id="password"
          type={showPassword ? "text" : "password"}
          placeholder="Enter your password"
          autoComplete="current-password"
          disabled={disabled}
          {...register}
          className={error ? "border-destructive pr-10" : "pr-10"}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function SubmitButton({ isLoading, isInCooldown, disabled }: { isLoading: boolean; isInCooldown: boolean; disabled: boolean }) {
  return (
    <Button type="submit" className="w-full bg-tup-maroon-600 hover:bg-tup-maroon-700 text-white" disabled={disabled}>
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Signing in...
        </>
      ) : isInCooldown ? (
        "Please wait..."
      ) : (
        <>Sign in →</>
      )}
    </Button>
  );
}
