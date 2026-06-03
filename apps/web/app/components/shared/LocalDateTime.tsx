import { useEffect, useMemo, useState } from "react";

type LocalDateTimeValue = Date | number | string | null | undefined;

type LocalDateTimeProps = {
	value: LocalDateTimeValue;
	options?: Intl.DateTimeFormatOptions | undefined;
	className?: string | undefined;
	fallback?: string | undefined;
};

const DEFAULT_DATE_TIME_OPTIONS = {
	dateStyle: "medium",
	timeStyle: "short",
} satisfies Intl.DateTimeFormatOptions;

const HYDRATION_LOCALE = "en-GB";
const HYDRATION_TIME_ZONE = "UTC";

function toDate(value: LocalDateTimeValue): Date | null {
	if (value == null) {
		return null;
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(
	date: Date,
	options: Intl.DateTimeFormatOptions,
	locale?: string,
	timeZone?: string,
) {
	return new Intl.DateTimeFormat(locale, {
		...options,
		...(timeZone === undefined ? {} : { timeZone }),
	}).format(date);
}

export function LocalDateTime({
	value,
	options = DEFAULT_DATE_TIME_OPTIONS,
	className,
	fallback = "—",
}: LocalDateTimeProps) {
	const date = useMemo(() => toDate(value), [value]);
	const hydrationLabel = useMemo(() => {
		if (!date) {
			return fallback;
		}
		return formatDateTime(date, options, HYDRATION_LOCALE, HYDRATION_TIME_ZONE);
	}, [date, fallback, options]);
	const [label, setLabel] = useState(hydrationLabel);

	useEffect(() => {
		if (!date) {
			setLabel(fallback);
			return;
		}
		setLabel(formatDateTime(date, options));
	}, [date, fallback, options]);

	if (!date) {
		return <span className={className}>{label}</span>;
	}

	return (
		<time dateTime={date.toISOString()} className={className} suppressHydrationWarning>
			{label}
		</time>
	);
}
