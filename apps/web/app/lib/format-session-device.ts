function parseBrowser(userAgent: string): string | null {
	if (/Edg\//i.test(userAgent)) {
		return "Microsoft Edge";
	}
	if (/OPR\//i.test(userAgent) || /Opera/i.test(userAgent)) {
		return "Opera";
	}
	if (/Firefox\//i.test(userAgent)) {
		const version = userAgent.match(/Firefox\/([\d.]+)/)?.[1]?.split(".")[0];
		return version ? `Firefox ${version}` : "Firefox";
	}
	if (/Chrome\//i.test(userAgent) && !/Chromium/i.test(userAgent)) {
		const version = userAgent.match(/Chrome\/([\d.]+)/)?.[1]?.split(".")[0];
		return version ? `Chrome ${version}` : "Chrome";
	}
	if (/Safari\//i.test(userAgent) && /Version\//i.test(userAgent)) {
		const version = userAgent.match(/Version\/([\d.]+)/)?.[1]?.split(".")[0];
		return version ? `Safari ${version}` : "Safari";
	}
	return null;
}

function parseOs(userAgent: string): string | null {
	if (/Android/i.test(userAgent)) {
		return "Android";
	}
	if (/iPad/i.test(userAgent)) {
		return "iPadOS";
	}
	if (/iPhone|iPod/i.test(userAgent)) {
		return "iOS";
	}
	if (/Windows NT/i.test(userAgent)) {
		return "Windows";
	}
	if (/Mac OS X|Macintosh/i.test(userAgent)) {
		return "macOS";
	}
	if (/CrOS/i.test(userAgent)) {
		return "ChromeOS";
	}
	if (/Linux/i.test(userAgent)) {
		return "Linux";
	}
	return null;
}

/** Human-readable device label plus the stored user-agent string (when present). */
export function formatSessionDevice(userAgent: string | null | undefined): {
	label: string;
	raw: string | null;
} {
	if (!userAgent?.trim()) {
		return { label: "Unknown device", raw: null };
	}
	const raw = userAgent.trim();
	const browser = parseBrowser(raw);
	const os = parseOs(raw);
	let label: string;
	if (browser && os) {
		label = `${browser} on ${os}`;
	} else if (browser) {
		label = browser;
	} else if (os) {
		label = os;
	} else {
		label = "Unknown device";
	}
	return { label, raw };
}
