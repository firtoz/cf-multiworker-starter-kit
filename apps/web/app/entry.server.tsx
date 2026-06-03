import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import type { EntryContext, RouterContextProvider } from "react-router";
import { ServerRouter } from "react-router";
import { generateEarlyHintsLinks, getCriticalCssAssets } from "./lib/get-critical-css";

export default async function handleRequest(
	request: Request,
	responseStatusCode: number,
	responseHeaders: Headers,
	routerContext: EntryContext,
	_loadContext: RouterContextProvider,
) {
	// Add 103 Early Hints for critical CSS
	// This allows Cloudflare to send the CSS assets before the HTML is fully rendered
	const criticalCss = getCriticalCssAssets(routerContext);
	if (criticalCss.length > 0) {
		const linkHeader = generateEarlyHintsLinks(criticalCss);
		responseHeaders.append("Link", linkHeader);
	}
	let shellRendered = false;
	const userAgent = request.headers.get("user-agent");

	const body = await renderToReadableStream(
		<ServerRouter context={routerContext} url={request.url} />,
		{
			onError(error: unknown) {
				const statusCode = 500; // Use local variable instead of reassigning parameter
				responseHeaders.set("X-Status-Code", statusCode.toString()); // Set header instead
				// Log streaming rendering errors from inside the shell.  Don't log
				// errors encountered during initial shell rendering since they'll
				// reject and get logged in handleDocumentRequest.
				if (shellRendered) {
					console.error(error);
				}
			},
		},
	);
	shellRendered = true;

	// Ensure requests from bots and SPA Mode renders wait for all content to load before responding
	// https://react.dev/reference/react-dom/server/renderToPipeableStream#waiting-for-all-content-to-load-for-crawlers-and-static-generation
	if ((userAgent && isbot(userAgent)) || routerContext.isSpaMode) {
		await body.allReady;
	}

	responseHeaders.set("Content-Type", "text/html");

	return new Response(body, {
		headers: responseHeaders,
		status: responseStatusCode,
	});
}

export const streamTimeout = 10_000;
