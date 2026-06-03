import type { D1DatabaseProps } from "alchemy/cloudflare";

/**
 * Primary D1 region for new databases — aligns with Workers smart placement in WEUR (e.g. LHR).
 *
 * Existing databases keep their primary region; this only applies at creation time.
 *
 * @see https://developers.cloudflare.com/d1/configuration/data-location/
 */
export const DEFAULT_D1_PRIMARY_LOCATION_HINT = "weur" as const;

/**
 * Shared D1 deploy options: WEUR primary for new DBs + read replicas for lower read latency
 * when replication is enabled on the account/database.
 *
 * @see https://developers.cloudflare.com/d1/best-practices/read-replication/
 */
export const defaultD1DeployOptions: Pick<
	D1DatabaseProps,
	"primaryLocationHint" | "readReplication"
> = {
	primaryLocationHint: DEFAULT_D1_PRIMARY_LOCATION_HINT,
	readReplication: { mode: "auto" },
};
