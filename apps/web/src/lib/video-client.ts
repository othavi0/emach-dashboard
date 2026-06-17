const POSTER_MAX_EDGE = 1280;

export function readVideoDuration(file: File): Promise<number> {
	return new Promise((resolve, reject) => {
		const video = document.createElement("video");
		video.preload = "metadata";
		video.muted = true;
		const objectUrl = URL.createObjectURL(file);
		const cleanup = () => URL.revokeObjectURL(objectUrl);
		video.onloadedmetadata = () => {
			cleanup();
			resolve(video.duration);
		};
		video.onerror = () => {
			cleanup();
			reject(new Error("Não foi possível ler o vídeo."));
		};
		video.src = objectUrl;
	});
}

export function capturePosterFrame(file: File): Promise<File> {
	return new Promise((resolve, reject) => {
		const video = document.createElement("video");
		video.preload = "auto";
		video.muted = true;
		// biome-ignore lint/suspicious/noExplicitAny: playsInline não está no lib dom desta versão
		(video as any).playsInline = true;
		const objectUrl = URL.createObjectURL(file);
		const cleanup = () => URL.revokeObjectURL(objectUrl);

		video.onloadeddata = () => {
			const target = Math.min(1, (video.duration || 2) / 2);
			video.currentTime = target;
		};
		video.onseeked = () => {
			const scale = Math.min(
				1,
				POSTER_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight)
			);
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(video.videoWidth * scale);
			canvas.height = Math.round(video.videoHeight * scale);
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				cleanup();
				reject(new Error("Não foi possível gerar a capa do vídeo."));
				return;
			}
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			canvas.toBlob(
				(blob) => {
					cleanup();
					if (!blob) {
						reject(new Error("Não foi possível gerar a capa do vídeo."));
						return;
					}
					resolve(new File([blob], "poster.webp", { type: "image/webp" }));
				},
				"image/webp",
				0.8
			);
		};
		video.onerror = () => {
			cleanup();
			reject(new Error("Não foi possível processar o vídeo."));
		};
		video.src = objectUrl;
	});
}
