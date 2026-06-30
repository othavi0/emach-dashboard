"use client";

import { cn } from "@emach/ui/lib/utils";
import type { HTMLMotionProps, Variants } from "motion/react";
import { motion, useAnimation } from "motion/react";
import type { MouseEvent, Ref } from "react";
import { useImperativeHandle, useRef } from "react";

export interface TruckIconHandle {
	startAnimation: () => void;
	stopAnimation: () => void;
}

interface TruckIconProps extends Omit<HTMLMotionProps<"div">, "ref"> {
	ref?: Ref<TruckIconHandle>;
	size?: number;
}

const TRUCK_VARIANTS: Variants = {
	normal: { x: 0, y: 0 },
	animate: {
		y: [0, -1, 0, -0.5, 0],
		transition: {
			duration: 0.4,
			ease: "easeInOut",
			repeat: Number.POSITIVE_INFINITY,
			repeatType: "loop",
		},
	},
};

const SPEED_LINE_VARIANTS: Variants = {
	normal: {
		opacity: 0,
		x: 0,
		scaleX: 0,
	},
	animate: (custom: number) => ({
		opacity: [0, 0.7, 0.5, 0],
		x: [0, -4, -10, -16],
		scaleX: [0.2, 1, 0.8, 0.3],
		transition: {
			duration: 0.5,
			ease: "easeOut",
			repeat: Number.POSITIVE_INFINITY,
			delay: custom * 0.08,
			times: [0, 0.2, 0.6, 1],
		},
	}),
};

const SPEED_LINES = [
	{ y: 8, width: 5, x: 0 },
	{ y: 11, width: 7, x: -1 },
	{ y: 14, width: 4, x: 0 },
];

function TruckIcon({
	onMouseEnter,
	onMouseLeave,
	className,
	size = 28,
	ref,
	...props
}: TruckIconProps) {
	const controls = useAnimation();
	const isControlledRef = useRef(false);

	useImperativeHandle(ref, () => {
		isControlledRef.current = true;

		return {
			startAnimation: () => controls.start("animate"),
			stopAnimation: () => controls.start("normal"),
		};
	});

	const handleMouseEnter = (e: MouseEvent<HTMLDivElement>) => {
		if (isControlledRef.current) {
			onMouseEnter?.(e);
		} else {
			controls.start("animate");
		}
	};

	const handleMouseLeave = (e: MouseEvent<HTMLDivElement>) => {
		if (isControlledRef.current) {
			onMouseLeave?.(e);
		} else {
			controls.start("normal");
		}
	};

	return (
		<motion.div
			className={cn(className)}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
			{...props}
		>
			<svg
				className="overflow-visible"
				fill="none"
				height={size}
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
				viewBox="0 0 24 24"
				width={size}
				xmlns="http://www.w3.org/2000/svg"
			>
				<title>Caminhão</title>
				{SPEED_LINES.map((line, i) => (
					<motion.line
						animate={controls}
						custom={i}
						initial="normal"
						key={`speed-${line.y}`}
						strokeLinecap="round"
						strokeWidth="1.5"
						variants={SPEED_LINE_VARIANTS}
						x1={line.x}
						x2={line.x + line.width}
						y1={line.y}
						y2={line.y}
					/>
				))}

				<motion.path
					animate={controls}
					d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12"
					initial="normal"
					variants={TRUCK_VARIANTS}
				/>
			</svg>
		</motion.div>
	);
}

TruckIcon.displayName = "TruckIcon";

export { TruckIcon };
