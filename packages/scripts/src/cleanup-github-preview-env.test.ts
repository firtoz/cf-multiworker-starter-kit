import { describe, expect, test } from "bun:test";
import cleanup from "../../../.github/scripts/pr-preview/cleanup-github-preview-env.cjs";

const { deploymentMatchesPr, isEnvironmentDeletePermissionError, SHARED_PREVIEW_ENVIRONMENT } =
	cleanup;

describe("cleanup-github-preview-env helpers", () => {
	test("shared preview environment name", () => {
		expect(SHARED_PREVIEW_ENVIRONMENT).toBe("preview");
	});

	test("deploymentMatchesPr by legacy environment name", () => {
		expect(deploymentMatchesPr({ environment: "preview-pr-31", id: 1 }, 31)).toBe(true);
		expect(deploymentMatchesPr({ environment: "preview-pr-30", id: 1 }, 31)).toBe(false);
	});

	test("deploymentMatchesPr by payload.pr_number", () => {
		expect(
			deploymentMatchesPr({ environment: "preview", payload: { pr_number: 31 }, id: 2 }, 31),
		).toBe(true);
		expect(
			deploymentMatchesPr(
				{ environment: "preview", payload: JSON.stringify({ pr_number: 31 }), id: 3 },
				31,
			),
		).toBe(true);
		expect(
			deploymentMatchesPr({ environment: "preview", payload: { pr_number: 9 }, id: 4 }, 31),
		).toBe(false);
	});

	test("deploymentMatchesPr by description", () => {
		expect(
			deploymentMatchesPr({ environment: "preview", description: "PR 31 preview", id: 5 }, 31),
		).toBe(true);
	});

	test("isEnvironmentDeletePermissionError recognizes GITHUB_TOKEN denial", () => {
		expect(
			isEnvironmentDeletePermissionError(
				new Error("HttpError: Resource not accessible by integration"),
			),
		).toBe(true);
		expect(isEnvironmentDeletePermissionError(new Error("HttpError: Not Found - 404"))).toBe(false);
	});
});
