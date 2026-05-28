import * as z from "zod";
import { profileUserSchema } from "./profile";

export const authProviderIdSchema = z.enum(["email", "google", "github"]);

export type AuthProviderId = z.infer<typeof authProviderIdSchema>;

export const linkedAuthMethodSchema = z.object({
	provider: authProviderIdSchema,
	linked: z.boolean(),
	accountId: z.string().optional(),
	/** Provider-reported email when known (may differ from sign-in email). */
	email: z.string().nullable().optional(),
});

export type LinkedAuthMethod = z.infer<typeof linkedAuthMethodSchema>;

export const userEmailRowSchema = z.object({
	id: z.string(),
	email: z.string(),
	source: z.enum(["email", "google", "github", "manual", "profile"]),
	verified: z.boolean(),
	isNotificationPreferred: z.boolean(),
	/** Matches Better Auth `user.email` (email/password sign-in address). */
	isSignInEmail: z.boolean(),
});

export type UserEmailRow = z.infer<typeof userEmailRowSchema>;

export const accountSummarySchema = z.object({
	user: profileUserSchema,
	signInMethods: z.array(linkedAuthMethodSchema),
	emails: z.array(userEmailRowSchema),
	hasPassword: z.boolean(),
	providers: z.object({
		google: z.boolean(),
		github: z.boolean(),
		email: z.boolean(),
		googleLoopbackOAuthProxy: z.boolean().optional(),
	}),
});

export type AccountSummary = z.infer<typeof accountSummarySchema>;

export const setNotificationEmailSchema = z.object({
	emailId: z.string().min(1),
});

export const addContactEmailSchema = z.object({
	email: z.string().email(),
});

export const setSignInEmailSchema = z.object({
	emailId: z.string().min(1),
});

export const setPasswordSchema = z.object({
	newPassword: z.string().min(8).max(128),
});

export const changePasswordSchema = z.object({
	currentPassword: z.string().min(1),
	newPassword: z.string().min(8).max(128),
});
