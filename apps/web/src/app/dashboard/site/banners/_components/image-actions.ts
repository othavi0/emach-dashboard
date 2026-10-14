"use server";

import { z } from "zod";
import { logUserActivity } from "@/lib/activity";
import { requireCapability } from "@/lib/permissions";
import {
	extractPublicUrlPath,
	removeStorageObject,
	uploadToPublicBucket,
} from "@/lib/storage";
import { BANNER_IMAGES_BUCKET } from "@/lib/supabase-server";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

// Campo "maxBytes" do FormData: string numérica finita; qualquer outra coisa
// (ausente, File, texto não numérico) cai no default.
const maxBytesFieldSchema = z
	.string()
	.refine((v) => Number.isFinite(Number(v)))
	.transform((v) => Number(v));

export async function uploadBannerImage(
	formData: FormData
): Promise<{ url: string }> {
	const session = await requireCapability("site.update_banners");

	const maxBytes = maxBytesFieldSchema.safeParse(formData.get("maxBytes"));

	const maxSizeBytes = maxBytes.success ? maxBytes.data : DEFAULT_MAX_BYTES;

	const { url } = await uploadToPublicBucket({
		bucket: BANNER_IMAGES_BUCKET,
		formData,
		maxSizeBytes,
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
