import getPort from "get-port";

export type PickListenPortOptions = {
	preferred: number;
	/** Match dev bind host (Portless uses `127.0.0.1`). @default "127.0.0.1" */
	host?: string;
};

/** Preferred port if free on `host`, otherwise an available port (via [`get-port`](https://github.com/sindresorhus/get-port)). */
export function pickListenPort(options: PickListenPortOptions): Promise<number> {
	return getPort({
		port: options.preferred,
		host: options.host ?? "127.0.0.1",
	});
}
