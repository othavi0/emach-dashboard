"use server";

import { logUserActivity } from "@/lib/activity";
import { requireCurrentSession, requireRole } from "@/lib/session";
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
	const session = await requireCurrentSession();
	await requireRole("admin");

	const { url } = await uploadToPublicBucket({
		bucket: TOOL_IMAGES_BUCKET,
		formData,
		maxSizeBytes: MAX_SIZE_BYTES,
		allowedTypes: ALLOWED_TYPES,
	});

	await logUserActivity({
		actorUserId: session.user.id,
		action: "tool.image_uploaded",
		targetType: "tool",
		metadata: { url },
	});
	return { url };
}

export async function deleteToolImage(url: string): Promise<void> {
	const session = await requireCurrentSession();
	await requireRole("admin");

	const path = extractPublicUrlPath(url, TOOL_IMAGES_BUCKET);
	if (!path) {
		return;
	}

	await removeStorageObject(TOOL_IMAGES_BUCKET, path);
	await logUserActivity({
		actorUserId: session.user.id,
		action: "tool.image_deleted",
		targetType: "tool",
		metadata: { path },
	});
}
