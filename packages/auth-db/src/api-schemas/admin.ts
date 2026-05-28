import { createSelectSchema } from "drizzle-zod";
import * as z from "zod";
import { user } from "../schema";
import { profileNameRequiredSchema } from "./profile";

/** D1 / legacy rows may omit timestamps or store invalid values — normalize before Zod. */
export function parseTimestampOrNull(value: unknown): Date | null {
	if (value == null || value === "") {
		return null;
	}
	const d = value instanceof Date ? value : new Date(value as string | number);
	return Number.isNaN(d.getTime()) ? null : d;
}

function parseTimestamp(value: unknown, fallback?: unknown): Date {
	return parseTimestampOrNull(value) ?? parseTimestampOrNull(fallback) ?? new Date(0);
}

export const adminUserRowSchema = createSelectSchema(user)
	.pick({
		id: true,
		email: true,
		name: true,
		role: true,
		createdAt: true,
	})
	.extend({
		updatedAt: z.date(),
		isAnonymous: z.boolean(),
		/** Latest `session.updatedAt` across all sessions (sliding refresh on visit). */
		lastSeenAt: z.date().nullable(),
		/** Latest active session `expiresAt` (`null` when no non-expired session). */
		sessionExpiresAt: z.date().nullable(),
	});

export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

export type AdminUserRowSource = Pick<
	typeof user.$inferSelect,
	"id" | "email" | "name" | "role" | "createdAt" | "updatedAt" | "isAnonymous"
>;

export type AdminUserSessionActivity = {
	lastSeenAt: Date | null;
	sessionExpiresAt: Date | null;
};

export function toAdminUserRowWire(
	row: AdminUserRowSource,
	activity?: AdminUserSessionActivity,
): AdminUserRow {
	return adminUserRowSchema.parse({
		id: row.id,
		email: row.email,
		name: row.name,
		role: row.role,
		createdAt: parseTimestamp(row.createdAt),
		updatedAt: parseTimestamp(row.updatedAt, row.createdAt),
		isAnonymous: row.isAnonymous === true,
		lastSeenAt: parseTimestampOrNull(activity?.lastSeenAt),
		sessionExpiresAt: parseTimestampOrNull(activity?.sessionExpiresAt),
	});
}

export const adminUsersResponseSchema = z.object({
	users: z.array(adminUserRowSchema),
});

export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;

export const adminOriginsResponseSchema = z.object({
	origins: z.array(z.string()),
});

export type AdminOriginsResponse = z.infer<typeof adminOriginsResponseSchema>;

export const adminOkResponseSchema = z.object({
	ok: z.literal(true),
});

export type AdminOkResponse = z.infer<typeof adminOkResponseSchema>;

export const adminSetRoleSchema = z.object({
	role: z.enum(["user", "admin"]),
});

export type AdminSetRoleInput = z.infer<typeof adminSetRoleSchema>;

export const adminAddOriginSchema = z.object({
	origin: z.string().trim().min(1),
});

export type AdminAddOriginInput = z.infer<typeof adminAddOriginSchema>;

export const adminSetOriginsSchema = z.object({
	origins: z.array(z.string()),
});

export type AdminSetOriginsInput = z.infer<typeof adminSetOriginsSchema>;

export const adminSetUserNameSchema = profileNameRequiredSchema;

export const adminSetUserNameResponseSchema = z.object({
	user: adminUserRowSchema,
});

export type AdminSetUserNameResponse = z.infer<typeof adminSetUserNameResponseSchema>;

export const authApiErrorBodySchema = z.object({
	error: z.string().optional(),
});

export type AuthApiErrorBody = z.infer<typeof authApiErrorBodySchema>;
