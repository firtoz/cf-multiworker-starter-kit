import { type DefiniteSuccess, fail, type MaybeError, success } from "@firtoz/maybe-error";
import {
	authApiErrorBodySchema,
	betterAuthErrorBodySchema,
	parseBetterAuthErrorMessage,
} from "@internal/auth-db/api-schemas";
import type { z } from "zod";

type JsonFetchResponse = {
	ok: boolean;
	json: () => Promise<unknown>;
};

type JsonResponseOptions<S extends z.ZodType> = {
	successSchema: S;
	fallbackError: string;
	errorKind?: "better-auth" | "auth-api";
};

const ok = success as <T>(value: T) => DefiniteSuccess<T>;

async function readJsonBody(response: JsonFetchResponse): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function parseErrorMessage(
	json: unknown,
	kind: "better-auth" | "auth-api",
	fallback: string,
): string {
	if (kind === "better-auth") {
		const parsed = betterAuthErrorBodySchema.safeParse(json);
		return parsed.success ? parseBetterAuthErrorMessage(parsed.data, fallback) : fallback;
	}
	const parsed = authApiErrorBodySchema.safeParse(json);
	return parsed.success ? (parsed.data.error ?? fallback) : fallback;
}

async function parseJsonResponse<S extends z.ZodType>(
	response: JsonFetchResponse | Promise<JsonFetchResponse>,
	options: JsonResponseOptions<S>,
): Promise<MaybeError<z.infer<S>>> {
	const resolved = await response;
	const json = await readJsonBody(resolved);
	if (!resolved.ok) {
		return fail(parseErrorMessage(json, options.errorKind ?? "auth-api", options.fallbackError));
	}
	const successParsed = options.successSchema.safeParse(json);
	if (!successParsed.success) {
		return fail(options.fallbackError);
	}
	return ok(successParsed.data);
}

export async function parseBetterAuthJson<T extends z.ZodType>(
	response: JsonFetchResponse | Promise<JsonFetchResponse>,
	fallbackError: string,
	successSchema: T,
): Promise<MaybeError<z.output<T>>> {
	return parseJsonResponse(response, {
		successSchema,
		fallbackError,
		errorKind: "better-auth",
	});
}

export async function parseBindingJson<T extends z.ZodType>(
	response: JsonFetchResponse | Promise<JsonFetchResponse>,
	fallbackError: string,
	successSchema: T,
): Promise<MaybeError<z.output<T>>> {
	return parseJsonResponse(response, {
		successSchema,
		fallbackError,
		errorKind: "auth-api",
	});
}
