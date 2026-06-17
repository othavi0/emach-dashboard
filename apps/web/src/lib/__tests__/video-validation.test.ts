import { describe, expect, it } from "vitest";
import { MAX_VIDEO_BYTES, validateVideoFile } from "../video-validation";

const FORMAT_ERROR_RE = /MP4 ou WebM/;
const SIZE_ERROR_RE = /50MB/;

function fakeFile(type: string, size: number): File {
	const f = new File(["x"], "clip", { type });
	Object.defineProperty(f, "size", { value: size });
	return f;
}

describe("validateVideoFile", () => {
	it("aceita mp4 dentro do limite", () => {
		expect(validateVideoFile(fakeFile("video/mp4", 1_000_000))).toEqual({
			ok: true,
		});
	});

	it("aceita webm dentro do limite", () => {
		expect(validateVideoFile(fakeFile("video/webm", 1_000_000))).toEqual({
			ok: true,
		});
	});

	it("rejeita formato não suportado (.mov)", () => {
		const r = validateVideoFile(fakeFile("video/quicktime", 1_000_000));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toMatch(FORMAT_ERROR_RE);
		}
	});

	it("rejeita acima de 50MB", () => {
		const r = validateVideoFile(fakeFile("video/mp4", MAX_VIDEO_BYTES + 1));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toMatch(SIZE_ERROR_RE);
		}
	});
});
