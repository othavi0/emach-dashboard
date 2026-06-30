"use client";

import { cn } from "@emach/ui/lib/utils";
import type { Variants } from "motion/react";
import { MotionConfig, motion } from "motion/react";
import type { ReactNode } from "react";

const container: Variants = {
	hidden: {},
	show: { transition: { staggerChildren: 0.05 } },
};
const item: Variants = {
	hidden: { opacity: 0, y: 8 },
	show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};

export function StaggerGrid({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<MotionConfig reducedMotion="user">
			<motion.div
				animate="show"
				className={cn(className)}
				initial="hidden"
				variants={container}
			>
				{children}
			</motion.div>
		</MotionConfig>
	);
}

export function StaggerItem({ children }: { children: ReactNode }) {
	return <motion.div variants={item}>{children}</motion.div>;
}
