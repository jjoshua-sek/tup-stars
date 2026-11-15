import { z } from "zod";

import { STAFF_ID, STUDENT_NUMBER } from "@/lib/accounts/enrollment";

/**
 * Sign-in validation. The page has two tabs:
 *
 * - Student: student number (TUPM-YY-NNNN), password and birth date, as on
 *   the TUP ERS. The birth date is checked against the student's record.
 * - Staff: staff ID (STAFF-YY-NNNN) and password. Staff have no birth date
 *   on record, and their IDs never look like student numbers (00059).
 */
export const staffLoginSchema = z.object({
  staff_id: z
    .string()
    .trim()
    .toUpperCase()
    .regex(STAFF_ID, "Type your staff ID as STAFF-YY-NNNN (for example STAFF-26-0001)."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;

export const loginSchema = z.object({
  student_number: z
    .string()
    .trim()
    .toUpperCase()
    .regex(STUDENT_NUMBER, "Type your student number as TUPM-YY-NNNN (for example TUPM-22-0148)."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
  birth_date: z
    .string()
    .min(1, "Please enter your birth date")
    .regex(
      /^\d{4}-\d{2}-\d{2}$/,
      "Birth date must be a valid date"
    ),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Password change validation.
 * Enforces strong passwords per Philippine NPC advisory:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 number
 * - At least 1 special character
 */
/**
 * The password rules on their own, shared by password change, account
 * activation and admin-created accounts so all three enforce the same
 * policy.
 */
export const newPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Z]/, "Must contain at least one uppercase letter")
  .regex(/[0-9]/, "Must contain at least one number")
  .regex(
    /[^a-zA-Z0-9]/,
    "Must contain at least one special character (!@#$%^&*)"
  );

export const passwordChangeSchema = z
  .object({
    old_password: z.string().min(8, "Current password is required"),
    new_password: newPasswordSchema,
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
  })
  .refine((data) => data.old_password !== data.new_password, {
    message: "New password must be different from current password",
    path: ["new_password"],
  });

export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
