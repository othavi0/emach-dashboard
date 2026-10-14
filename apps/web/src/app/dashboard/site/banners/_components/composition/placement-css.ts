import type { CSSProperties } from "react";
import {
	ANCHOR_PARTS,
	type Anchor9,
	type AnchorCol,
	type AnchorRow,
	anchorBasePosition,
	type BackgroundConfig,
	type BannerComposition,
	type ElementPlacement,
	type Viewport,
} from "./composition-schema";

// Deslocamento de translate p/ ancorar o ponto de referência no elemento
// (col = horizontal, row = vertical).
const TX_BY_COL = {
	l: "0%",
	c: "-50%",
	r: "-100%",
} as const satisfies Record<AnchorCol, string>;

const TY_BY_ROW = {
	t: "0%",
	m: "-50%",
	b: "-100%",
} as const satisfies Record<AnchorRow, string>;

const PCT_BY_COL = {
	l: "0%",
	c: "50%",
	r: "100%",
} as const satisfies Record<AnchorCol, string>;

const PCT_BY_ROW = {
	t: "0%",
	m: "50%",
	b: "100%",
} as const satisfies Record<AnchorRow, string>;

export function placementToStyle(
	p: ElementPlacement,
	viewport: Viewport
): CSSProperties {
	const base = anchorBasePosition(p.anchor, viewport);
	const { row, col } = ANCHOR_PARTS[p.anchor];
	const tx = TX_BY_COL[col];
	const ty = TY_BY_ROW[row];
	const originX = PCT_BY_COL[col];
	const originY = PCT_BY_ROW[row];

	const style: CSSProperties = {
		left: `${base.x + p.offsetX}%`,
		top: `${base.y + p.offsetY}%`,
		transform: `translate(${tx}, ${ty}) scale(${p.scale / 100})`,
		transformOrigin: `${originX} ${originY}`,
	};

	if (p.maxWidth !== undefined) {
		style.maxWidth = `${p.maxWidth}ch`;
	}

	return style;
}

export function focalToObjectPosition(focal: Anchor9): string {
	const { row, col } = ANCHOR_PARTS[focal];
	const x = PCT_BY_COL[col];
	const y = PCT_BY_ROW[row];

	return `${x} ${y}`;
}

export function backgroundToStyle(bg: BackgroundConfig): CSSProperties {
	return {
		transform: `scale(${bg.zoom / 100})`,
		transformOrigin: focalToObjectPosition(bg.focal),
	};
}

export function textSide(c: BannerComposition): "left" | "right" | "center" {
	const a =
		c.desktop.elements.title?.anchor ?? c.desktop.elements.subtitle?.anchor;

	if (a === undefined) {
		return "center";
	}

	const { col } = ANCHOR_PARTS[a];

	if (col === "l") {
		return "left";
	}

	if (col === "r") {
		return "right";
	}

	return "center";
}

// Direção do gradiente de legibilidade (classes estáticas — Tailwind JIT).
export const GRADIENT_CLASS: Record<"left" | "right" | "center", string> = {
	left: "bg-gradient-to-r from-black/80 via-black/20 to-transparent",
	right: "bg-gradient-to-l from-black/80 via-black/20 to-transparent",
	center: "bg-gradient-to-t from-black/85 via-black/30 to-transparent",
};
