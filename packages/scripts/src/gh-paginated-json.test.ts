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

	test("parses --slurp array of environment pages", () => {
		const raw = JSON.stringify([
			{ environments: [{ name: "preview-pr-1" }] },
			{ environments: [{ name: "preview-pr-2" }] },
		]);
		const pages = parseGhPaginatedJson(raw);
		expect(pages).toHaveLength(2);
		const { names, complete } = environmentNamesFromGhPages(pages);
		expect(complete).toBe(true);
		expect(names).toEqual(["preview-pr-1", "preview-pr-2"]);
	});

	test("parses --slurp array of deployment pages", () => {
		const raw = JSON.stringify([[{ id: 10 }], [{ id: 11 }, { id: 12 }]]);
		const pages = parseGhPaginatedJson(raw);
		expect(pages).toHaveLength(2);
		expect(deploymentIdsFromGhPages(pages)).toEqual(["10", "11", "12"]);
	});

	test("parses concatenated object pages without newlines (}{)", () => {
		const raw = `${JSON.stringify({ environments: [{ name: "preview-pr-1" }] })}${JSON.stringify({ environments: [{ name: "preview-pr-2" }] })}`;
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

	test("empty JSON array is one empty page", () => {
		expect(parseGhPaginatedJson("[]")).toEqual([[]]);
		expect(deploymentIdsFromGhPages(parseGhPaginatedJson("[]"))).toEqual([]);
	});

	test("deployments parse failure yields no ids (caller must fail closed)", () => {
		expect(parseGhPaginatedJson("{not-json")).toEqual([]);
		expect(deploymentIdsFromGhPages([])).toEqual([]);
	});
});
