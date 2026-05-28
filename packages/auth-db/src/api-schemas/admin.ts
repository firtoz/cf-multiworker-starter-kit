import { createSelectSchema } from "drizzle-zod";
import * as z from "zod";
import { user } from "../schema";
import { profileNameRequiredSchema } from "./profile";

export const adminUserRowSchema = createSelectSchema(user).pick({
	id: true,
	email: true,
	name: true,
	role: true,
	createdAt: true,
});

export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

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
