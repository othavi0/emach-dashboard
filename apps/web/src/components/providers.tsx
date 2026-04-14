"use client";

import { Toaster } from "@emach/ui/components/sonner";
import { ThemeProvider } from "next-themes";

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="dark"
			disableTransitionOnChange
			enableSystem={false}
			forcedTheme="dark"
		>
			{children}
			<Toaster richColors />
		</ThemeProvider>
	);
}
