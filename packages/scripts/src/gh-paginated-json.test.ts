import { describe, expect, test } from "bun:test";
import {
	deploymentIdsFromGhPages,
	environmentNamesFromGhPages,
	parseGhPaginatedJson,
} from "./gh-paginated-json";

describe("parseGhPaginatedJson", () => {
	test("wraps a single JSON array as one page (deployments)", () => {
		const pages = parseGhPaginatedJson(JSON.stringify([{ id: 1 }, { id: 2 }]));
		expect(pages).toHaveLength(1);
		expect(deploymentIdsFromGhPages(pages)).toEqual(["1", "2"]);
	});

	test("wraps a single environments object as one page", () => {
		const pages = parseGhPaginatedJson(
			JSON.stringify({ environments: [{ name: "preview-pr-3" }, { name: "staging" }] }),
		);
		expect(pages).toHaveLength(1);
		const { names, complete } = environmentNamesFromGhPages(pages);
		expect(complete).toBe(true);
		expect(names).toEqual(["preview-pr-3", "staging"]);
	});

	test("parses NDJSON multi-page environments", () => {
		const raw = `${JSON.stringify({ environments: [{ name: "preview-pr-1" }] })}\n${JSON.stringify({ environments: [{ name: "preview-pr-2" }] })}`;
		const pages = parseGhPaginatedJson(raw);
		expect(pages).toHaveLength(2);
		const { names, complete } = environmentNamesFromGhPages(pages);
		expect(complete).toBe(true);
		expect(names).toEqual(["preview-pr-1", "preview-pr-2"]);
	});

	test("empty stdout ⇒ no pages", () => {
		expect(parseGhPaginatedJson("")).toEqual([]);
		expect(parseGhPaginatedJson("   ")).toEqual([]);
	});

	test("environments page missing key ⇒ incomplete", () => {
		const { complete } = environmentNamesFromGhPages([{ total_count: 0 }]);
		expect(complete).toBe(false);
	});
});
