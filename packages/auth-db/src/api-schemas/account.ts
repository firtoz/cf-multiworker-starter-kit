import * as z from "zod";
import { PROFILE_NAME_MAX_CHARS } from "../constants";
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

export const userEmailSourceSchema = z.enum(["email", "google", "github", "manual", "profile"]);

export type UserEmailSource = z.infer<typeof userEmailSourceSchema>;

export const userEmailRowSchema = z.object({
	id: z.string(),
	email: z.string(),
	source: userEmailSourceSchema,
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
		oauthProxy: z.boolean().optional(),
		oauthProxyPassthrough: z.boolean().optional(),
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
	revokeOtherSessions: z.boolean().optional(),
});

export const accountSessionRowSchema = z.object({
	id: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	expiresAt: z.string(),
	ipAddress: z.string().nullable().optional(),
	userAgent: z.string().nullable().optional(),
	isCurrent: z.boolean(),
});

export type AccountSessionRow = z.infer<typeof accountSessionRowSchema>;

export const accountSessionsResponseSchema = z.object({
	sessions: z.array(accountSessionRowSchema),
});

export type AccountSessionsResponse = z.infer<typeof accountSessionsResponseSchema>;

export const revokeAccountSessionSchema = z.object({
	intent: z.literal("revokeSession"),
	sessionId: z.string().min(1),
});

export const revokeOtherAccountSessionsSchema = z.object({
	intent: z.literal("revokeOtherSessions"),
});

export const setNotificationEmailPatchSchema = setNotificationEmailSchema.extend({
	intent: z.literal("setNotificationEmail"),
});

export const addContactEmailPatchSchema = addContactEmailSchema.extend({
	intent: z.literal("addContactEmail"),
});

export const setSignInEmailPatchSchema = setSignInEmailSchema.extend({
	intent: z.literal("setSignInEmail"),
});

export const accountPatchBodySchema = z.discriminatedUnion("intent", [
	setNotificationEmailPatchSchema,
	addContactEmailPatchSchema,
	setSignInEmailPatchSchema,
]);

export type AccountPatchBody = z.infer<typeof accountPatchBodySchema>;

export const setPasswordPostSchema = setPasswordSchema.extend({
	intent: z.literal("setPassword"),
});

export const changePasswordPostSchema = changePasswordSchema.extend({
	intent: z.literal("changePassword"),
});

export const accountPasswordBodySchema = z.discriminatedUnion("intent", [
	setPasswordPostSchema,
	changePasswordPostSchema,
]);

export type AccountPasswordBody = z.infer<typeof accountPasswordBodySchema>;

export const saveDisplayNameBodySchema = z.object({
	intent: z.literal("saveDisplayName"),
	displayName: z.string().trim().min(1).max(PROFILE_NAME_MAX_CHARS),
});

export type SaveDisplayNameBody = z.infer<typeof saveDisplayNameBodySchema>;

/** Web account route: display name, emails, and password mutations. */
export const accountFormSchema = z.discriminatedUnion("intent", [
	saveDisplayNameBodySchema,
	setNotificationEmailPatchSchema,
	addContactEmailPatchSchema,
	setSignInEmailPatchSchema,
	setPasswordPostSchema,
	changePasswordPostSchema,
	revokeAccountSessionSchema,
	revokeOtherAccountSessionsSchema,
]);

export type AccountFormBody = z.infer<typeof accountFormSchema>;

export const authMutationOkResponseSchema = z.object({
	ok: z.literal(true),
});

export type AuthMutationOkResponse = z.infer<typeof authMutationOkResponseSchema>;

export const authAddContactEmailResponseSchema = z.object({
	ok: z.literal(true),
	emailId: z.string(),
});

export type AuthAddContactEmailResponse = z.infer<typeof authAddContactEmailResponseSchema>;
