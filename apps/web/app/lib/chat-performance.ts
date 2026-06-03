export function markChatPerformance(name: string): void {
	if (typeof performance === "undefined" || typeof performance.mark !== "function") {
		return;
	}
	performance.mark(`chat:${name}`);
}

export function measureChatPerformance(name: string, start: string, end: string): void {
	if (typeof performance === "undefined" || typeof performance.measure !== "function") {
		return;
	}
	const measureName = `chat:${name}`;
	try {
		performance.measure(measureName, `chat:${start}`, `chat:${end}`);
	} catch {
		// Missing marks are fine in partial hydration or trace-only paths.
	}
}
