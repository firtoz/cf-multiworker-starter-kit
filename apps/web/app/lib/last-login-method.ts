/** How the user last signed in successfully (browser localStorage). */
export type LastLoginMethod = "email" | "google" | "github";

const STORAGE_KEY = "last_login_method";
const PENDING_KEY = "pending_login_method";

function isLastLoginMethod(value: string | null): value is LastLoginMethod {
	return value === "email" || value === "google" || value === "github";
}

export function getLastLoginMethod(): LastLoginMethod | null {
	if (typeof window === "undefined") {
		return null;
	}
	const stored = localStorage.getItem(STORAGE_KEY);
	return isLastLoginMethod(stored) ? stored : null;
}

export function setLastLoginMethod(method: LastLoginMethod): void {
	if (typeof window === "undefined") {
		return;
	}
	localStorage.setItem(STORAGE_KEY, method);
	sessionStorage.removeItem(PENDING_KEY);
}

/** Set before OAuth redirect; committed after callback when the user has a session. */
export function setPendingLoginMethod(method: "google" | "github"): void {
	if (typeof window === "undefined") {
		return;
	}
	sessionStorage.setItem(PENDING_KEY, method);
}

export function commitPendingLastLoginMethod(): void {
	if (typeof window === "undefined") {
		return;
	}
	const pending = sessionStorage.getItem(PENDING_KEY);
	if (isLastLoginMethod(pending) && pending !== "email") {
		localStorage.setItem(STORAGE_KEY, pending);
		sessionStorage.removeItem(PENDING_KEY);
	}
}

export const LAST_LOGIN_LABELS: Record<LastLoginMethod, string> = {
	email: "Email & password",
	google: "Google",
	github: "GitHub",
};
