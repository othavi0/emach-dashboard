import "server-only";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
	throw new Error("NEXT_PUBLIC_SUPABASE_URL nao configurado no ambiente");
}

if (!serviceKey) {
	throw new Error(
		"SUPABASE_SERVICE_ROLE_KEY nao configurado no ambiente do servidor"
	);
}

export const supabaseAdmin = createClient(url, serviceKey, {
	auth: { persistSession: false, autoRefreshToken: false },
});

export const TOOL_IMAGES_BUCKET = "tool-images";
