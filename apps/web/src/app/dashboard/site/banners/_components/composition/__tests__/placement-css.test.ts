import { describe, expect, test } from "vitest";
import { DEFAULT_COMPOSITION } from "../composition-schema";
import {
	backgroundToStyle,
	focalToObjectPosition,
	placementToStyle,
	textSide,
} from "../placement-css";

describe("placementToStyle", () => {
	test("bl desktop: left 7%, top 86%, translate 0/-100%", () => {
		const s = placementToStyle(
			{ anchor: "bl", offsetX: 2, offsetY: -2, scale: 100 },
			"desktop"
		);
		expect(s.left).toBe("7%");
		expect(s.top).toBe("86%");
		expect(s.transform).toBe("translate(0%, -100%) scale(1)");
	});
	test("mc: translate -50%/-50% e escala aplicada", () => {
		const s = placementToStyle(
			{ anchor: "mc", offsetX: 0, offsetY: 0, scale: 120 },
			"desktop"
		);
		expect(s.transform).toBe("translate(-50%, -50%) scale(1.2)");
	});
	test("maxWidth vira ch", () => {
		const s = placementToStyle(
			{ anchor: "bl", offsetX: 0, offsetY: 0, scale: 100, maxWidth: 44 },
			"desktop"
		);
		expect(s.maxWidth).toBe("44ch");
	});
});

describe("fundo", () => {
	test("focal tl → 0% 0%; br → 100% 100%", () => {
		expect(focalToObjectPosition("tl")).toBe("0% 0%");
		expect(focalToObjectPosition("br")).toBe("100% 100%");
	});
	test("zoom 150 vira scale 1.5 com origin no focal", () => {
		const s = backgroundToStyle({ zoom: 150, focal: "tl" });
		expect(s.transform).toBe("scale(1.5)");
		expect(s.transformOrigin).toBe("0% 0%");
	});
});

describe("textSide", () => {
	test("default (título bl) → left", () => {
		expect(textSide(DEFAULT_COMPOSITION)).toBe("left");
	});
});
