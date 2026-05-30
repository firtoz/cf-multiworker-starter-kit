import type { SubmitterSettledData } from "@firtoz/router-toolkit";

type AccountRouteMod = typeof import("~/routes/account");

export function accountFormErrorMessage(
	data: Extract<SubmitterSettledData<AccountRouteMod>, { success: false }>,
) {
	if (data.error.type === "handler" && typeof data.error.error === "string") {
		return data.error.error;
	}
	return "Something went wrong";
}
