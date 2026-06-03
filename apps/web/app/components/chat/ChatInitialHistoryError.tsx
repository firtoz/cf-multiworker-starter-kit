import { useEffect } from "react";

type ChatInitialHistoryErrorProps = {
	onError: () => void;
};

export function ChatInitialHistoryError({ onError }: ChatInitialHistoryErrorProps) {
	useEffect(() => {
		onError();
	}, [onError]);
	return (
		<li className="text-sm text-red-700 dark:text-red-300">Could not load message history.</li>
	);
}
