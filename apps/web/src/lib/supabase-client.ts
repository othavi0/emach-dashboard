"use client";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!url) {
	throw new Error("NEXT_PUBLIC_SUPABASE_URL nao configurado no ambiente");
}

if (!key) {
	throw new Error(
		"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY nao configurado no ambiente"
	);
}

export const supabaseBrowser = createClient(url, key, {
	auth: { persistSession: false },
});

export const TOOL_IMAGES_BUCKET = "tool-images";
