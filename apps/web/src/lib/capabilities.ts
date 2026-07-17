import type { UserRole } from "@/lib/session";

export interface CapabilityMeta {
	/** Verbo da ação (ex: "Deletar"). */
	action: string;
	/** Roles que recebem a capability por padrão (sem overrides). */
	defaultRoles: readonly UserRole[];
	/** Descrição curta para tooltip/linha. */
	description: string;
	/** Agrupamento de nível 1 na UI (ex: "Catálogo"). */
	group: string;
	/** Recurso dentro do grupo (ex: "Ferramentas"). */
	resource: string;
}

// Atalhos de defaultRoles (S = só super_admin; SA = super_admin + admin;
// SAU = super_admin + admin + user).
const S: readonly UserRole[] = ["super_admin"];
const SA: readonly UserRole[] = ["super_admin", "admin"];
const SAU: readonly UserRole[] = ["super_admin", "admin", "user"];

// Registry declarativo. Feature/seção nova = 1 entrada aqui → aparece na UI
// automaticamente e nasce deny-by-default (só quem `defaultRoles`/override conceder).
export const CAPABILITIES = {
	// ── Catálogo ──────────────────────────────────────────────
	"tools.read": {
		group: "Catálogo",
		resource: "Ferramentas",
		action: "Ver",
		description: "Visualizar ferramentas",
		defaultRoles: SAU,
	},
	"tools.create": {
		group: "Catálogo",
		resource: "Ferramentas",
		action: "Criar",
		description: "Criar ferramenta",
		defaultRoles: SA,
	},
	"tools.update": {
		group: "Catálogo",
		resource: "Ferramentas",
		action: "Editar",
		description: "Editar ferramenta",
		defaultRoles: SA,
	},
	"tools.delete": {
		group: "Catálogo",
		resource: "Ferramentas",
		action: "Deletar",
		description: "Excluir ferramenta",
		defaultRoles: S,
	},
	"categories.read": {
		group: "Catálogo",
		resource: "Categorias",
		action: "Ver",
		description: "Visualizar categorias",
		defaultRoles: SAU,
	},
	"categories.manage": {
		group: "Catálogo",
		resource: "Categorias",
		action: "Gerenciar",
		description: "Criar/editar categorias e atributos",
		defaultRoles: SA,
	},
	"categories.delete": {
		group: "Catálogo",
		resource: "Categorias",
		action: "Deletar",
		description: "Excluir categoria",
		defaultRoles: S,
	},
	"attributes.read": {
		group: "Catálogo",
		resource: "Atributos",
		action: "Ver",
		description: "Visualizar atributos",
		defaultRoles: SAU,
	},
	"attributes.create": {
		group: "Catálogo",
		resource: "Atributos",
		action: "Criar",
		description: "Criar atributo",
		defaultRoles: SA,
	},
	"attributes.update": {
		group: "Catálogo",
		resource: "Atributos",
		action: "Editar",
		description: "Editar atributo",
		defaultRoles: SA,
	},
	"attributes.delete": {
		group: "Catálogo",
		resource: "Atributos",
		action: "Deletar",
		description: "Excluir atributo",
		defaultRoles: S,
	},
	"suppliers.read": {
		group: "Catálogo",
		resource: "Fornecedores",
		action: "Ver",
		description: "Visualizar fornecedores",
		defaultRoles: SAU,
	},
	"suppliers.manage": {
		group: "Catálogo",
		resource: "Fornecedores",
		action: "Gerenciar",
		description: "Criar/editar fornecedores",
		defaultRoles: SAU,
	},
	"promotions.read": {
		group: "Catálogo",
		resource: "Promoções",
		action: "Ver",
		description: "Visualizar promoções",
		defaultRoles: SA,
	},
	"promotions.manage": {
		group: "Catálogo",
		resource: "Promoções",
		action: "Gerenciar",
		description: "Criar/editar promoções",
		defaultRoles: SA,
	},
	"promotions.delete": {
		group: "Catálogo",
		resource: "Promoções",
		action: "Deletar",
		description: "Excluir promoção",
		defaultRoles: S,
	},
	// ── Inventário (branch-scoped) ────────────────────────────
	"stock.read": {
		group: "Inventário",
		resource: "Estoque",
		action: "Ver",
		description: "Visualizar estoque",
		defaultRoles: SAU,
	},
	"stock.adjust": {
		group: "Inventário",
		resource: "Estoque",
		action: "Ajustar",
		description: "Movimentar/ajustar estoque",
		defaultRoles: SAU,
	},
	// ── Filiais ───────────────────────────────────────────────
	"branches.read": {
		group: "Filiais",
		resource: "Filiais",
		action: "Ver",
		description: "Visualizar filiais",
		defaultRoles: SA,
	},
	"branches.manage": {
		group: "Filiais",
		resource: "Filiais",
		action: "Gerenciar",
		description: "Criar/editar filiais e vínculos",
		defaultRoles: S,
	},
	// ── Vendas (branch-scoped) ────────────────────────────────
	"orders.read": {
		group: "Vendas",
		resource: "Pedidos",
		action: "Ver",
		description: "Visualizar pedidos",
		defaultRoles: SA,
	},
	"orders.update_status": {
		group: "Vendas",
		resource: "Pedidos",
		action: "Atualizar status",
		description: "Avançar status do pedido",
		defaultRoles: SAU,
	},
	"orders.add_note": {
		group: "Vendas",
		resource: "Pedidos",
		action: "Anotar",
		description: "Adicionar nota ao pedido",
		defaultRoles: SAU,
	},
	"orders.cancel": {
		group: "Vendas",
		resource: "Pedidos",
		action: "Cancelar",
		description: "Cancelar pedido",
		defaultRoles: SA,
	},
	"orders.refund": {
		group: "Vendas",
		resource: "Pedidos",
		action: "Estornar",
		description: "Estornar pedido",
		defaultRoles: SA,
	},
	"orders.pick": {
		group: "Vendas",
		resource: "Pedidos",
		action: "Separar",
		description: "Separar/conferir itens do pedido (picking)",
		defaultRoles: SAU,
	},
	// ── Clientes ──────────────────────────────────────────────
	"customers.read": {
		group: "Clientes",
		resource: "Clientes",
		action: "Ver",
		description: "Visualizar clientes",
		defaultRoles: SA,
	},
	"customers.update_status": {
		group: "Clientes",
		resource: "Clientes",
		action: "Editar status",
		description: "Alterar status do cliente",
		defaultRoles: SA,
	},
	"customers.export": {
		group: "Clientes",
		resource: "Clientes",
		action: "Exportar",
		description: "Exportar clientes",
		defaultRoles: SA,
	},
	"customers.manage_sessions": {
		group: "Clientes",
		resource: "Clientes",
		action: "Sessões",
		description: "Gerenciar sessões do cliente",
		defaultRoles: SA,
	},
	"customers.reset_password": {
		group: "Clientes",
		resource: "Clientes",
		action: "Resetar senha",
		description: "Resetar senha do cliente",
		defaultRoles: SA,
	},
	"reviews.read": {
		group: "Clientes",
		resource: "Avaliações",
		action: "Ver",
		description: "Visualizar avaliações",
		defaultRoles: SA,
	},
	"reviews.moderate": {
		group: "Clientes",
		resource: "Avaliações",
		action: "Moderar",
		description: "Aprovar/remover avaliações",
		defaultRoles: SA,
	},
	// ── Site ──────────────────────────────────────────────────
	"site.update_banners": {
		group: "Site",
		resource: "Site",
		action: "Banners",
		description: "Editar banners da home",
		defaultRoles: S,
	},
	"site.update_settings": {
		group: "Site",
		resource: "Site",
		action: "Configurações",
		description: "Editar configurações do site",
		defaultRoles: S,
	},
	"site.publish_announcements": {
		group: "Site",
		resource: "Site",
		action: "Anúncios",
		description: "Publicar anúncios",
		defaultRoles: S,
	},
	// ── Frete ─────────────────────────────────────────────────
	"shipping.read": {
		group: "Frete",
		resource: "Frete",
		action: "Ver",
		description: "Visualizar caixas de envio e config de frete",
		defaultRoles: SA,
	},
	"shipping.manage": {
		group: "Frete",
		resource: "Frete",
		action: "Gerenciar",
		description: "Criar/editar caixas de envio e config de frete",
		defaultRoles: S,
	},
	// ── Usuários ──────────────────────────────────────────────
	"users.manage": {
		group: "Usuários",
		resource: "Usuários",
		action: "Gerenciar",
		description: "Acessar gestão de usuários",
		defaultRoles: SA,
	},
	"users.approve": {
		group: "Usuários",
		resource: "Usuários",
		action: "Aprovar",
		description: "Aprovar convite/usuário pendente",
		defaultRoles: SA,
	},
	"users.update_role": {
		group: "Usuários",
		resource: "Usuários",
		action: "Alterar role",
		description: "Mudar o nível do usuário",
		defaultRoles: SA,
	},
	"users.update_branches": {
		group: "Usuários",
		resource: "Usuários",
		action: "Vincular filial",
		description: "Editar filiais do usuário",
		defaultRoles: SA,
	},
	"users.suspend": {
		group: "Usuários",
		resource: "Usuários",
		action: "Suspender",
		description: "Suspender/reativar usuário",
		defaultRoles: SA,
	},
	"users.reset_password": {
		group: "Usuários",
		resource: "Usuários",
		action: "Resetar senha",
		description: "Resetar senha do usuário",
		defaultRoles: SA,
	},
	"users.revoke_sessions": {
		group: "Usuários",
		resource: "Usuários",
		action: "Revogar sessões",
		description: "Encerrar sessões do usuário",
		defaultRoles: SA,
	},
	"users.delete": {
		group: "Usuários",
		resource: "Usuários",
		action: "Deletar",
		description: "Excluir usuário",
		defaultRoles: S,
	},
	"permissions.manage": {
		group: "Usuários",
		resource: "Permissões",
		action: "Gerenciar",
		description: "Conceder/revogar capabilities de outros usuários",
		defaultRoles: SA,
	},
	"audit.read": {
		group: "Usuários",
		resource: "Auditoria",
		action: "Ver",
		description: "Ler log de auditoria",
		defaultRoles: SA,
	},
} as const satisfies Record<string, CapabilityMeta>;

