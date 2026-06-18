"use client";

import { ProgressProvider } from "@bprogress/next/app";
import { Toaster } from "@emach/ui/components/sonner";

/** Returns true when target and current differ only in search/hash (same pathname + origin). */
function isSameURLWithoutSearch(target: URL, current: URL): boolean {
	return (
		target.pathname === current.pathname && target.origin === current.origin
	);
}

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<ProgressProvider
			color="oklch(0.65 0.13 38)"
			delay={0}
			height="2px"
			options={{ showSpinner: false }}
			targetPreprocessor={(target) => {
				const current = new URL(window.location.href);
				// Return current URL so isSameURL suppresses the bar on search-only changes.
				return isSameURLWithoutSearch(target, current) ? current : target;
			}}
		>
			{children}
			<Toaster richColors />
		</ProgressProvider>
	);
}
