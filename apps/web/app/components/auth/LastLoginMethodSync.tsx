import { useEffect } from "react";
import { commitPendingLastLoginMethod } from "~/lib/last-login-method";

/** After OAuth callback, persist the provider the user chose before redirect. */
export function LastLoginMethodSync() {
	useEffect(() => {
		commitPendingLastLoginMethod();
	}, []);
	return null;
}
