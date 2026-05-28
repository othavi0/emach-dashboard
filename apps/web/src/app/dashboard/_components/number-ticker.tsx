"use client";

import {
	animate,
	motion,
	useMotionValue,
	useReducedMotion,
	useTransform,
} from "motion/react";
import { useEffect } from "react";

export function NumberTicker({
	value,
	format,
}: {
	value: number;
	format?: (n: number) => string;
}) {
	const reduce = useReducedMotion();
	const mv = useMotionValue(0);
	const display = useTransform(mv, (n) =>
		format ? format(n) : Math.round(n).toLocaleString("pt-BR")
	);

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
