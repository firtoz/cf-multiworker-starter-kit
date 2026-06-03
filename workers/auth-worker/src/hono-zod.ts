import { zValidator } from "@hono/zod-validator";
import type { z } from "zod";

/** JSON body validator with `{ error: string }` responses matching auth-worker API conventions. */
export function jsonValidator<T extends z.ZodType>(schema: T) {
	return zValidator("json", schema, (result, c) => {
		if (!result.success) {
			const message = result.error.issues[0]?.message ?? "Invalid request";
			return c.json({ error: message }, 400);
		}
	});
}
