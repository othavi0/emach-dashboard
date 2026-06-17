export const MAX_VIDEO_BYTES = 52_428_800; // 50 MB
export const MAX_VIDEO_DURATION_SECONDS = 60;

export const ALLOWED_VIDEO_MIME = {
	"video/mp4": "mp4",
	"video/webm": "webm",
} as const;

export type AllowedVideoMime = keyof typeof ALLOWED_VIDEO_MIME;

export function validateVideoFile(
	file: File
): { ok: true } | { ok: false; error: string } {
	if (!(file.type in ALLOWED_VIDEO_MIME)) {
		return {
			ok: false,
			error: "Formato inválido. Use MP4 ou WebM (converta vídeos .mov).",
		};
	}
	if (file.size > MAX_VIDEO_BYTES) {
		return { ok: false, error: "Vídeo excede 50MB." };
	}
	return { ok: true };
}
