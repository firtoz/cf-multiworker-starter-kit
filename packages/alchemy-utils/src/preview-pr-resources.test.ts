import { describe, expect, test } from "bun:test";
import {
	isCatalogPreviewResource,
	isPreviewD1Name,
	isPreviewDoNamespace,
	isPreviewKvTitle,
	isPreviewR2Name,
	isPreviewWorkerName,
	PREVIEW_D1_BASE_NAMES,
	PREVIEW_KV_BASE_NAMES,
	PREVIEW_WORKER_BASE_NAMES,
	parsePrNumberFromPhysicalName,
	resolveCleanupExcludePrs,
} from "./preview-pr-resources";
import { PRODUCT_PREFIX } from "./worker-peer-scripts";

describe("parsePrNumberFromPhysicalName", () => {
	test("reads trailing -pr-<n>", () => {
		expect(parsePrNumberFromPhysicalName("starter-frontend-web-pr-31")).toBe(31);
		expect(parsePrNumberFromPhysicalName("starter-auth-auth-kv-pr-2")).toBe(2);
	});

	test("rejects non-pr stages", () => {
		expect(parsePrNumberFromPhysicalName("starter-frontend-web-staging")).toBeUndefined();
		expect(parsePrNumberFromPhysicalName("starter-frontend-web-prod")).toBeUndefined();
		// GitHub env names also end in -pr-<n>; catalog matchers still reject them.
		expect(parsePrNumberFromPhysicalName("preview-pr-31")).toBe(31);
		expect(isPreviewWorkerName("preview-pr-31")).toBe(false);
	});
});

describe("exact catalog matching", () => {
	test("accepts known worker / d1 / kv physical names", () => {
		expect(isPreviewWorkerName(`${PREVIEW_WORKER_BASE_NAMES[0]}-pr-31`)).toBe(true);
		expect(isPreviewWorkerName(`${PREVIEW_WORKER_BASE_NAMES[1]}-pr-1`)).toBe(true);
		expect(isPreviewD1Name(`${PREVIEW_D1_BASE_NAMES[0]}-pr-22`)).toBe(true);
		expect(isPreviewKvTitle(`${PREVIEW_KV_BASE_NAMES[0]}-pr-9`)).toBe(true);
	});

	test("rejects sibling-prefix products (starter-kit vs starter)", () => {
		expect(PRODUCT_PREFIX).toBe("starter");
		expect(isPreviewWorkerName("starter-kit-frontend-web-pr-9")).toBe(false);
		expect(
			isCatalogPreviewResource("starter-kit-frontend-web-pr-9", PREVIEW_WORKER_BASE_NAMES),
		).toBe(false);
		expect(isPreviewD1Name("starter-kit-database-main-db-pr-1")).toBe(false);
	});

	test("rejects staging/prod and unknown resource ids", () => {
		expect(isPreviewWorkerName("starter-frontend-web-staging")).toBe(false);
		expect(isPreviewWorkerName("starter-frontend-web-prod")).toBe(false);
		expect(isPreviewWorkerName("starter-frontend-api-pr-1")).toBe(false);
		expect(isPreviewWorkerName("other-frontend-web-pr-1")).toBe(false);
	});

	test("R2 catalog empty ⇒ never matches", () => {
		expect(isPreviewR2Name("starter-frontend-assets-pr-1")).toBe(false);
	});
});

describe("isPreviewDoNamespace", () => {
	test("matches by script (preferred) or name when script is a preview worker", () => {
		const script = `${PREVIEW_WORKER_BASE_NAMES[2]}-pr-14`;
		expect(isPreviewDoNamespace({ id: "uuid", script, class: "ChatroomDo" })).toBe(true);
		expect(isPreviewDoNamespace({ id: "uuid", name: script })).toBe(true);
		expect(isPreviewDoNamespace({ id: "uuid", script: "starter-kit-chatroom-worker-pr-14" })).toBe(
			false,
		);
		expect(isPreviewDoNamespace({ id: "uuid", name: "ChatroomDo" })).toBe(false);
	});
});

describe("resolveCleanupExcludePrs", () => {
	test("auto-merges open PRs unless includeOpen", () => {
		const manual = new Set([7]);
		const open = new Set([31, 22]);
		expect(
			[
				...resolveCleanupExcludePrs({
					manualExclude: manual,
					openPrNumbers: open,
					includeOpen: false,
				}),
			].sort((a, b) => a - b),
		).toEqual([7, 22, 31]);
		expect(
			[
				...resolveCleanupExcludePrs({
					manualExclude: manual,
					openPrNumbers: open,
					includeOpen: true,
				}),
			].sort((a, b) => a - b),
		).toEqual([7]);
	});
});
