import type { TypedHonoFetcher } from "@firtoz/hono-fetcher";
import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import {
	type ProfileUpdate,
	type ProfileUpdateResponse,
	profileUpdateResponseSchema,
	profileUpdateSchema,
} from "@internal/auth-db/api-schemas";
import { parseAuthRole } from "@internal/auth-db/roles";
import type { ProfileApp } from "auth-worker/profile";
import type { HonoClientApp } from "../binding/hono-client-app";
import type { AuthUser } from "../roles";
import { parseBindingJson } from "./parse-json";

type ProfileAppClient = HonoClientApp<ProfileApp>;

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

export function createProfileApi(api: TypedHonoFetcher<ProfileAppClient>) {
	return {
		async update(patch: ProfileUpdate): Promise<MaybeError<{ user: AuthUser }>> {
			const parsed = profileUpdateSchema.safeParse(patch);
			if (!parsed.success) {
				const issue = parsed.error.issues[0]?.message ?? "Invalid profile update";
				return fail(issue);
			}
			const result = await parseBindingJson(
				api.patch({ url: "/", body: parsed.data }),
				"Could not save profile",
				profileUpdateResponseSchema,
			);
			if (!result.success) {
				return result;
			}
			return success({ user: mapProfileUser(result.result.user) });
		},
	};
}
