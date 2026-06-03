/** True when OAuth proxy target is local loopback (Portless + Google dev trick). */
export function isLoopbackOAuthProxyProductionUrl(productionUrl: string): boolean {
	try {
		const host = new URL(productionUrl).hostname;
		return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
	} catch {
		return false;
	}
}
