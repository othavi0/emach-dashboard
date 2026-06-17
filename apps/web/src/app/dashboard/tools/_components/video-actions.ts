"use server";

import { logUserActivity } from "@/lib/activity";
import { requireCapability } from "@/lib/permissions";
import { extractPublicUrlPath, removeStorageObject } from "@/lib/storage";
import { supabaseAdmin, TOOL_VIDEOS_BUCKET } from "@/lib/supabase-server";
import { ALLOWED_VIDEO_MIME } from "@/lib/video-validation";

export async function createToolVideoUploadUrl(input: {
	contentType: string;
}): Promise<
	| { ok: true; data: { bucket: string; path: string; token: string } }
	| { ok: false; error: string }
> {
	const session = await requireCapability("tools.update");
	const ext =
		ALLOWED_VIDEO_MIME[input.contentType as keyof typeof ALLOWED_VIDEO_MIME];
	if (!ext) {
		return { ok: false, error: "Formato inválido. Use MP4 ou WebM." };
	}
	const path = `${crypto.randomUUID()}.${ext}`;
	const { data, error } = await supabaseAdmin.storage
		.from(TOOL_VIDEOS_BUCKET)
		.createSignedUploadUrl(path);
	if (error || !data) {
		return { ok: false, error: "Não foi possível iniciar o upload do vídeo." };
	}
	await logUserActivity({
		actorUserId: session.user.id,
		action: "tool.video_uploaded",
		targetType: "tool",
		metadata: { path: data.path },
	});
	return {
		ok: true,
		data: { bucket: TOOL_VIDEOS_BUCKET, path: data.path, token: data.token },
	};
}

export async function deleteToolVideoObject(url: string): Promise<void> {
	const session = await requireCapability("tools.delete");
	const path = extractPublicUrlPath(url, TOOL_VIDEOS_BUCKET);
	if (!path) {
		return;
	}
	await removeStorageObject(TOOL_VIDEOS_BUCKET, path);
	await logUserActivity({
		actorUserId: session.user.id,
		action: "tool.video_deleted",
		targetType: "tool",
		metadata: { path },
	});
}
