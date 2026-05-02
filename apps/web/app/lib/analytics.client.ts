/** Optional PostHog capture bridge — no-ops until analytics is enabled in the browser. */
import posthog from "posthog-js";

let captureAllowed = false;

/** Called from PostHog init `loaded` (and when analytics is disabled). */
export function setPostHogCaptureAllowed(allowed: boolean): void {
	captureAllowed = allowed;
}

/**
 * Capture a custom analytics event when PostHog is initialized; no-op otherwise.
 */
export function captureAnalytics(event: string, properties?: Record<string, unknown>): void {
	if (!captureAllowed || typeof window === "undefined") {
		return;
	}
	try {
		posthog.capture(event, properties);
	} catch {
		/* ignore */
	}
}
