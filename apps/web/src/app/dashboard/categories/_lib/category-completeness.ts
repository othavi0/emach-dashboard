/**
 * Regra "categoria completa": uma categoria precisa de no mínimo
 * MIN_CATEGORY_ATTRIBUTES atributos *efetivos* (próprios + herdados dos
 * ancestrais) para ser considerada pronta a receber ferramentas.
 *
 * O número espelha MIN_SPECS_ACTIVE (tools/_components/tool-schema.ts): uma
 * ferramenta exige ≥4 especificações preenchidas para ativar, e as specs
 * disponíveis vêm da cadeia da categoria principal. Abaixo desse mínimo nenhuma
 * ferramenta na categoria conseguiria ser ativada — por isso o gate.
 *
 * Módulo PURO (sem import de `db`/server-only) de propósito: é consumido tanto
 * por Server Components/actions quanto por Client Components (wizard de tool).
 */
export const MIN_CATEGORY_ATTRIBUTES = 4;

export function isCategoryComplete(effectiveAttributeCount: number): boolean {
	return effectiveAttributeCount >= MIN_CATEGORY_ATTRIBUTES;
}
