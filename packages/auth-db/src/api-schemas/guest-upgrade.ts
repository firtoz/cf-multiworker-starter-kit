import * as z from "zod";
import { profileUserSchema } from "./profile";

export const guestUpgradeEmailSchema = z.object({
	email: z.email(),
	password: z.string().min(8).max(128),
});

export type GuestUpgradeEmailInput = z.infer<typeof guestUpgradeEmailSchema>;

export const guestUpgradeEmailResponseSchema = z.object({
	user: profileUserSchema,
});

export type GuestUpgradeEmailResponse = z.infer<typeof guestUpgradeEmailResponseSchema>;
