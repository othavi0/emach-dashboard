"use client";

import {
	animate,
	motion,
	useMotionValue,
	useReducedMotion,
	useTransform,
} from "motion/react";
import { useEffect } from "react";

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
	const reduce = useReducedMotion();
	const mv = useMotionValue(0);
	const display = useTransform(mv, (n) => FORMATTERS[format](n));

	useEffect(() => {
		if (reduce) {
			mv.set(value);
			return;
		}
		const controls = animate(mv, value, { duration: 0.6, ease: "easeOut" });
		return () => controls.stop();
	}, [value, reduce, mv]);

	return <motion.span>{display}</motion.span>;
}
