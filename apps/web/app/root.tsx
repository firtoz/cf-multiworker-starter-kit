import type { Route } from "./+types/root";
import "./app.css";

import dmSansLatinExtWoff2 from "@fontsource-variable/dm-sans/files/dm-sans-latin-ext-wght-normal.woff2?url";
import dmSansLatinWoff2 from "@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2?url";
import firaCodeLatinExtWoff2 from "@fontsource-variable/fira-code/files/fira-code-latin-ext-wght-normal.woff2?url";
import firaCodeLatinWoff2 from "@fontsource-variable/fira-code/files/fira-code-latin-wght-normal.woff2?url";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";

const CRITICAL_FONT_FACE_CSS = `
@font-face {
	font-family: "DM Sans Variable";
	font-style: normal;
	font-display: swap;
	font-weight: 100 1000;
	src: url("${dmSansLatinWoff2}") format("woff2-variations");
}
@font-face {
	font-family: "Fira Code Variable";
	font-style: normal;
	font-display: swap;
	font-weight: 300 700;
	src: url("${firaCodeLatinWoff2}") format("woff2-variations");
}
`;

export function headers(_args: Route.HeadersArgs) {
	return {
		// Forces browsers to respect Content-Type instead of MIME sniffing.
		// See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options
		"X-Content-Type-Options": "nosniff",
		/** Limit referrer leakage on navigations away from this site. */
		"Referrer-Policy": "strict-origin-when-cross-origin",
		/** Narrow powerful browser APIs (baseline for a Workers app that does not use them yet). */
		"Permissions-Policy":
			"accelerometer=(), camera=(), geolocation=(), microphone=(), gyroscope=(), magnetometer=(), payment=(), usb=(), browsing-topics=()",
		/** Allow same-origin iframe embedding only. */
		"X-Frame-Options": "SAMEORIGIN",
	};
}

/** Preloads WOFF2 so critical font faces can render before first paint. */
export const links: Route.LinksFunction = () => [
	{
		rel: "preload",
		href: dmSansLatinWoff2,
		as: "font",
		type: "font/woff2",
		crossOrigin: "anonymous",
		fetchPriority: "high",
	},
	{
		rel: "preload",
		href: dmSansLatinExtWoff2,
		as: "font",
		type: "font/woff2",
		crossOrigin: "anonymous",
	},
	{
		rel: "preload",
		href: firaCodeLatinWoff2,
		as: "font",
		type: "font/woff2",
		crossOrigin: "anonymous",
		fetchPriority: "low",
	},
	{
		rel: "preload",
		href: firaCodeLatinExtWoff2,
		as: "font",
		type: "font/woff2",
		crossOrigin: "anonymous",
		fetchPriority: "low",
	},
];

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				{/*
					Critical CSS for dark mode FOUC prevention
					https://web.dev/articles/prefers-color-scheme#dark-mode-but-add-an-opt-out
				*/}
				<style
					// biome-ignore lint/security/noDangerouslySetInnerHtml: We need to set the color scheme of the html tag to light dark
					dangerouslySetInnerHTML={{
						__html: `
							${CRITICAL_FONT_FACE_CSS}
							html { color-scheme: light dark; }
							html, body { 
								background-color: #fff; 
								color: #111; 
							}
							@media (prefers-color-scheme: dark) {
								html, body { 
									background-color: #030712; 
									color: #f6f3f4; 
								}
							}
						`,
					}}
				/>
				<Meta />
				<Links />
			</head>
			<body className="font-sans antialiased">
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404" : "Error";
		details =
			error.status === 404 ? "The requested page could not be found." : error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main className="pt-16 p-4 container mx-auto">
			<h1>{message}</h1>
			<p>{details}</p>
			{stack && (
				<pre className="w-full p-4 overflow-x-auto font-mono text-sm">
					<code>{stack}</code>
				</pre>
			)}
		</main>
	);
}
