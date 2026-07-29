import type { CSSProperties } from "react";
import {
	type Anchor9,
	anchorBasePosition,
	type BackgroundConfig,
	type BannerComposition,
	type ElementPlacement,
	type Viewport,
} from "./composition-schema";

// Deslocamento de translate p/ ancorar o ponto de referência no elemento
// (col = horizontal, row = vertical), indexado por charAt (noUncheckedIndexedAccess).
const TX_BY_COL: Record<string, string> = { l: "0%", c: "-50%", r: "-100%" };
const TY_BY_ROW: Record<string, string> = { t: "0%", m: "-50%", b: "-100%" };
const PCT_BY_AXIS: Record<string, string> = {
	l: "0%",
	c: "50%",
	r: "100%",
	t: "0%",
	m: "50%",
	b: "100%",
};

function colOf(anchor: Anchor9): string {
	return anchor.charAt(1);
}

function rowOf(anchor: Anchor9): string {
	return anchor.charAt(0);
}

export function placementToStyle(
	p: ElementPlacement,
	viewport: Viewport
): CSSProperties {
	const base = anchorBasePosition(p.anchor, viewport);
	const tx = TX_BY_COL[colOf(p.anchor)] ?? "0%";
	const ty = TY_BY_ROW[rowOf(p.anchor)] ?? "0%";
	const originX = PCT_BY_AXIS[colOf(p.anchor)] ?? "50%";
	const originY = PCT_BY_AXIS[rowOf(p.anchor)] ?? "50%";
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
	const x = PCT_BY_AXIS[colOf(focal)] ?? "50%";
	const y = PCT_BY_AXIS[rowOf(focal)] ?? "50%";
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
	const col = colOf(a);
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
