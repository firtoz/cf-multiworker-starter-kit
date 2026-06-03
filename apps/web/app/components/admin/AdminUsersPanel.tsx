import type { AdminUserRow } from "@internal/auth-db/api-schemas";
import { PROFILE_NAME_MAX_CHARS } from "@internal/auth-db/constants";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useFetcher } from "react-router";
import { LocalDateTime } from "~/components/shared/LocalDateTime";
import type { Route } from "../../routes/authed/admin/+types/users";
import { AdminUserSessionExpiryCell, formatAdminUserType } from "./admin-user-dates";

type AdminUsersPanelProps = {
	users: AdminUserRow[];
	currentUserId: string;
	guestRetentionDays: number;
	page: number;
	pageSize: number;
	total: number;
	hasMore: boolean;
	actionError?: string | undefined;
};

function buildBulkFormData(intent: string, userIds: Iterable<string>): FormData {
	const form = new FormData();
	form.set("intent", intent);
	for (const id of userIds) {
		form.append("userIds", id);
	}
	return form;
}

export function AdminUsersPanel({
	users,
	currentUserId,
	guestRetentionDays,
	page,
	pageSize,
	total,
	hasMore,
	actionError,
}: AdminUsersPanelProps) {
	const fetcher = useFetcher<Route.ComponentProps["actionData"]>();
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const selectAllRef = useRef<HTMLInputElement>(null);

	const selectableUsers = useMemo(
		() => users.filter((u) => u.id !== currentUserId),
		[users, currentUserId],
	);
	const selectableIds = useMemo(() => selectableUsers.map((u) => u.id), [selectableUsers]);

	const adminCount = useMemo(() => users.filter((u) => u.role === "admin").length, [users]);
	const canDemoteAdmins = adminCount > 1;

	const selectedCount = selected.size;
	const selectedAdminCount = useMemo(
		() => users.filter((u) => selected.has(u.id) && u.role === "admin").length,
		[users, selected],
	);
	const bulkDemoteDisabled = !canDemoteAdmins || selectedAdminCount >= adminCount;
	const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));
	const someSelected = selectableIds.some((id) => selected.has(id));

	useEffect(() => {
		const el = selectAllRef.current;
		if (el) {
			el.indeterminate = someSelected && !allSelected;
		}
	}, [someSelected, allSelected]);

	useEffect(() => {
		if (fetcher.data?.success) {
			setSelected(new Set());
		}
	}, [fetcher.data]);

	const toggleOne = useCallback((userId: string, checked: boolean) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) {
				next.add(userId);
			} else {
				next.delete(userId);
			}
			return next;
		});
	}, []);

	const toggleAll = useCallback(() => {
		setSelected((prev) => {
			if (selectableIds.every((id) => prev.has(id))) {
				return new Set();
			}
			return new Set(selectableIds);
		});
	}, [selectableIds]);

	const submitBulk = useCallback(
		(intent: "bulkDelete" | "bulkPromote" | "bulkDemote", confirmMessage: string) => {
			if (selectedCount === 0) {
				return;
			}
			if (!confirm(confirmMessage)) {
				return;
			}
			fetcher.submit(buildBulkFormData(intent, selected), { method: "post" });
		},
		[fetcher, selected, selectedCount],
	);

	const bulkBusy = fetcher.state !== "idle";
	const bulkError = fetcher.data && !fetcher.data.success ? fetcher.data.error : undefined;
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const rangeEnd = Math.min(page * pageSize, total);
	const paginationSearch = useMemo(() => {
		const params = new URLSearchParams();
		if (pageSize !== 50) {
			params.set("pageSize", String(pageSize));
		}
		return params;
	}, [pageSize]);

	return (
		<div className="w-full min-w-0">
			<h2 className="text-lg font-semibold mb-2">Users</h2>
			<p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
				Last seen uses the latest session activity (refreshed on visit). Guest accounts use a{" "}
				{guestRetentionDays}-day sliding session — expiry extends when they open chat; after{" "}
				{guestRetentionDays} days idle the session and guest identity are dropped.
			</p>
			{total > 0 ? (
				<p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
					Showing {rangeStart}–{rangeEnd} of {total} users (page {page} of {pageCount}).
				</p>
			) : null}
			{actionError ? <p className="text-sm text-red-600 mb-4">{actionError}</p> : null}
			{bulkError ? <p className="text-sm text-red-600 mb-4">{bulkError}</p> : null}
			{selectedCount > 0 ? (
				<div className="flex flex-wrap items-center gap-3 mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-3 py-2">
					<span className="text-sm text-gray-700 dark:text-gray-300">{selectedCount} selected</span>
					<button
						type="button"
						className="text-xs underline disabled:opacity-50"
						disabled={bulkBusy}
						onClick={() => submitBulk("bulkPromote", `Promote ${selectedCount} user(s) to admin?`)}
					>
						Promote to admin
					</button>
					<button
						type="button"
						className="text-xs underline disabled:opacity-50"
						disabled={bulkBusy || bulkDemoteDisabled}
						title={
							bulkDemoteDisabled
								? canDemoteAdmins
									? "Cannot demote every admin"
									: "At least one admin is required"
								: undefined
						}
						onClick={() =>
							submitBulk("bulkDemote", `Demote ${selectedCount} user(s) to regular user?`)
						}
					>
						Demote to user
					</button>
					<button
						type="button"
						className="text-xs underline text-red-600 dark:text-red-400 disabled:opacity-50"
						disabled={bulkBusy}
						onClick={() =>
							submitBulk(
								"bulkDelete",
								`Delete ${selectedCount} user(s)? Their sessions will be revoked. This cannot be undone.`,
							)
						}
					>
						Delete selected
					</button>
					<button
						type="button"
						className="text-xs text-gray-500 underline ml-auto"
						disabled={bulkBusy}
						onClick={() => setSelected(new Set())}
					>
						Clear selection
					</button>
				</div>
			) : null}
			<div className="w-full min-w-0 overflow-x-auto">
				<table className="w-full text-sm border-collapse table-auto">
					<thead>
						<tr className="text-left border-b border-gray-200 dark:border-gray-700">
							<th className="py-2 pr-2 w-8">
								<input
									ref={selectAllRef}
									type="checkbox"
									className="rounded"
									checked={allSelected}
									disabled={selectableIds.length === 0 || bulkBusy}
									aria-label="Select all users except yourself"
									onChange={toggleAll}
								/>
							</th>
							<th className="py-2 pr-4">Name</th>
							<th className="py-2 pr-4">Email</th>
							<th className="py-2 pr-3">Type</th>
							<th className="py-2 pr-3 whitespace-nowrap">Created</th>
							<th className="py-2 pr-3 whitespace-nowrap">Last seen</th>
							<th className="py-2 pr-3 whitespace-nowrap">Session expires</th>
							<th className="py-2">Actions</th>
						</tr>
					</thead>
					<tbody>
						{users.map((u) => {
							const isSelf = u.id === currentUserId;
							const isGuest = u.isAnonymous === true;
							const checked = selected.has(u.id);
							const rowLabel = isGuest ? u.name : u.email;
							return (
								<tr
									key={u.id}
									className={`border-b border-gray-100 dark:border-gray-800 ${checked ? "bg-gray-50/80 dark:bg-gray-900/40" : ""}`}
								>
									<td className="py-2 pr-2 align-top">
										{isSelf ? (
											<span
												className="inline-block w-4 text-center text-gray-400"
												title="You cannot select your own account"
												aria-hidden
											>
												—
											</span>
										) : (
											<input
												type="checkbox"
												className="rounded"
												checked={checked}
												disabled={bulkBusy}
												aria-label={`Select ${rowLabel}`}
												onChange={(event) => toggleOne(u.id, event.target.checked)}
											/>
										)}
									</td>
									<td className="py-2 pr-4 align-top min-w-[12rem]">
										<form method="post" className="flex flex-wrap items-center gap-2">
											<input type="hidden" name="intent" value="saveName" />
											<input type="hidden" name="userId" value={u.id} />
											<input
												className="flex-1 min-w-40 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm dark:bg-gray-900"
												name="name"
												defaultValue={u.name}
												maxLength={PROFILE_NAME_MAX_CHARS}
												required
												aria-label={`Display name for ${rowLabel}`}
											/>
											<button type="submit" className="text-xs underline shrink-0">
												Save
											</button>
										</form>
									</td>
									<td className="py-2 pr-4 font-mono text-xs align-top min-w-40">
										{isGuest ? (
											<span className="text-gray-400" title="Synthetic guest address hidden">
												—
											</span>
										) : (
											u.email
										)}
									</td>
									<td className="py-2 pr-3 align-top whitespace-nowrap">
										<span
											className={
												u.isAnonymous === true ? "text-amber-700 dark:text-amber-400" : undefined
											}
										>
											{formatAdminUserType(u)}
										</span>
									</td>
									<td className="py-2 pr-3 align-top whitespace-nowrap text-xs text-gray-700 dark:text-gray-300">
										<LocalDateTime value={u.createdAt} />
									</td>
									<td className="py-2 pr-3 align-top whitespace-nowrap text-xs text-gray-700 dark:text-gray-300">
										{u.lastSeenAt ? (
											<LocalDateTime value={u.lastSeenAt} />
										) : (
											<span className="text-gray-500">Never</span>
										)}
									</td>
									<td className="py-2 pr-3 align-top text-xs">
										<AdminUserSessionExpiryCell user={u} guestRetentionDays={guestRetentionDays} />
									</td>
									<td className="py-2 align-top">
										<div className="flex flex-col gap-1 items-start">
											{u.role === "admin" ? (
												canDemoteAdmins ? (
													<form method="post" className="inline">
														<input type="hidden" name="userId" value={u.id} />
														<input type="hidden" name="role" value="user" />
														<button type="submit" className="text-xs underline">
															Demote to user
														</button>
													</form>
												) : (
													<span
														className="text-xs text-gray-500"
														title="At least one admin is required"
													>
														Last admin
													</span>
												)
											) : (
												<form method="post" className="inline">
													<input type="hidden" name="userId" value={u.id} />
													<input type="hidden" name="role" value="admin" />
													<button type="submit" className="text-xs underline">
														Promote to admin
													</button>
												</form>
											)}
											{isSelf ? null : (
												<form
													method="post"
													className="inline"
													onSubmit={(event) => {
														if (
															!confirm(
																`Delete ${rowLabel}? Their sessions will be revoked. This cannot be undone.`,
															)
														) {
															event.preventDefault();
														}
													}}
												>
													<input type="hidden" name="intent" value="deleteUser" />
													<input type="hidden" name="userId" value={u.id} />
													<button
														type="submit"
														className="text-xs underline text-red-600 dark:text-red-400"
													>
														Delete
													</button>
												</form>
											)}
										</div>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{pageCount > 1 ? (
				<div className="flex flex-wrap items-center gap-3 mt-4">
					{page > 1 ? (
						<Link
							to={`?${new URLSearchParams({ ...Object.fromEntries(paginationSearch), page: String(page - 1) }).toString()}`}
							className="text-sm underline"
						>
							Previous
						</Link>
					) : (
						<span className="text-sm text-gray-400">Previous</span>
					)}
					{hasMore ? (
						<Link
							to={`?${new URLSearchParams({ ...Object.fromEntries(paginationSearch), page: String(page + 1) }).toString()}`}
							className="text-sm underline"
						>
							Next
						</Link>
					) : (
						<span className="text-sm text-gray-400">Next</span>
					)}
				</div>
			) : null}
		</div>
	);
}
