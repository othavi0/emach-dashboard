"use client";

import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Wrapper Sonner alinhado ao DESIGN.md (warm-dark, AAA).
 *
 * - `theme="dark"` é fixo: o app é dark-only (`<html className="dark">` em
 *   apps/web/src/app/layout.tsx); não há ThemeProvider de next-themes.
 *   Sem isso, Sonner cai em `system` e renderiza paleta clara.
 * - As CSS vars `--*-bg/--*-text/--*-border` ativadas por `richColors` são
 *   sobrescritas em globals.css (bloco "Sonner toast overrides"), mapeadas
 *   para `--success/--warning/--info/--destructive` e seus `*-foreground`.
 *   Aqui só mantemos os fallbacks neutros (`--normal-*`) e o radius.
 */
const Toaster = (props: ToasterProps) => (
	<Sonner
		className="toaster group"
		icons={{
			success: <CircleCheckIcon className="size-4" />,
			info: <InfoIcon className="size-4" />,
			warning: <TriangleAlertIcon className="size-4" />,
			error: <OctagonXIcon className="size-4" />,
			loading: <Loader2Icon className="size-4 animate-spin" />,
		}}
		style={
			{
				"--normal-bg": "var(--popover)",
				"--normal-text": "var(--popover-foreground)",
				"--normal-border": "var(--border)",
				"--border-radius": "var(--radius)",
			} as React.CSSProperties
		}
		theme="dark"
		toastOptions={{
			classNames: {
				toast: "cn-toast",
			},
		}}
		{...props}
	/>
);

export { Toaster };
