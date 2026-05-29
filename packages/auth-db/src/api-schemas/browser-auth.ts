import * as z from "zod";

export const authSocialProviderSchema = z.enum(["google", "github"]);

export type AuthSocialProvider = z.infer<typeof authSocialProviderSchema>;

const betterAuthNestedErrorSchema = z.object({
	message: z.string().optional(),
});

/** Better Auth JSON error bodies (`message` and/or nested `error`). */
export const betterAuthErrorBodySchema = z.object({
	message: z.string().optional(),
	error: z.union([z.string(), betterAuthNestedErrorSchema]).optional(),
});

export function parseBetterAuthErrorMessage(
	body: z.infer<typeof betterAuthErrorBodySchema>,
	fallback: string,
): string {
	if (body.message) {
		return body.message;
	}
	const err = body.error;
	if (typeof err === "string") {
		return err;
	}
	if (err?.message) {
		return err.message;
	}
	return fallback;
}

/** Better Auth session/OAuth endpoints — fields vary; callers rely on `url` for OAuth starts. */
export const betterAuthSessionOkResponseSchema = z.object({
	url: z.string().optional(),
	redirect: z.boolean().optional(),
	token: z.string().optional(),
});

export type BetterAuthSessionOkResponse = z.infer<typeof betterAuthSessionOkResponseSchema>;

export const authEmailSignInBodySchema = z.object({
	email: z.email(),
	password: z.string().min(1),
	callbackURL: z.string().optional(),
	rememberMe: z.boolean().optional(),
});

export type AuthEmailSignInBody = z.infer<typeof authEmailSignInBodySchema>;

export const authEmailSignUpBodySchema = z.object({
	name: z.string().trim().min(1),
	email: z.email(),
	password: z.string().min(8),
	callbackURL: z.string().optional(),
	rememberMe: z.boolean().optional(),
});

export type AuthEmailSignUpBody = z.infer<typeof authEmailSignUpBodySchema>;

export const authSocialSignInBodySchema = z.object({
	provider: authSocialProviderSchema,
	callbackURL: z.string().optional(),
	errorCallbackURL: z.string().optional(),
});

export type AuthSocialSignInBody = z.infer<typeof authSocialSignInBodySchema>;

export const authLinkSocialBodySchema = z.object({
	provider: authSocialProviderSchema,
	callbackURL: z.string(),
	errorCallbackURL: z.string(),
});

export type AuthLinkSocialBody = z.infer<typeof authLinkSocialBodySchema>;
