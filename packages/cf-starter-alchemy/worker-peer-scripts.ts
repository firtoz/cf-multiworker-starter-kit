/**
 * Default Worker resource id for single-Worker DO/worker packages when omitting a custom `name:`
 * (physical name: `{alchemyApp}-{resource}-{stage}`, see {@link omitDefaultPhysicalWorkerScriptName}).
 *
 * Forks renaming Workers should mirror this literal — change **`{@link PRODUCT_PREFIX}`** once (or edit **`{@link CF_STARTER_APPS}`** indirectly).
 */
export const DEFAULT_WORKER_RESOURCE_ID = "worker" as const;

/**
 * Matches Alchemy `Scope#createPhysicalName` for a top-level `Worker(DEFAULT_WORKER_RESOURCE_ID)` —
 * equivalent to deploying that Worker without `name:`.
 *
 * Peer `WorkerRef.service` / `WorkerStub.name` must match this for the sibling’s script identity.
 *
 * @param alchemyApplicationId — same string passed to `alchemy("…")` in **that worker’s package**
 * @param stage — `${Scope.stage}` where the referencing graph runs (`app.stage` works for same-scope refs)
 */
export function omitDefaultPhysicalWorkerScriptName(
	alchemyApplicationId: string,
	stage: string,
): string {
	return `${alchemyApplicationId}-${DEFAULT_WORKER_RESOURCE_ID}-${stage}`;
}

/** ReactRouter / SSR app resource id inside the SSR Alchemy app (e.g. **`${PRODUCT_PREFIX}-frontend`**). */
export const DEFAULT_REACT_ROUTER_WEB_RESOURCE_ID = "web" as const;

/** Root D1 resource id (`packages/db`); physical name adds app id + stage. */
export const DEFAULT_D1_DATABASE_RESOURCE_ID = "db" as const;

/**
 * Leading segment for Alchemy **`await alchemy("…")`** ids — default **`cf-starter`** yields **`cf-starter-frontend`**, **`cf-starter-ping`**, etc.
 *
 * Forks set **`PRODUCT_PREFIX`** once to your slug (**`skybook`**, **`hotel`**, …) so **`CF_STARTER_APPS`** and **`--app`** scripts stay aligned ([physical names](https://alchemy.run/concepts/resource/#physical-name)).
 */
export const PRODUCT_PREFIX = "cf-starter" as const;

/**
 * Canonical Alchemy application ids for this starter. Derived from **`PRODUCT_PREFIX`** — change **`PRODUCT_PREFIX`** when you rebrand, then reconcile **`alchemy … --app …`** in each **`package.json`**.
 *
 * @see https://alchemy.run/concepts/resource/#physical-name
 */
export const CF_STARTER_APPS = {
	frontend: `${PRODUCT_PREFIX}-frontend`,
	chatroom: `${PRODUCT_PREFIX}-chatroom`,
	ping: `${PRODUCT_PREFIX}-ping`,
	other: `${PRODUCT_PREFIX}-other`,
	database: `${PRODUCT_PREFIX}-database`,
} as const;
