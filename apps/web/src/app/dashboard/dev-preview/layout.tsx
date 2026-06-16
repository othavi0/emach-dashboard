import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const metadata: Metadata = {
	description:
		"Preview técnico interno de padrões de entidade do dashboard Emach.",
	robots: {
		follow: false,
		index: false,
	},
	title: "Preview técnico",
};

export default function DevLayout({ children }: { children: ReactNode }) {
	if (process.env.NODE_ENV === "production") {
		notFound();
	}
	return children;
}
