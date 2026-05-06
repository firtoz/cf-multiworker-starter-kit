"use client";

/**
 * Optional starter-kit analytics shell (PostHog). Only meaningful when the app passes a loader config with
 * `enabled: true` and Worker bindings exist; otherwise safe no-op — remove this file + deps if you drop analytics entirely.
 */

import { PostHogErrorBoundary, PostHogProvider } from "@posthog/react";
import posthog from "posthog-js";
import { type ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { setPostHogCaptureAllowed } from "~/lib/analytics.client";
import type { PostHogRuntimeTags } from "~/lib/posthog-runtime-tags";

export type PostHogLoaderAnalytics = {
	enabled: boolean;
	key: string;
	host: string;
	site: string;
	runtimeTags: PostHogRuntimeTags;
};

export type PostHogAnalyticsRootProps = {
	analytics: PostHogLoaderAnalytics;
	children: ReactNode;
};

let posthogInitialized = false;

function initPostHog(key: string, host: string, site: string, runtimeTags: PostHogRuntimeTags) {
	if (posthogInitialized || typeof window === "undefined") {
		return;
	}

	posthog.init(key, {
		api_host: host,
		defaults: "2026-01-30",
		logs: {
			environment: runtimeTags.deployment_environment,
		},
		capture_pageview: false,
		capture_pageleave: true,
		autocapture: true,
		disable_session_recording: false,
		respect_dnt: true,
		persistence: "localStorage+cookie",
		cross_subdomain_cookie: false,
		advanced_disable_decide: false,
		opt_out_capturing_by_default: false,
		loaded: () => {
			posthog.register({
				deploy_stage: runtimeTags.deploy_stage,
				...(site ? { site } : {}),
				...(runtimeTags.preview_pr_number == null
					? {}
					: { preview_pr_number: runtimeTags.preview_pr_number }),
			});
			setPostHogCaptureAllowed(true);
			if (import.meta.env.DEV) {
				console.log("PostHog loaded");
			}
		},
	});

	posthogInitialized = true;
}

function PageViewTracker() {
	const location = useLocation();

	useEffect(() => {
		if (!posthogInitialized) {
			return;
		}
		posthog.capture("$pageview", {
			$current_url: window.location.href,
			$pathname: location.pathname,
		});
	}, [location.pathname]);

	return null;
}

function ErrorFallback({ error }: { error: unknown }) {
	const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
	const errorStack = error instanceof Error ? error.stack : undefined;

	return (
		<main className="pt-16 p-4 container mx-auto">
			<h1 className="text-xl font-semibold">Something went wrong</h1>
			<p className="mt-2 text-zinc-600 dark:text-zinc-400">
				We&apos;ve been notified of this error and will look into it.
			</p>
			{import.meta.env.DEV && errorStack && (
				<details className="mt-4">
					<summary className="cursor-pointer text-sm text-zinc-500">Error details</summary>
					<pre className="mt-2 overflow-auto rounded border border-zinc-200 p-2 font-mono text-xs dark:border-zinc-700">
						{errorMessage}
						{"\n\n"}
						{errorStack}
					</pre>
				</details>
			)}
			<button
				type="button"
				className="mt-4 rounded-md border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-600"
				onClick={() => window.location.reload()}
			>
				Reload page
			</button>
		</main>
	);
}

const POSTHOG_IDLE_INIT_TIMEOUT_MS = 3500;

function schedulePostHogInit(callback: () => void): () => void {
	let idleId: number | undefined;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	let raf1 = 0;
	let raf2 = 0;
	let cancelled = false;

	const run = () => {
		if (cancelled) {
			return;
		}
		callback();
	};

	raf1 = requestAnimationFrame(() => {
		raf2 = requestAnimationFrame(() => {
			if (cancelled) {
				return;
			}
			if (typeof requestIdleCallback === "undefined") {
				timeoutId = setTimeout(run, 0);
			} else {
				idleId = requestIdleCallback(run, { timeout: POSTHOG_IDLE_INIT_TIMEOUT_MS });
			}
		});
	});

	return () => {
		cancelled = true;
		cancelAnimationFrame(raf1);
		cancelAnimationFrame(raf2);
		if (idleId !== undefined && typeof cancelIdleCallback !== "undefined") {
			cancelIdleCallback(idleId);
		}
		if (timeoutId !== undefined) {
			clearTimeout(timeoutId);
		}
	};
}

export function PostHogAnalyticsProvider({ analytics, children }: PostHogAnalyticsRootProps) {
	const { enabled, key, host, site, runtimeTags } = analytics;
	const [initComplete, setInitComplete] = useState(false);

	useEffect(() => {
		if (!enabled || !key) {
			setPostHogCaptureAllowed(false);
			setInitComplete(false);
			return;
		}

		return schedulePostHogInit(() => {
			initPostHog(key, host, site, runtimeTags);
			setInitComplete(true);
		});
	}, [enabled, key, host, site, runtimeTags]);

	if (!enabled || !key) {
		return <>{children}</>;
	}

	return (
		<PostHogProvider client={posthog}>
			{initComplete ? <PageViewTracker /> : null}
			<PostHogErrorBoundary fallback={ErrorFallback}>{children}</PostHogErrorBoundary>
		</PostHogProvider>
	);
}
