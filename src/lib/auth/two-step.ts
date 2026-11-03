import { accessTokenClaims } from "@/lib/auth/session-policy";

/**
 * Two-step sign-in (Supabase Auth MFA, TOTP): optional for every account,
 * turned on in Settings. A session that has given the 6-digit code is
 * "aal2"; one that has given only the password is "aal1". The proxy, the
 * sign-in page and the database (migration 00056) all apply the same rule:
 * an account that turned it on gets nothing at aal1 but the code step.
 */

interface FactorLike {
  factor_type?: string;
  status?: string;
}

/** The access token's assurance level, "aal1" when it says nothing. */
export function aalFromAccessToken(token: string | null | undefined): "aal1" | "aal2" {
  return accessTokenClaims(token)?.aal === "aal2" ? "aal2" : "aal1";
}

/** Whether the account has a verified authenticator app. */
export function hasTwoStep(factors: FactorLike[] | null | undefined): boolean {
  return (factors ?? []).some((factor) => factor.factor_type === "totp" && factor.status === "verified");
}

/** Whether this session still has to give the 6-digit code. */
export function needsSecondStep(input: { accessToken: string | null | undefined; factors: FactorLike[] | null | undefined }): boolean {
  return hasTwoStep(input.factors) && aalFromAccessToken(input.accessToken) !== "aal2";
}

/** What the proxy says when a form is sent before the code is given. */
export const SECOND_STEP_REFUSAL =
  "Enter the 6-digit code from your authenticator app first, so this wasn't saved. Reload the page to continue.";
