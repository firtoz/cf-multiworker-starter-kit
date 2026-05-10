#!/usr/bin/env bash
# Appends **posthog-sourcemaps-summary.md** to **`GITHUB_STEP_SUMMARY`** (must match **`CI_POSTHOG_SOURCEMAPS_SUMMARY_RELPATH`** in **`packages/alchemy-utils/src/ci-deploy-web-url.ts`**).
set -euo pipefail

readonly root="${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is not set}"
readonly rel=".alchemy/ci/posthog-sourcemaps-summary.md"
readonly file="$root/$rel"
readonly out="${GITHUB_STEP_SUMMARY:?GITHUB_STEP_SUMMARY is not set}"

if [[ -f "$file" ]]; then
	cat "$file" >>"$out"
	echo "" >>"$out"
else
	{
		echo "### PostHog source maps"
		echo ""
		echo "_No \`$rel\` artifact — Turbo deploy may have been skipped or this job did not run Alchemy with \`GITHUB_WORKSPACE\`._"
		echo ""
	} >>"$out"
fi
