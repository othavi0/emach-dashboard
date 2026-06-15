"use server";

import { logUserActivity } from "@/lib/activity";
import { requireCapability } from "@/lib/permissions";
import {
	extractPublicUrlPath,
	removeStorageObject,
	uploadToPublicBucket,
} from "@/lib/storage";
import { BANNER_IMAGES_BUCKET } from "@/lib/supabase-server";

const MAX_SIZE_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadBannerImage(
	formData: FormData
): Promise<{ url: string }> {
	const session = await requireCapability("site.update_banners");

	const { url } = await uploadToPublicBucket({
		bucket: BANNER_IMAGES_BUCKET,
		formData,
		maxSizeBytes: MAX_SIZE_BYTES,
		allowedTypes: ALLOWED_TYPES,
	});

	await logUserActivity({
		actorUserId: session.user.id,
		action: "banner.image_uploaded",
		targetType: "banner",
		metadata: { url },
	});
	return { url };
}

export async function deleteBannerImage(url: string): Promise<void> {
	const session = await requireCapability("site.update_banners");

	const path = extractPublicUrlPath(url, BANNER_IMAGES_BUCKET);
	if (!path) {
		return;
	}

	await removeStorageObject(BANNER_IMAGES_BUCKET, path);
	await logUserActivity({
		actorUserId: session.user.id,
		action: "banner.image_deleted",
		targetType: "banner",
		metadata: { path },
	});
}
