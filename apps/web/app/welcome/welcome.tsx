import { Suspense } from "react";
import { Await } from "react-router";
import cloudflareWorkersSrc from "~/assets/cloudflare-workers.svg?url";
import durableObjectsSrc from "~/assets/durable-objects.svg?url";
import reactRouterSrc from "~/assets/react-router.svg?url";
import turborepoSrc from "~/assets/turborepo.svg?url";
import zodLogoIcon from "~/assets/zod-logo.png?width=18&as=metadata";
import { cn } from "~/lib/cn";
import alchemyProfileSrc from "./alchemy-profile.jpg?url";

// Icon styling constants
const ICON_CONTAINER_SIZE = 40; // 40px container
const DEFAULT_ICON_WIDTH = 24;

const iconContainerClassName = cn(
	"rounded-xl bg-gray-100/50 dark:bg-gray-800/50",
	"group-hover:bg-gray-200/70 dark:group-hover:bg-gray-700/70",
	"transition-colors",
	"flex items-center justify-center",
);

/** Natural dimensions for aspect ratio; SVGs use `?url` so SSR and client share the same hashed asset (no Sharp raster mismatch). */
type IconDims = { src: string; width: number; height: number };

type ResourceInfo = {
	href: string;
	text: string;
	icon: IconDims | { light: IconDims; dark: IconDims };
	iconWidth?: number;
	/** Extra classes on `<img>` (e.g. `rounded-full` for square avatars). */
	iconImgClassName?: string;
};

// Resource icon component with consistent styling
function ResourceIcon({ info }: { info: ResourceInfo }) {
	const iconData = "light" in info.icon ? info.icon.light : info.icon;
	const darkIconData = "dark" in info.icon ? info.icon.dark : null;

	// Use custom width or default, then calculate height based on aspect ratio
	const displayWidth = info.iconWidth ?? DEFAULT_ICON_WIDTH;
	const aspectRatio = iconData.height / iconData.width;
	const displayHeight = Math.round(displayWidth * aspectRatio);

	return (
		<li key={info.href}>
			<a
				className="group flex items-center gap-3 self-stretch p-3 leading-normal text-sm sm:text-base text-blue-700 hover:underline dark:text-blue-500 min-w-0"
				href={info.href}
				target="_blank"
				rel="noreferrer"
			>
				<div
					className={cn(iconContainerClassName, "shrink-0")}
					style={{ width: ICON_CONTAINER_SIZE, height: ICON_CONTAINER_SIZE }}
				>
					<img
						src={iconData.src}
						alt={`${info.text} Documentation`}
						width={displayWidth}
						height={displayHeight}
						className={cn(info.iconImgClassName, darkIconData ? "dark:hidden" : undefined)}
					/>
					{darkIconData && (
						<img
							src={darkIconData.src}
							alt={`${info.text} Documentation`}
							width={displayWidth}
							height={displayHeight}
							className={cn("hidden dark:block", info.iconImgClassName)}
						/>
					)}
				</div>
				<span className="wrap-break-word hyphens-auto">{info.text}</span>
			</a>
		</li>
	);
}

export function Welcome({ doResponsePromise }: { doResponsePromise?: Promise<string> }) {
	return (
		<main className="flex items-center justify-center pt-8 sm:pt-12 lg:pt-16 pb-4 px-4">
			<div className="flex-1 flex flex-col items-center gap-8 sm:gap-12 lg:gap-16 min-h-0 max-w-full">
				<header className="flex flex-col items-center gap-6 sm:gap-9 w-full">
					<div className="w-full max-w-[500px]">
						<h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-center text-blue-600 dark:text-blue-400">
							TESTING TESTING
						</h1>
					</div>
				</header>
				<div className="w-full max-w-[600px] space-y-4 sm:space-y-6">
					<nav className="rounded-2xl sm:rounded-3xl border border-gray-200 p-4 sm:p-6 dark:border-gray-700 space-y-3 sm:space-y-4 min-w-0">
						<p className="text-sm sm:text-base leading-6 text-gray-700 dark:text-gray-200 text-center">
							Welcome to your new application!
						</p>
						<div className="bg-blue-50 dark:bg-blue-900 p-3 sm:p-4 rounded-lg">
							<p className="text-sm sm:text-base text-blue-800 dark:text-blue-200">
								This is a starter kit for Cloudflare multi-worker applications. It includes a web
								app with React and a Durable Object.
							</p>
						</div>
						<ul className="space-y-2">
							{resources.map((item) => (
								<ResourceIcon key={item.href} info={item} />
							))}
							{doResponsePromise && (
								<Suspense
									fallback={
										<li className="self-stretch p-3 leading-normal bg-gray-50 dark:bg-gray-800 rounded-lg mt-4">
											<div className="animate-pulse">
												<span className="text-sm sm:text-base font-semibold">
													Durable Object Response:
												</span>
												<div className="mt-2 p-3 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 h-20" />
											</div>
										</li>
									}
								>
									<Await resolve={doResponsePromise}>
										{(doResponse) => (
											<li className="self-stretch p-3 leading-normal bg-gray-50 dark:bg-gray-800 rounded-lg mt-4">
												<div className="min-w-0">
													<span className="text-sm sm:text-base font-semibold">
														Durable Object Response:
													</span>
													<pre className="mt-2 p-3 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-gray-700 font-mono text-xs sm:text-sm overflow-x-auto whitespace-pre-wrap">
														{doResponse}
													</pre>
												</div>
											</li>
										)}
									</Await>
								</Suspense>
							)}
						</ul>
					</nav>
				</div>
			</div>
		</main>
	);
}

const resources: ResourceInfo[] = [
	// Cloudflare Resources
	{
		href: "https://developers.cloudflare.com/workers/",
		text: "Cloudflare Workers",
		icon: { src: cloudflareWorkersSrc, width: 48, height: 49 },
	},
	{
		href: "https://developers.cloudflare.com/durable-objects/",
		text: "Durable Objects",
		icon: { src: durableObjectsSrc, width: 64, height: 64 },
	},
	// Framework & Libraries
	{
		href: "https://reactrouter.com/",
		text: "React Router",
		icon: { src: reactRouterSrc, width: 256, height: 140 },
		iconWidth: 44,
	},
	// Deployment & Infrastructure
	{
		href: "https://alchemy.run/",
		text: "Alchemy",
		icon: { src: alchemyProfileSrc, width: 400, height: 400 },
		iconWidth: 36,
		iconImgClassName: "rounded-full object-cover",
	},
	// Monorepo Tools
	{
		href: "https://turborepo.com/",
		text: "Turborepo",
		icon: { src: turborepoSrc, width: 256, height: 318 },
		iconWidth: 18,
	},
	{
		href: "https://zod.dev/",
		text: "Zod",
		icon: { src: zodLogoIcon.src, width: zodLogoIcon.width, height: zodLogoIcon.height },
		iconWidth: 18,
	},
];
