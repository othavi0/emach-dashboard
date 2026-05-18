"use server";

import { requireRole } from "@/lib/session";
import {
	extractPublicUrlPath,
	removeStorageObject,
	uploadToPublicBucket,
} from "@/lib/storage";
import { TOOL_IMAGES_BUCKET } from "@/lib/supabase-server";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadToolImage(
	formData: FormData
): Promise<{ url: string }> {
	await requireRole("admin");

	const { url } = await uploadToPublicBucket({
		bucket: TOOL_IMAGES_BUCKET,
		formData,
		maxSizeBytes: MAX_SIZE_BYTES,
		allowedTypes: ALLOWED_TYPES,
	});

	return { url };
}

export async function deleteToolImage(url: string): Promise<void> {
	await requireRole("admin");

	const path = extractPublicUrlPath(url, TOOL_IMAGES_BUCKET);
	if (!path) {
		return;
	}

	await removeStorageObject(TOOL_IMAGES_BUCKET, path);
}
