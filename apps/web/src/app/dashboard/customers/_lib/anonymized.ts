// Mesmo domínio do tombstone do script anonymize-client.ts do ecommerce: o
// predicado reconhece cliente anonimizado por qualquer um dos dois apps.
const ANONYMIZED_EMAIL_DOMAIN = "@anonymized.local";

export const ANONYMIZED_NAME = "[anonymized]";

export function isAnonymizedEmail(email: string): boolean {
	return email.endsWith(ANONYMIZED_EMAIL_DOMAIN);
}

export function anonymizedEmail(hash: string): string {
	return `deleted-${hash}${ANONYMIZED_EMAIL_DOMAIN}`;
}
