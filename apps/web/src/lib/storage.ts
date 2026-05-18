import "server-only";

import { supabaseAdmin } from "@/lib/supabase-server";

// ─── Bucket constants ──────────────────────────────────────────────────────────

export const ORDER_DOCUMENTS_BUCKET = "order-documents";

/** Signed-URL TTL for private order documents (seconds). */
const SIGNED_URL_TTL_SECONDS = 3600; // 1 hour

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface UploadPublicOptions {
	allowedTypes: ReadonlySet<string>;
	bucket: string;
	formData: FormData;
	maxSizeBytes: number;
	prefix?: string;
}

export interface UploadPublicResult {
	/** Storage object path (relative to bucket root). */
	path: string;
	/** Absolute public URL — safe to persist in DB. */
	url: string;
}

export interface UploadPrivateOptions {
	allowedTypes: ReadonlySet<string>;
	bucket: string;
	formData: FormData;
	maxSizeBytes: number;
	prefix?: string;
}

export interface UploadPrivateResult {
	fileName: string;
	fileSize: number;
	mimeType: string;
	/** Storage object path (relative to bucket root). Store this in DB — NOT a signed URL. */
	path: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function extractFile(formData: FormData): File {
	const file = formData.get("file");
	if (!(file instanceof File)) {
		throw new Error("Arquivo ausente");
	}
	return file;
}

function validateFile(
	file: File,
	allowedTypes: ReadonlySet<string>,
	maxSizeBytes: number
): void {
	if (!allowedTypes.has(file.type)) {
		throw new Error(`Formato inválido (${[...allowedTypes].join(", ")})`);
	}
	if (file.size > maxSizeBytes) {
		const limitMb = (maxSizeBytes / (1024 * 1024)).toFixed(0);
		throw new Error(`Arquivo excede ${limitMb}MB`);
	}
}

function buildObjectPath(file: File, prefix?: string): string {
	const extension = file.name.split(".").pop() ?? "bin";
	const slug = `${crypto.randomUUID()}.${extension}`;
	return prefix ? `${prefix}/${slug}` : slug;
}

// ─── Public bucket upload ──────────────────────────────────────────────────────

/**
 * Uploads a file to a **public** bucket and returns the absolute public URL.
 * Caller is responsible for authorization before calling this function.
 */
export async function uploadToPublicBucket(
	options: UploadPublicOptions
): Promise<UploadPublicResult> {
	const { bucket, prefix, formData, maxSizeBytes, allowedTypes } = options;

	const file = extractFile(formData);
	validateFile(file, allowedTypes, maxSizeBytes);

	const objectPath = buildObjectPath(file, prefix);
	const buffer = Buffer.from(await file.arrayBuffer());

	const { error } = await supabaseAdmin.storage
		.from(bucket)
		.upload(objectPath, buffer, { contentType: file.type, upsert: false });

	if (error) {
		throw new Error(`Falha no upload: ${error.message}`);
	}

	const { data: publicUrlData } = supabaseAdmin.storage
		.from(bucket)
		.getPublicUrl(objectPath);

	return { url: publicUrlData.publicUrl, path: objectPath };
}

// ─── Private bucket upload ─────────────────────────────────────────────────────

/**
 * Uploads a file to a **private** bucket and returns the storage object path.
 * The path (not a signed URL) must be persisted in DB — signed URLs are generated on read.
 * Caller is responsible for authorization before calling this function.
 */
export async function uploadToPrivateBucket(
	options: UploadPrivateOptions
): Promise<UploadPrivateResult> {
	const { bucket, prefix, formData, maxSizeBytes, allowedTypes } = options;

	const file = extractFile(formData);
	validateFile(file, allowedTypes, maxSizeBytes);

	const objectPath = buildObjectPath(file, prefix);
	const buffer = Buffer.from(await file.arrayBuffer());

	const { error } = await supabaseAdmin.storage
		.from(bucket)
		.upload(objectPath, buffer, { contentType: file.type, upsert: false });

	if (error) {
		throw new Error(`Falha no upload: ${error.message}`);
	}

	return {
		path: objectPath,
		fileName: file.name,
		fileSize: file.size,
		mimeType: file.type,
	};
}

// ─── Signed URL generation ─────────────────────────────────────────────────────

/**
 * Generates a short-lived signed URL for a private bucket object.
 * Returns `null` if the object doesn't exist or signing fails (best-effort for lists).
 */
export async function createSignedUrl(
	bucket: string,
	objectPath: string,
	expiresInSeconds = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
	const { data, error } = await supabaseAdmin.storage
		.from(bucket)
		.createSignedUrl(objectPath, expiresInSeconds);

	if (error || !data?.signedUrl) {
		return null;
	}

	return data.signedUrl;
}

// ─── Object deletion ───────────────────────────────────────────────────────────

/**
 * Removes a storage object from any bucket by path.
 * Throws if the remove call returns an error.
 */
export async function removeStorageObject(
	bucket: string,
	objectPath: string
): Promise<void> {
	const { error } = await supabaseAdmin.storage
		.from(bucket)
		.remove([objectPath]);

	if (error) {
		throw new Error(`Falha ao remover arquivo do storage: ${error.message}`);
	}
}

// ─── Path extraction from public URL ──────────────────────────────────────────

/**
 * Extracts the storage object path from a Supabase public URL.
 * Returns `null` if the URL does not belong to the given bucket.
 *
 * Example:
 *   extractPublicUrlPath("https://…/object/public/tool-images/uuid.jpg", "tool-images")
 *   → "uuid.jpg"
 */
export function extractPublicUrlPath(
	publicUrl: string,
	bucket: string
): string | null {
	const marker = `/${bucket}/`;
	const idx = publicUrl.indexOf(marker);
	if (idx === -1) {
		return null;
	}
	return publicUrl.slice(idx + marker.length);
}
