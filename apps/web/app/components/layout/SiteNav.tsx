import { type AuthUser, accountDisplayName, isAdminUser } from "@internal/auth-client";
import { href, Link } from "react-router";
import { LogoutForm } from "~/components/auth/LogoutForm";

type SiteNavProps = {
	user: AuthUser | null;
};

export function SiteNav({ user }: SiteNavProps) {
	return (
		<nav className="container mx-auto shrink-0 px-4 sm:px-6 py-3 flex flex-wrap items-center gap-4 text-sm border-b border-gray-200 dark:border-gray-800">
			<Link to={href("/")} discover="none" prefetch="intent" className="font-semibold">
				Home
			</Link>
			{user ? (
				<>
					{user.isAnonymous === true ? (
						<Link to={href("/guest/upgrade")} discover="none" prefetch="intent">
							Create account
						</Link>
					) : (
						<Link to={href("/account")} discover="none" prefetch="intent">
							Account
						</Link>
					)}
					<Link to={href("/chat")} discover="none" prefetch="intent">
						Chat
					</Link>
					{isAdminUser(user) ? (
						<Link to={href("/admin/origins")} discover="none" prefetch="intent">
							Admin
						</Link>
					) : null}
					<span className="text-gray-500 ml-auto flex flex-wrap items-center gap-3">
						{user.isAnonymous === true ? (accountDisplayName(user) ?? "Guest") : user.email}
						<LogoutForm />
					</span>
				</>
			) : (
				<Link to={href("/login")} discover="none" prefetch="intent" className="ml-auto">
					Sign in
				</Link>
			)}
		</nav>
	);
}