export type Capability = keyof typeof CAPABILITIES;

export function isCapability(value: string): value is Capability {
	return value in CAPABILITIES;
}

export type NavSection =
	| "Operação"
	| "Catálogo"
	| "Relacionamento"
	| "Sistema"
	| "Administração";

// Ordem = ordem da sidebar (nav-config.ts). Visão/Dashboard não tem capability.
export const SECTION_ORDER: readonly NavSection[] = [
	"Operação",
	"Catálogo",
	"Relacionamento",
	"Sistema",
	"Administração",
];

// Recurso (meta.resource) → seção da sidebar. Alinha a tela de permissões à navegação.
const RESOURCE_SECTION: Record<string, NavSection> = {
	Pedidos: "Operação",
	Filiais: "Operação",
	Ferramentas: "Catálogo",
	Atributos: "Catálogo",
	Categorias: "Catálogo",
	Fornecedores: "Catálogo",
	Estoque: "Catálogo",
	Clientes: "Relacionamento",
	Avaliações: "Relacionamento",
	Promoções: "Relacionamento",
	Site: "Sistema",
	Frete: "Sistema",
	Usuários: "Administração",
	Permissões: "Administração",
	Auditoria: "Administração",
};

export function sectionForCapability(cap: Capability): NavSection {
	// RESOURCE_SECTION cobre todo resource declarado em CAPABILITIES.
	// O teste "toda capability tem uma seção em SECTION_ORDER" garante exaustividade.
	// biome-ignore lint/style/noNonNullAssertion: cobertura garantida pelo teste de regressão
	return RESOURCE_SECTION[CAPABILITIES[cap].resource]!;
}

export function roleDefaultCapabilities(role: UserRole): Set<Capability> {
	const result = new Set<Capability>();
	for (const [key, meta] of Object.entries(CAPABILITIES) as [
		Capability,
		CapabilityMeta,
	][]) {
		if (meta.defaultRoles.includes(role)) {
			result.add(key);
		}
	}
	return result;
}
