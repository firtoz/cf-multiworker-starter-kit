import { cn } from "~/lib/cn";

/** Message author / presence name styling by guest vs signed-in. */
export function chatAuthorNameClassName(isGuest: boolean): string {
	return cn({
		"font-medium text-gray-400 dark:text-gray-500": isGuest,
		"font-semibold text-gray-800 dark:text-gray-200": !isGuest,
	});
}
