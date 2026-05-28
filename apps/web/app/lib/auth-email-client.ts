/** POST JSON to Better Auth on the web origin (`/api/auth/*` is proxied to the auth worker). */

type AuthEmailSignInBody = {
	email: string;
	password: string;
	callbackURL?: string;
	rememberMe?: boolean;
};

type AuthEmailSignUpBody = {
	name: string;
	email: string;
	password: string;
	callbackURL?: string;
	rememberMe?: boolean;
};

type AuthEmailSuccess = {
	redirect?: boolean;
	token?: string;
	url?: string;
	user?: unknown;
};

type AuthSocialProvider = "google" | "github";

type AuthSocialSignInBody = {
	provider: AuthSocialProvider;
	callbackURL?: string;
};

function parseAuthErrorMessage(body: unknown): string {
	if (body == null || typeof body !== "object") {
		return "Sign-in failed";
	}
	const o = body as Record<string, unknown>;
	if (typeof o["message"] === "string") {
		return o["message"];
	}
	const err = o["error"];
	if (typeof err === "string") {
		return err;
	}
	if (
		err != null &&
		typeof err === "object" &&
		typeof (err as { message?: string }).message === "string"
	) {
		return (err as { message: string }).message;
	}
	return "Sign-in failed";
}

async function postAuthJson<TBody extends object>(
	path: string,
	body: TBody,
): Promise<{ ok: true } | { ok: false; message: string }> {
	const res = await fetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify(body),
	});
	let data: unknown;
	try {
		data = await res.json();
	} catch {
		data = null;
	}
	if (!res.ok) {
		return { ok: false, message: parseAuthErrorMessage(data) };
	}
	const success = data as AuthEmailSuccess;
	if (success.url) {
		window.location.assign(success.url);
		return { ok: true };
	}
	return { ok: true };
}

export async function signInWithEmail(
	email: string,
	password: string,
	callbackURL: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
	const body: AuthEmailSignInBody = {
		email,
		password,
		callbackURL,
		rememberMe: true,
	};
	const result = await postAuthJson("/api/auth/sign-in/email", body);
	if (result.ok) {
		window.location.assign(callbackURL);
	}
	return result;
}

export async function signInWithSocial(
	provider: AuthSocialProvider,
	callbackURL: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
	const body: AuthSocialSignInBody = {
		provider,
		callbackURL,
	};
	const result = await postAuthJson("/api/auth/sign-in/social", body);
	if (result.ok) {
		return { ok: true };
	}
	return result;
}

export async function linkSocialProvider(
	provider: AuthSocialProvider,
	callbackURL: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
	const result = await postAuthJson("/api/auth/link-social", {
		provider,
		callbackURL,
	});
	return result;
}

export async function signUpWithEmail(
	name: string,
	email: string,
	password: string,
	callbackURL: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
	const body: AuthEmailSignUpBody = {
		name,
		email,
		password,
		callbackURL,
		rememberMe: true,
	};
	const result = await postAuthJson("/api/auth/sign-up/email", body);
	if (result.ok) {
		window.location.assign(callbackURL);
	}
	return result;
}
