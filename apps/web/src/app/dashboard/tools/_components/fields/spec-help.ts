/**
 * Fonte única da ajuda contextual de specs/fiscal de ferramenta.
 * Consumido tanto pelo form (`fiscal-fields.tsx`) quanto pela página de
 * detalhe (`[id]/_components/tool-specs.tsx`) — não duplicar a copy.
 */

interface RichHelp {
	body: string;
	example?: string;
	title: string;
}

export const FISCAL_HELP: Record<"ncm" | "cest" | "hsCode", RichHelp> = {
	ncm: {
		title: "Nomenclatura Comum do Mercosul",
		body: "Classifica a mercadoria para impostos e importação. 8 dígitos. Pegue na ficha do fabricante.",
		example: "Ex: 8467.21.00",
	},
	cest: {
		title: "Código Especificador da Substituição Tributária",
		body: "Identifica mercadorias sujeitas a ICMS-ST. Usado na nota fiscal. 7 dígitos.",
		example: "Ex: 21.106.00",
	},
	hsCode: {
		title: "Harmonized System Code",
		body: "Código aduaneiro internacional usado em importação/exportação. 6+ dígitos.",
		example: "Ex: 8467.21",
	},
};

export const MODEL_HELP: Record<"model" | "invoiceModel", string> = {
	model: "Nome curto pra catálogo e busca interna. Ex: ELT 800.",
	invoiceModel:
		"Identificação completa usada em invoice e importação. Diferente do modelo comercial (curto, pra catálogo).",
};
