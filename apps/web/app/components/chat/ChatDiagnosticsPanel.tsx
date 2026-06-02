export type ChatDiagnosticEntry = {
	id: number;
	label: string;
	atMs: number;
	deltaMs: number;
	details?: Record<string, string | number | boolean | null>;
};

type ChatDiagnosticsPanelProps = {
	entries: ChatDiagnosticEntry[];
	probeRunning: boolean;
	onRunProbe: (mode: "auth-fallback" | "attest") => void;
};

function formatMs(ms: number): string {
	return `${Math.round(ms)}ms`;
}

function formatDetails(details: ChatDiagnosticEntry["details"]): string | null {
	if (!details) {
		return null;
	}
	const parts = Object.entries(details).map(([key, value]) => `${key}=${String(value)}`);
	return parts.length > 0 ? parts.join(" ") : null;
}

export function ChatDiagnosticsPanel({
	entries,
	probeRunning,
	onRunProbe,
}: ChatDiagnosticsPanelProps) {
	const latest = entries.slice(-14).reverse();

	return (
		<section className="border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:border-sky-900 dark:bg-sky-950/35 dark:text-sky-100">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 className="font-semibold">Diagnostics</h2>
					<p className="text-sky-800 dark:text-sky-200">
						Client timing marks for mount, socket, history, presence, and echo.
					</p>
				</div>
				<button
					type="button"
					className="shrink-0 bg-sky-700 px-2.5 py-1 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-600"
					onClick={() => {
						onRunProbe("auth-fallback");
					}}
					disabled={probeRunning}
				>
					{probeRunning ? "Running" : "No attest"}
				</button>
				<button
					type="button"
					className="shrink-0 bg-emerald-700 px-2.5 py-1 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600"
					onClick={() => {
						onRunProbe("attest");
					}}
					disabled={probeRunning}
				>
					{probeRunning ? "Running" : "With attest"}
				</button>
			</div>
			<ol className="mt-2 max-h-44 space-y-1 overflow-y-auto font-mono">
				{latest.length === 0 ? (
					<li className="text-sky-700 dark:text-sky-300">Waiting for marks…</li>
				) : (
					latest.map((entry) => {
						const details = formatDetails(entry.details);
						return (
							<li key={entry.id} className="grid grid-cols-[4.5rem_4.5rem_1fr] gap-2">
								<span>{formatMs(entry.atMs)}</span>
								<span>+{formatMs(entry.deltaMs)}</span>
								<span className="min-w-0 break-words">
									{entry.label}
									{details ? (
										<span className="text-sky-700 dark:text-sky-300"> {details}</span>
									) : null}
								</span>
							</li>
						);
					})
				)}
			</ol>
		</section>
	);
}
