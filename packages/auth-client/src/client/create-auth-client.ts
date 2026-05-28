import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import type { ProfileUpdate, ProfileUpdateResponse } from "@internal/auth-db/api-schemas";
import { profileUpdateSchema } from "@internal/auth-db/api-schemas";
import { createAuthBindingFetch } from "../binding/auth-binding-fetch";
import { buildAuthBindingHeaders } from "../binding-headers";
import { type EnsureChatSessionResult, ensureChatSession } from "../chat-session";
import { type AuthSession, type AuthUser, parseAuthRole } from "../roles";
import { getSession, requireAdmin } from "../session";
import { type AuthBindingFetch, createAdminApi } from "./admin-api";
import { parseBindingJson } from "./parse-binding-json";

export type { AuthBindingFetch };

function mapProfileUser(user: ProfileUpdateResponse["user"]): AuthUser {
	return {
		id: user.id,
		email: user.email,
		role: parseAuthRole(user.role),
		...(user.name?.trim() ? { name: user.name.trim() } : {}),
		...(user.image?.trim() ? { image: user.image.trim() } : {}),
		...(user.isAnonymous === true ? { isAnonymous: true } : {}),
	};
}

function createProfileApi(fetch: AuthBindingFetch) {
	return {
		async update(patch: ProfileUpdate): Promise<MaybeError<{ user: AuthUser }>> {
			const parsed = profileUpdateSchema.safeParse(patch);
			if (!parsed.success) {
				const issue = parsed.error.issues[0]?.message ?? "Invalid profile update";
				return fail(issue);
			}
			const result = await parseBindingJson<ProfileUpdateResponse>(
				fetch("/api/profile", {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(parsed.data),
				}),
				"Could not save profile",
			);
			if (!result.success) {
				return result;
			}
			return success({ user: mapProfileUser(result.result.user) });
		},
	};
}

export type AuthClient = ReturnType<typeof createAuthClient>;

/** Browser-backed auth client: session reads + auth-worker custom API. */
export function createAuthClient(auth: Fetcher, request: Request) {
	const bindingFetch = createAuthBindingFetch(auth, buildAuthBindingHeaders(request));
	return {
		session: {
			get: (): Promise<AuthSession | null> => getSession(auth, request),
			requireAdmin: (): Promise<AuthSession | null> => requireAdmin(auth, request),
			ensureChat: (): Promise<EnsureChatSessionResult | null> => ensureChatSession(auth, request),
		},
		admin: createAdminApi(bindingFetch),
		profile: createProfileApi(bindingFetch),
		/** Low-level service-binding fetch (path only, e.g. `/admin/users`). */
		fetch: bindingFetch,
	};
}
