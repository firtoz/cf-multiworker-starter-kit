/**
 * Shared copy for scripts and docs — Cloudflare credentials are always user-created (no OAuth / automated minting).
 */

export type CloudflareHintStage = "staging" | "production";

export function cloudflareManualHintsLines(stage: CloudflareHintStage): string[] {
	const file = stage === "staging" ? "`.env.staging`" : "`.env.production`";
	return [
		`**Cloudflare credentials** — create these in the dashboard (this repo does not mint tokens for you).`,
		``,
		`1. **Account ID** — [Cloudflare dashboard](https://dash.cloudflare.com/) → select your account → **Workers & Pages** (or **Account** home / overview). Copy **Account ID**.`,
		`2. **API token** — [My Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token**.`,
		`   - Fast path: use the **Edit Cloudflare Workers** template, scoped to the same account as the ID above.`,
		`   - Stricter: custom token with **Workers Scripts** (edit) + **Workers Tail** (read) + **Account** / **D1** permissions your deploy needs — see [Workers API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) and [D1](https://developers.cloudflare.com/d1/).`,
		``,
		`3. Paste into ${file} (or run **\`bun run setup:${stage === "staging" ? "staging" : "prod"}\`** and fill the Cloudflare category):`,
		``,
		`   \`\`\`bash`,
		`   CLOUDFLARE_API_TOKEN=...`,
		`   CLOUDFLARE_ACCOUNT_ID=...`,
		`   \`\`\``,
		``,
		`Token and Account ID must refer to the **same** Cloudflare account.`,
	];
}

export function printCloudflareManualHints(stage: CloudflareHintStage): void {
	for (const line of cloudflareManualHintsLines(stage)) {
		console.error(line);
	}
}
