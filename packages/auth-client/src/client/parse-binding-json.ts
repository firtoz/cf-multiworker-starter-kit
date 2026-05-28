import { fail, type MaybeError } from "@firtoz/maybe-error";
import type { AuthApiErrorBody } from "@internal/auth-db/api-schemas";

export async function parseBindingJson<T>(
	response: Response | Promise<Response>,
	fallbackError: string,
): Promise<MaybeError<T>> {
	const resolved = await response;
	if (!resolved.ok) {
		const body = (await resolved.json().catch(() => ({}))) as AuthApiErrorBody;
		return fail(body.error ?? fallbackError);
	}
	const body = (await resolved.json()) as T;
	return { success: true as const, result: body } as MaybeError<T>;
}
