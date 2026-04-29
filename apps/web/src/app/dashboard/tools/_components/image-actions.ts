"use server";

import { requireRole } from "@/lib/session";
import { supabaseAdmin, TOOL_IMAGES_BUCKET } from "@/lib/supabase-server";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadToolImage(
	formData: FormData
): Promise<{ url: string }> {
	await requireRole("admin");
	const file = formData.get("file");

	if (!(file instanceof File)) {
		throw new Error("Arquivo ausente");
	}

	if (!ALLOWED_TYPES.has(file.type)) {
		throw new Error("Formato inválido (JPG/PNG/WEBP)");
	}

	if (file.size > MAX_SIZE_BYTES) {
		throw new Error(
			"Imagem excede 2MB após compressão (cliente deveria ter comprimido)"
		);
	}

	const extension = file.name.split(".").pop() ?? "bin";
	const objectPath = `${crypto.randomUUID()}.${extension}`;

	const buffer = Buffer.from(await file.arrayBuffer());

	const { error } = await supabaseAdmin.storage
		.from(TOOL_IMAGES_BUCKET)
		.upload(objectPath, buffer, { contentType: file.type, upsert: false });

	if (error) {
		throw new Error(`Falha no upload: ${error.message}`);
	}

	const { data: publicUrl } = supabaseAdmin.storage
		.from(TOOL_IMAGES_BUCKET)
		.getPublicUrl(objectPath);

	return { url: publicUrl.publicUrl };
}

function extractStoragePath(publicUrl: string): string | null {
	const marker = `/${TOOL_IMAGES_BUCKET}/`;
	const idx = publicUrl.indexOf(marker);
	if (idx === -1) {
		return null;
	}
	return publicUrl.slice(idx + marker.length);
}

export async function deleteToolImage(url: string): Promise<void> {
	await requireRole("admin");
	const path = extractStoragePath(url);
	if (!path) {
		return;
	}
	const { error } = await supabaseAdmin.storage
		.from(TOOL_IMAGES_BUCKET)
		.remove([path]);
	if (error) {
		throw new Error(`Falha ao remover imagem do storage: ${error.message}`);
	}
}
