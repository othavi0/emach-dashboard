const SKIP_THRESHOLD_BYTES = 800 * 1024;
const EXTENSION_RE = /\.[^.]+$/;

const COMPRESSION_OPTS = {
	fileType: "image/webp",
	initialQuality: 0.82,
	maxSizeMB: 1,
	maxWidthOrHeight: 2000,
	useWebWorker: true,
} as const;

export async function compressImageForUpload(file: File): Promise<File> {
	const isAlreadySmall = file.size <= SKIP_THRESHOLD_BYTES;
	const isWebFriendly =
		file.type === "image/jpeg" || file.type === "image/webp";
	if (isAlreadySmall && isWebFriendly) {
		return file;
	}

	const { default: imageCompression } = await import(
		"browser-image-compression"
	);
	const blob = await imageCompression(file, COMPRESSION_OPTS);
	const baseName = file.name.replace(EXTENSION_RE, "");
	return new File([blob], `${baseName}.webp`, {
		lastModified: Date.now(),
		type: "image/webp",
	});
}
