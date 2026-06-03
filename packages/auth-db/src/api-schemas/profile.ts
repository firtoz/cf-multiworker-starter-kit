import { createSelectSchema, createUpdateSchema } from "drizzle-zod";
import * as z from "zod";
import { PROFILE_NAME_MAX_CHARS } from "../constants";
import { user } from "../schema";

/** Explicit allowlist — new user columns stay locked until added here. */
export const profilePatchableColumns = {
	name: true,
	image: true,
} as const satisfies Partial<Record<keyof typeof user.$inferSelect, true>>;

export const profileUpdateSchema = createUpdateSchema(user, {
	name: z.string().trim().min(1).max(PROFILE_NAME_MAX_CHARS),
})
	.pick(profilePatchableColumns)
	.strict()
	.refine((patch) => Object.keys(patch).length > 0, {
		message: "At least one field required",
	});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

/** Required single-field name update (admin set user name). */
export const profileNameRequiredSchema = createUpdateSchema(user, {
	name: z.string().trim().min(1).max(PROFILE_NAME_MAX_CHARS),
})
	.pick({ name: true })
	.required({ name: true });

export const profileUserSchema = createSelectSchema(user, {
	/** Null/omitted for normal accounts; only guest sessions set true. */
	isAnonymous: z.boolean().nullable().optional(),
}).pick({
	id: true,
	email: true,
	name: true,
	image: true,
	role: true,
	isAnonymous: true,
});

export type ProfileUserWire = z.infer<typeof profileUserSchema>;

export const profileUpdateResponseSchema = z.object({
	user: profileUserSchema,
});

export type ProfileUpdateResponse = z.infer<typeof profileUpdateResponseSchema>;
