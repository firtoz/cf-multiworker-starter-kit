/**
 * Normalize **`@octokit/request`** / **`HttpError`** shapes for **`console.warn`** logging.
 */

export type OctokitHttpErrorDetails = {
	readonly httpStatus?: number;
	readonly message: string;
};

export function octokitHttpErrorDetails(error: unknown): OctokitHttpErrorDetails {
	const e = error as {
		message?: string;
		status?: number;
		response?: { data?: { message?: string | string[] } };
	};
	const data = e.response?.data?.message;
	let message: string;
	if (typeof data === "string") {
		message = data;
	} else if (Array.isArray(data) && data.length > 0 && typeof data[0] === "string") {
		message = data.join(" ");
	} else if (typeof e.message === "string" && e.message.length > 0) {
		message = e.message;
	} else {
		message = "Unknown error";
	}
	const httpStatus = typeof e.status === "number" ? e.status : undefined;
	return httpStatus === undefined ? { message } : { httpStatus, message };
}
