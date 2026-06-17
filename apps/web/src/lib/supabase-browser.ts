import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!(url && publishableKey)) {
	throw new Error("Supabase browser env não configurada");
}

// Client sem sessão — usado só para uploadToSignedUrl (o token assina a operação)
// e getPublicUrl. A publishable key apenas identifica o projeto.
export const supabaseBrowser = createClient(url, publishableKey, {
	auth: { persistSession: false, autoRefreshToken: false },
});
