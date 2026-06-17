"use client";

import { useEffect, useState } from "react";

export type NumberFormat = "currency" | "number";

const FORMATTERS: Record<NumberFormat, (n: number) => string> = {
	currency: (n) =>
		n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
	number: (n) => Math.round(n).toLocaleString("pt-BR"),
};

export function NumberTicker({
	value,
	format = "number",
}: {
	value: number;
	format?: NumberFormat;
}) {
	const [display, setDisplay] = useState(0);

	useEffect(() => {
		const reduce = window.matchMedia(
			"(prefers-reduced-motion: reduce)"
		).matches;
		if (reduce) {
			setDisplay(value);
			return;
		}
		const start = performance.now();
		const duration = 600;
		let raf = 0;
		const tick = (now: number) => {
			const t = Math.min(1, (now - start) / duration);
			const eased = 1 - (1 - t) ** 3; // easeOutCubic
			setDisplay(value * eased);
			if (t < 1) {
				raf = requestAnimationFrame(tick);
			}
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [value]);

	return <span>{FORMATTERS[format](display)}</span>;
}
