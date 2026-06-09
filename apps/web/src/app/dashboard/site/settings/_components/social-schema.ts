import { z } from "zod";

/**
 * Redes sociais exibidas no storefront. A ordem aqui é a ordem de render no
 * form e (via query) no site. `key` casa com o prefixo das colunas em
 * `store_settings` (`social_<key>_url` / `social_<key>_visible`).
 */
export const SOCIAL_NETWORKS = [
	{
		key: "instagram",
		label: "Instagram",
		placeholder: "https://instagram.com/emach",
	},
	{
		key: "linkedin",
		label: "LinkedIn",
		placeholder: "https://linkedin.com/company/emach",
	},
	{
		key: "facebook",
		label: "Facebook",
		placeholder: "https://facebook.com/emach",
	},
	{ key: "x", label: "X", placeholder: "https://x.com/emach" },
	{
		key: "youtube",
		label: "YouTube",
		placeholder: "https://youtube.com/@emach",
	},
] as const;

export type SocialNetworkKey = (typeof SOCIAL_NETWORKS)[number]["key"];

/**
 * Link publicável: URL absoluta com protocolo http(s). É a mesma regra que
 * libera o toggle "aparece no site" no form — evita ativar um link quebrado.
 */
export function isPublishableUrl(value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) {
		return false;
	}
	try {
		const url = new URL(trimmed);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

/** URL completa do perfil (http/https) ou vazio (rede não cadastrada). */
const socialUrlField = z
	.string()
	.trim()
	.max(2048, "URL muito longa")
	.refine((v) => v === "" || isPublishableUrl(v), {
		error: "Informe uma URL completa, começando com https://",
	})
	.transform((v) => (v ? v : undefined));

export const socialSettingsSchema = z.object({
	instagramUrl: socialUrlField,
	instagramVisible: z.boolean(),
	linkedinUrl: socialUrlField,
	linkedinVisible: z.boolean(),
	facebookUrl: socialUrlField,
	facebookVisible: z.boolean(),
	xUrl: socialUrlField,
	xVisible: z.boolean(),
	youtubeUrl: socialUrlField,
	youtubeVisible: z.boolean(),
});

export type SocialSettingsFormValues = z.infer<typeof socialSettingsSchema>;

/** Estado por rede compartilhado entre o form, a página e o preview. */
export type SocialState = Record<
	SocialNetworkKey,
	{ url: string; visible: boolean }
>;
