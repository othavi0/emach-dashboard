import { describe, expect, it } from "vitest";
import { formatSessionIp } from "./format-session-ip";

describe("formatSessionIp", () => {
	it("retorna travessão para null", () => {
		expect(formatSessionIp(null)).toBe("—");
	});
	it("colapsa IPv6 todo-zero para Local", () => {
		expect(formatSessionIp("0000:0000:0000:0000:0000:0000:0000:0000")).toBe(
			"Local"
		);
		expect(formatSessionIp("0:0:0:0:0:0:0:0")).toBe("Local");
		expect(formatSessionIp("::")).toBe("Local");
	});
	it("trata loopback como Local", () => {
		expect(formatSessionIp("::1")).toBe("Local");
		expect(formatSessionIp("127.0.0.1")).toBe("Local");
	});
	it("preserva IP público", () => {
		expect(formatSessionIp("177.133.209.36")).toBe("177.133.209.36");
	});
});
