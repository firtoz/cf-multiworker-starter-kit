import { readCloudflareAlchemyAccountEnvFile } from "alchemy-utils/cloudflare-account-env";
import { envFileKeyLooksSet } from "alchemy-utils/env-requirements";

/** `KEY=value` with a non-whitespace value */
export function dotenvKeyLooksSet(raw: string, key: string): boolean {
	return envFileKeyLooksSet(raw, key);
}

export function captureEnvAssignmentValue(raw: string, key: string): string | undefined {
	const re = new RegExp(`^\\s*${key}\\s*=\\s*([^\\n]*)`, "m");
	const m = re.exec(raw);
	const line = m?.[1]?.trim();
	if (!line) {
		return undefined;
	}
	if (
		(line.startsWith('"') && line.endsWith('"')) ||
		(line.startsWith("'") && line.endsWith("'"))
	) {
		return line.slice(1, -1) || undefined;
	}
	return line || undefined;
}

export function upsertPlainEnvKv(text: string, key: string, value: string): string {
	if (value.includes("\n") || value.includes("\r")) {
		throw new Error(`Refusing to write ${key}: value must be a single line.`);
	}
	let out = text;
	const line = `${key}=${value}`;
	const re = new RegExp(`^\\s*${key}\\s*=\\s*[^\\n]*$`, "m");
	if (re.test(out)) {
		return out.replace(re, line);
	}
	if (out && !out.endsWith("\n")) {
		out += "\n";
	}
	return `${out}${line}\n`;
}

export function hasCloudflareDeployCredentials(raw: string): boolean {
	const accountRaw = readCloudflareAlchemyAccountEnvFile();
	return (
		(dotenvKeyLooksSet(raw, "CLOUDFLARE_API_TOKEN") ||
			dotenvKeyLooksSet(accountRaw, "CLOUDFLARE_API_TOKEN")) &&
		(dotenvKeyLooksSet(raw, "CLOUDFLARE_ACCOUNT_ID") ||
			dotenvKeyLooksSet(accountRaw, "CLOUDFLARE_ACCOUNT_ID"))
	);
}
