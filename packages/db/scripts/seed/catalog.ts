// packages/db/scripts/seed/catalog.ts

import {
	attributeDefinition,
	toolAttributeAssignment,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { category, toolCategory } from "@emach/db/schema/categories";
import { supplier, tool, toolImage, toolVariant } from "@emach/db/schema/tools";
import { env } from "@emach/env/server";
import { sql } from "drizzle-orm";
import type { SeedContext, Tx } from "./context";

// ---------------------------------------------------------------------------
// 1. Categorias (~20 nós)
// ---------------------------------------------------------------------------

interface CategoryDef {
	name: string;
	parentSlug: string | null;
	slug: string;
	sortOrder?: number;
}

const CATEGORIES: CategoryDef[] = [
	// 4 raízes
	{
		slug: "ferramentas-eletricas",
		name: "Ferramentas Elétricas",
		parentSlug: null,
		sortOrder: 0,
	},
	{
		slug: "ferramentas-manuais",
		name: "Ferramentas Manuais",
		parentSlug: null,
		sortOrder: 1,
	},
	{
		slug: "equipamentos",
		name: "Equipamentos",
		parentSlug: null,
		sortOrder: 2,
	},
	{ slug: "acessorios", name: "Acessórios", parentSlug: null, sortOrder: 3 },
	// Filhas de ferramentas-eletricas
	{
		slug: "furadeiras",
		name: "Furadeiras e Parafusadeiras",
		parentSlug: "ferramentas-eletricas",
		sortOrder: 0,
	},
	{
		slug: "serras-eletricas",
		name: "Serras Elétricas",
		parentSlug: "ferramentas-eletricas",
		sortOrder: 1,
	},
	{
		slug: "esmerilhadeiras",
		name: "Esmerilhadeiras",
		parentSlug: "ferramentas-eletricas",
		sortOrder: 2,
	},
	{
		slug: "lixadeiras",
		name: "Lixadeiras",
		parentSlug: "ferramentas-eletricas",
		sortOrder: 3,
	},
	{
		slug: "plainas-eletricas",
		name: "Plainas Elétricas",
		parentSlug: "ferramentas-eletricas",
		sortOrder: 4,
	},
	// Filhas de furadeiras (depth 2)
	{
		slug: "furadeiras-de-impacto",
		name: "Furadeiras de Impacto",
		parentSlug: "furadeiras",
		sortOrder: 0,
	},
	{
		slug: "parafusadeiras-a-bateria",
		name: "Parafusadeiras a Bateria",
		parentSlug: "furadeiras",
		sortOrder: 1,
	},
	// Filhas de serras-eletricas (depth 2)
	{
		slug: "serras-circulares",
		name: "Serras Circulares",
		parentSlug: "serras-eletricas",
		sortOrder: 0,
	},
	{
		slug: "serras-tico-tico",
		name: "Serras Tico-Tico",
		parentSlug: "serras-eletricas",
		sortOrder: 1,
	},
	// Filhas de ferramentas-manuais
	{
		slug: "chaves",
		name: "Chaves e Bits",
		parentSlug: "ferramentas-manuais",
		sortOrder: 0,
	},
	{
		slug: "martelos",
		name: "Martelos e Macetas",
		parentSlug: "ferramentas-manuais",
		sortOrder: 1,
	},
	{
		slug: "alicates",
		name: "Alicates e Torqueses",
		parentSlug: "ferramentas-manuais",
		sortOrder: 2,
	},
	// Filhas de equipamentos
	{
		slug: "compressores",
		name: "Compressores de Ar",
		parentSlug: "equipamentos",
		sortOrder: 0,
	},
	{
		slug: "soldas",
		name: "Equipamentos de Solda",
		parentSlug: "equipamentos",
		sortOrder: 1,
	},
	// Filhas de acessorios
	{
		slug: "brocas",
		name: "Brocas e Serras-Copo",
		parentSlug: "acessorios",
		sortOrder: 0,
	},
	{
		slug: "discos",
		name: "Discos e Rebolos",
		parentSlug: "acessorios",
		sortOrder: 1,
	},
];

// ---------------------------------------------------------------------------
// 2. Attribute definitions (~14)
// ---------------------------------------------------------------------------

interface AttributeDef {
	categorySlug: string;
	inputType:
		| "text"
		| "number"
		| "select"
		| "boolean"
		| "numeric_range"
		| "color";
	isRequired?: boolean;
	label: string;
	options?: import("@emach/db/schema/attributes").AttributeOptions;
	slug: string;
	sortOrder?: number;
	unit?: string;
}

const ATTRIBUTES: AttributeDef[] = [
	// ferramentas-eletricas
	{
		slug: "potencia-w",
		label: "Potência (W)",
		inputType: "number",
		categorySlug: "ferramentas-eletricas",
		unit: "W",
		sortOrder: 0,
	},
	{
		slug: "voltagem-nominal",
		label: "Voltagem",
		inputType: "select",
		categorySlug: "ferramentas-eletricas",
		options: {
			kind: "select",
			options: [
				{ label: "127V", value: "127V" },
				{ label: "220V", value: "220V" },
				{ label: "Bivolt", value: "Bivolt" },
				{ label: "380V", value: "380V" },
			],
		},
		sortOrder: 1,
	},
	{
		slug: "velocidade-rpm-range",
		label: "Velocidade (RPM)",
		inputType: "numeric_range",
		categorySlug: "ferramentas-eletricas",
		unit: "RPM",
		sortOrder: 2,
	},
	// furadeiras
	{
		slug: "capacidade-mandril",
		label: "Capacidade do Mandril",
		inputType: "select",
		categorySlug: "furadeiras",
		options: {
			kind: "select",
			options: [
				{ label: "10 mm", value: "10mm" },
				{ label: "13 mm", value: "13mm" },
				{ label: "16 mm", value: "16mm" },
			],
		},
		sortOrder: 0,
	},
	{
		slug: "tem-percussao",
		label: "Com Percussão",
		inputType: "boolean",
		categorySlug: "furadeiras",
		sortOrder: 1,
	},
	// serras-eletricas
	{
		slug: "diametro-disco",
		label: "Diâmetro do Disco",
		inputType: "select",
		categorySlug: "serras-eletricas",
		unit: "mm",
		options: {
			kind: "select",
			options: [
				{ label: "110 mm", value: "110" },
				{ label: "150 mm", value: "150" },
				{ label: "185 mm", value: "185" },
				{ label: "235 mm", value: "235" },
			],
		},
		sortOrder: 0,
	},
	{
		slug: "profundidade-corte",
		label: "Profundidade de Corte",
		inputType: "number",
		categorySlug: "serras-eletricas",
		unit: "mm",
		sortOrder: 1,
	},
	// esmerilhadeiras
	{
		slug: "diametro-disco-esm",
		label: "Diâmetro do Disco",
		inputType: "select",
		categorySlug: "esmerilhadeiras",
		unit: "mm",
		options: {
			kind: "select",
			options: [
				{ label: "115 mm", value: "115" },
				{ label: "125 mm", value: "125" },
				{ label: "180 mm", value: "180" },
				{ label: "230 mm", value: "230" },
			],
		},
		sortOrder: 0,
	},
	// ferramentas-manuais
	{
		slug: "material-cabo",
		label: "Material do Cabo",
		inputType: "select",
		categorySlug: "ferramentas-manuais",
		options: {
			kind: "select",
			options: [
				{ label: "Madeira", value: "madeira" },
				{ label: "Fibra de vidro", value: "fibra_vidro" },
				{ label: "Borracha", value: "borracha" },
				{ label: "Aço", value: "aco" },
			],
		},
		sortOrder: 0,
	},
	{
		slug: "comprimento-total",
		label: "Comprimento Total",
		inputType: "number",
		categorySlug: "ferramentas-manuais",
		unit: "mm",
		sortOrder: 1,
	},
	// compressores
	{
		slug: "pressao-max",
		label: "Pressão Máxima",
		inputType: "number",
		categorySlug: "compressores",
		unit: "bar",
		sortOrder: 0,
	},
	{
		slug: "capacidade-tanque",
		label: "Capacidade do Tanque",
		inputType: "number",
		categorySlug: "compressores",
		unit: "L",
		sortOrder: 1,
	},
	// acessorios
	{
		slug: "cor-acabamento",
		label: "Cor de Acabamento",
		inputType: "color",
		categorySlug: "acessorios",
		options: {
			kind: "color",
			swatches: [
				{ hex: "#1a1a1a", label: "Preto", value: "preto" },
				{ hex: "#c0c0c0", label: "Prata", value: "prata" },
				{ hex: "#FFD700", label: "Amarelo", value: "amarelo" },
				{ hex: "#E8392C", label: "Vermelho", value: "vermelho" },
			],
		},
		sortOrder: 0,
	},
	{
		slug: "compativel-bateria",
		label: "Compatível com Bateria",
		inputType: "text",
		categorySlug: "acessorios",
		sortOrder: 1,
	},
];

// ---------------------------------------------------------------------------
// 3. Suppliers (6)
// ---------------------------------------------------------------------------

const SUPPLIER_NAMES = [
	"Ferramentas Ciser Distribuidora",
	"Grupo Tramontina Industrial",
	"Vonder Importações e Comércio",
	"Stanley Black & Decker Brasil",
	"Bosch Ferramentas Ltda",
	"Makita do Brasil Ferramentas",
];

// ---------------------------------------------------------------------------
// 4. Tools (~11) + variants (~20) + images
// ---------------------------------------------------------------------------

interface VariantDef {
	barcode: string;
	isDefault: boolean;
	priceAmount: string;
	sku: string;
	sortOrder: number;
	voltage?: "127V" | "220V" | "Bivolt" | "380V";
}

interface ToolDef {
	// atributos a setar (slug → valor conforme inputType)
	attributeValues: {
		slug: string;
		valueText?: string;
		valueNumeric?: string;
		valueNumericMax?: string;
		valueBool?: boolean;
	}[];
	description: string;
	heightCm?: string;
	imageCount: number;
	lengthCm?: string;
	model: string;
	name: string;
	powerWatts?: number;
	primaryCategorySlug: string;
	secondaryCategorySlug?: string;
	slug: string;
	status: "draft" | "active" | "discontinued";
	supplierIndex: number; // index em SUPPLIER_NAMES
	variants: VariantDef[];
	visibleOnSite: boolean;
	weightKg?: string;
	widthCm?: string;
}

// Peso/dimensões de demonstração (aleatórios plausíveis) para tools sem valor
// explícito — peso e dimensões são NOT NULL (consumidos pela loja para frete).
function randomWeightKg(): string {
	return (0.5 + Math.random() * 24.5).toFixed(3); // 0,5–25 kg
}
function randomDimCm(): string {
	return (10 + Math.random() * 70).toFixed(2); // 10–80 cm
}

const TOOLS: ToolDef[] = [
	{
		name: "Furadeira de Impacto 650W",
		slug: "furadeira-de-impacto-650w",
		description:
			"Furadeira de impacto com mandril de 13mm, velocidade variável e reversível. Ideal para concreto e alvenaria.",
		model: "DHP453Z",
		status: "active",
		visibleOnSite: true,
		supplierIndex: 5,
		powerWatts: 650,
		weightKg: "1.700",
		primaryCategorySlug: "furadeiras-de-impacto",
		variants: [
			{
				sku: "DHP453Z-127",
				barcode: "DHP453Z-127",
				voltage: "127V",
				priceAmount: "349.90",
				isDefault: true,
				sortOrder: 0,
			},
			{
				sku: "DHP453Z-220",
				barcode: "DHP453Z-220",
				voltage: "220V",
				priceAmount: "349.90",
				isDefault: false,
				sortOrder: 1,
			},
		],
		imageCount: 2,
		attributeValues: [
			{ slug: "potencia-w", valueNumeric: "650" },
			{
				slug: "velocidade-rpm-range",
				valueNumeric: "0",
				valueNumericMax: "2800",
			},
			{ slug: "capacidade-mandril", valueText: "13mm" },
			{ slug: "tem-percussao", valueBool: true },
		],
	},
	{
		name: "Parafusadeira a Bateria 18V",
		slug: "parafusadeira-a-bateria-18v",
		description:
			"Parafusadeira sem fio 18V com par de torque de 40 Nm, embreagem de 21 posições e mandril 13mm.",
		model: "DDF458Z",
		status: "active",
		visibleOnSite: true,
		supplierIndex: 5,
		powerWatts: 0,
		weightKg: "1.800",
		primaryCategorySlug: "parafusadeiras-a-bateria",
		variants: [
			{
				sku: "DDF458Z-18V",
				barcode: "DDF458Z-18V",
				voltage: undefined,
				priceAmount: "589.90",
				isDefault: true,
				sortOrder: 0,
			},
		],
		imageCount: 2,
		attributeValues: [
			{ slug: "capacidade-mandril", valueText: "13mm" },
			{ slug: "tem-percussao", valueBool: false },
		],
	},
	{
		name: 'Serra Circular 7-1/4" 1400W',
		slug: "serra-circular-7-1-4-1400w",
		description:
			"Serra circular com disco de 185mm, profundidade de corte 65mm a 90° e placa de base de alumínio.",
		model: "GKS185-S",
		status: "active",
		visibleOnSite: true,
		supplierIndex: 4,
		powerWatts: 1400,
		weightKg: "4.200",
		primaryCategorySlug: "serras-circulares",
		variants: [
			{
				sku: "GKS185S-127",
				barcode: "GKS185S-127",
				voltage: "127V",
				priceAmount: "849.00",
				isDefault: true,
				sortOrder: 0,
			},
			{
				sku: "GKS185S-220",
				barcode: "GKS185S-220",
				voltage: "220V",
				priceAmount: "849.00",
				isDefault: false,
				sortOrder: 1,
			},
			{
				sku: "GKS185S-BIV",
				barcode: "GKS185S-BIV",
				voltage: "Bivolt",
				priceAmount: "899.00",
				isDefault: false,
				sortOrder: 2,
			},
		],
		imageCount: 3,
		attributeValues: [
			{ slug: "potencia-w", valueNumeric: "1400" },
			{ slug: "diametro-disco", valueText: "185" },
			{ slug: "profundidade-corte", valueNumeric: "65" },
		],
	},
	{
		name: "Serra Tico-Tico 500W",
		slug: "serra-tico-tico-500w",
		description:
			"Serra tico-tico com 500W, curso 26mm, velocidade variável e guia de paralelo incluído.",
		model: "ST8000E",
		status: "active",
		visibleOnSite: true,
		supplierIndex: 3,
		powerWatts: 500,
		weightKg: "2.200",
		primaryCategorySlug: "serras-tico-tico",
		variants: [
			{
				sku: "ST8000E-127",
				barcode: "ST8000E-127",
				voltage: "127V",
				priceAmount: "399.90",
				isDefault: true,
				sortOrder: 0,
			},
			{
				sku: "ST8000E-220",
				barcode: "ST8000E-220",
				voltage: "220V",
				priceAmount: "399.90",
				isDefault: false,
				sortOrder: 1,
			},
		],
		imageCount: 1,
		attributeValues: [{ slug: "potencia-w", valueNumeric: "500" }],
	},
	{
		name: 'Esmerilhadeira Angular 4-1/2" 720W',
		slug: "esmerilhadeira-angular-4-1-2-720w",
		description:
			"Esmerilhadeira angular com disco 115mm, 720W, proteção contra reinicialização acidental.",
		model: "GWS720-115",
		status: "active",
		visibleOnSite: true,
		supplierIndex: 4,
		powerWatts: 720,
		weightKg: "1.900",
		primaryCategorySlug: "esmerilhadeiras",
		variants: [
			{
				sku: "GWS720-115-BIV",
				barcode: "GWS720-115-BIV",
				voltage: "Bivolt",
				priceAmount: "299.90",
				isDefault: true,
				sortOrder: 0,
			},
		],
		imageCount: 2,
		attributeValues: [
			{ slug: "potencia-w", valueNumeric: "720" },
			{ slug: "diametro-disco-esm", valueText: "115" },
		],
	},
	{
		name: "Lixadeira Orbital 300W",
		slug: "lixadeira-orbital-300w",
		description:
			"Lixadeira orbital 300W com vibração de 12.000 OPM, base 93×185mm, sistema de coleta de pó.",
		model: "GSS280AVE",
		status: "active",
		visibleOnSite: true,
		supplierIndex: 4,
		powerWatts: 300,
		weightKg: "1.400",
		primaryCategorySlug: "lixadeiras",
		variants: [
			{
				sku: "GSS280AVE-127",
				barcode: "GSS280AVE-127",
				voltage: "127V",
				priceAmount: "249.90",
				isDefault: true,
				sortOrder: 0,
			},
			{
				sku: "GSS280AVE-220",
				barcode: "GSS280AVE-220",
				voltage: "220V",
				priceAmount: "249.90",
				isDefault: false,
				sortOrder: 1,
			},
		],
		imageCount: 1,
		attributeValues: [
			{ slug: "potencia-w", valueNumeric: "300" },
			{
				slug: "velocidade-rpm-range",
				valueNumeric: "7000",
				valueNumericMax: "12000",
			},
		],
	},
	{
		name: "Compressor de Ar 100L 2HP",
		slug: "compressor-de-ar-100l-2hp",
		description:
			"Compressor de ar vertical 100L, motor 2HP, pressão máxima 8,5 bar, produção 8,5 pcm.",
		model: "CSA100B",
		status: "active",
		visibleOnSite: true,
		supplierIndex: 2,
		weightKg: "58.000",
		primaryCategorySlug: "compressores",
		variants: [
			{
				sku: "CSA100B-127",
				barcode: "CSA100B-127",
				voltage: "127V",
				priceAmount: "1849.00",
				isDefault: true,
				sortOrder: 0,
			},
			{
				sku: "CSA100B-220",
				barcode: "CSA100B-220",
				voltage: "220V",
				priceAmount: "1849.00",
				isDefault: false,
				sortOrder: 1,
			},
		],
		imageCount: 2,
		attributeValues: [
			{ slug: "pressao-max", valueNumeric: "8.5" },
			{ slug: "capacidade-tanque", valueNumeric: "100" },
		],
	},
	{
		name: "Martelo Carpinteiro 27mm",
		slug: "martelo-carpinteiro-27mm",
		description:
			"Martelo carpinteiro 27mm, cabeça em aço forjado, cabo em madeira de hickory.",
		model: "MC-27H",
		status: "active",
		visibleOnSite: true,
		supplierIndex: 1,
		weightKg: "0.680",
		primaryCategorySlug: "martelos",
		secondaryCategorySlug: "ferramentas-manuais",
		variants: [
			{
				sku: "MC-27H-UN",
				barcode: "MC-27H-UN",
				voltage: undefined,
				priceAmount: "89.90",
				isDefault: true,
				sortOrder: 0,
			},
		],
		imageCount: 1,
		attributeValues: [
			{ slug: "material-cabo", valueText: "madeira" },
			{ slug: "comprimento-total", valueNumeric: "310" },
		],
	},
	{
		name: 'Alicate Universal 8"',
		slug: "alicate-universal-8",
		description:
			"Alicate universal 8 polegadas com cabo bicomponente isolado e queixo de corte.",
		model: "AU-8-BC",
		status: "active",
		visibleOnSite: true,
		supplierIndex: 0,
		weightKg: "0.280",
		primaryCategorySlug: "alicates",
		variants: [
			{
				sku: "AU-8-BC-UN",
				barcode: "AU-8-BC-UN",
				voltage: undefined,
				priceAmount: "49.90",
				isDefault: true,
				sortOrder: 0,
			},
		],
		imageCount: 1,
		attributeValues: [
			{ slug: "material-cabo", valueText: "borracha" },
			{ slug: "comprimento-total", valueNumeric: "200" },
		],
	},
	{
		name: "Plaina Elétrica 82mm 600W",
		slug: "plaina-eletrica-82mm-600w",
		description:
			"Plaina elétrica 82mm, 600W, profundidade de corte ajustável até 2mm, guia de paralelo e bolsa de cavacos.",
		model: "PE-82600",
		status: "discontinued",
		visibleOnSite: false,
		supplierIndex: 3,
		powerWatts: 600,
		weightKg: "2.800",
		primaryCategorySlug: "plainas-eletricas",
		variants: [
			{
				sku: "PE-82600-127",
				barcode: "PE-82600-127",
				voltage: "127V",
				priceAmount: "479.90",
				isDefault: true,
				sortOrder: 0,
			},
		],
		imageCount: 1,
		attributeValues: [{ slug: "potencia-w", valueNumeric: "600" }],
	},
	{
		name: 'Disco de Corte Inox 4-1/2"',
		slug: "disco-de-corte-inox-4-1-2",
		description:
			"Disco de corte para inox 115×1,0×22,23mm. Pacote com 10 unidades.",
		model: "DC-115-INOX-10",
		status: "active",
		visibleOnSite: true,
		supplierIndex: 0,
		weightKg: "0.120",
		primaryCategorySlug: "discos",
		secondaryCategorySlug: "acessorios",
		variants: [
			{
				sku: "DC-115-INOX-10-UN",
				barcode: "DC-115-INOX-10-UN",
				voltage: undefined,
				priceAmount: "69.90",
				isDefault: true,
				sortOrder: 0,
			},
		],
		imageCount: 1,
		attributeValues: [{ slug: "cor-acabamento", valueText: "prata" }],
	},
];

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: script de seed com múltiplas inserções sequenciais de entidades relacionadas — complexidade inerente ao domínio de bootstrap
export async function seedCatalog(tx: Tx, ctx: SeedContext): Promise<void> {
	// Imagens das tools: reaproveita os objetos `.webp` que JÁ existem no bucket
	// `tool-images`. O seed não faz upload — fabricar paths `seed-*.jpg` deixava
	// todos os cards sem imagem (objeto inexistente → 400/503). Referenciar os
	// arquivos reais garante render. Fallback: bucket vazio → tool sem imagem
	// (melhor que link morto).
	const storageBase = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tool-images`;
	const existingImages = await tx.execute<{ name: string }>(
		sql`SELECT name FROM storage.objects
			WHERE bucket_id = 'tool-images' AND name LIKE '%.webp'
			ORDER BY created_at`
	);
	const imageNames = existingImages.rows.map((r) => r.name);
	let imageCursor = 0;

	// --- 1. Categorias ---
	// Inserir em ordem topológica (pais antes de filhos).
	// O trigger PL/pgSQL materializa path e depth — passar placeholders.
	const roots = CATEGORIES.filter((c) => c.parentSlug === null);
	const children = CATEGORIES.filter((c) => c.parentSlug !== null);

	for (const cat of roots) {
		const id = crypto.randomUUID();
		await tx.insert(category).values({
			id,
			slug: cat.slug,
			name: cat.name,
			parentId: null,
			sortOrder: cat.sortOrder ?? 0,
			path: "/", // trigger vai sobrescrever
			depth: 0, // trigger vai sobrescrever
		});
		ctx.categoryIdBySlug[cat.slug] = id;
	}

	// Filhas de primeiro nível (parent é uma raiz)
	const firstLevelChildren = children.filter(
		(c) => CATEGORIES.find((x) => x.slug === c.parentSlug)?.parentSlug === null
	);
	for (const cat of firstLevelChildren) {
		const parentId = ctx.categoryIdBySlug[cat.parentSlug as string];
		const id = crypto.randomUUID();
		await tx.insert(category).values({
			id,
			slug: cat.slug,
			name: cat.name,
			parentId,
			sortOrder: cat.sortOrder ?? 0,
			path: "/", // trigger vai sobrescrever
			depth: 0, // trigger vai sobrescrever
		});
		ctx.categoryIdBySlug[cat.slug] = id;
	}

	// Filhas de segundo nível (parent é uma filha de primeiro nível)
	const secondLevelChildren = children.filter(
		(c) => CATEGORIES.find((x) => x.slug === c.parentSlug)?.parentSlug !== null
	);
	for (const cat of secondLevelChildren) {
		const parentId = ctx.categoryIdBySlug[cat.parentSlug as string];
		const id = crypto.randomUUID();
		await tx.insert(category).values({
			id,
			slug: cat.slug,
			name: cat.name,
			parentId,
			sortOrder: cat.sortOrder ?? 0,
			path: "/", // trigger vai sobrescrever
			depth: 0, // trigger vai sobrescrever
		});
		ctx.categoryIdBySlug[cat.slug] = id;
	}

	// --- 2. Buscar paths materializados pelo trigger ---
	// Após inserir todas as categorias, o trigger já materializou path e depth.
	// Montamos um mapa slug → path para filtrar atributos elegíveis por tool.
	const categoryRows = await tx.execute<{
		id: string;
		slug: string;
		path: string;
	}>(sql`SELECT id, slug, path FROM category`);
	const pathBySlug: Record<string, string> = {};
	const pathById: Record<string, string> = {};
	for (const row of categoryRows.rows) {
		pathBySlug[row.slug] = row.path;
		pathById[row.id] = row.path;
	}

	// --- 3. Attribute definitions ---
	for (const attr of ATTRIBUTES) {
		const id = crypto.randomUUID();
		const catId = ctx.categoryIdBySlug[attr.categorySlug];
		if (!catId) {
			throw new Error(`Categoria não encontrada: ${attr.categorySlug}`);
		}
		await tx.insert(attributeDefinition).values({
			id,
			slug: attr.slug,
			label: attr.label,
			inputType: attr.inputType,
			categoryId: catId,
			unit: attr.unit ?? null,
			options: attr.options ?? null,
			isRequired: attr.isRequired ?? false,
			sortOrder: attr.sortOrder ?? 0,
		});
		ctx.attributeIdBySlug[attr.slug] = id;
	}

	// Mapa: attributeId → categoryId (para checar elegibilidade)
	const attrCategoryId: Record<string, string> = {};
	for (const attr of ATTRIBUTES) {
		const attrId = ctx.attributeIdBySlug[attr.slug];
		const catId = ctx.categoryIdBySlug[attr.categorySlug];
		if (attrId && catId) {
			attrCategoryId[attrId] = catId;
		}
	}

	// --- 4. Suppliers ---
	for (const name of SUPPLIER_NAMES) {
		const id = crypto.randomUUID();
		await tx.insert(supplier).values({ id, name });
		ctx.supplierIds.push(id);
	}

	// --- 5. Tools + variants + images ---
	for (const toolDef of TOOLS) {
		const toolId = crypto.randomUUID();

		await tx.insert(tool).values({
			id: toolId,
			name: toolDef.name,
			slug: toolDef.slug,
			description: toolDef.description,
			model: toolDef.model,
			status: toolDef.status,
			visibleOnSite: toolDef.visibleOnSite,
			powerWatts: toolDef.powerWatts ?? null,
			weightKg: toolDef.weightKg ?? randomWeightKg(),
			lengthCm: toolDef.lengthCm ?? randomDimCm(),
			widthCm: toolDef.widthCm ?? randomDimCm(),
			heightCm: toolDef.heightCm ?? randomDimCm(),
		});
		ctx.toolIds.push(toolId);
		ctx.variantIdsByTool[toolId] = [];

		// Variants
		for (const varDef of toolDef.variants) {
			const variantId = crypto.randomUUID();
			await tx.insert(toolVariant).values({
				id: variantId,
				toolId,
				sku: varDef.sku,
				barcode: varDef.barcode,
				voltage: varDef.voltage ?? null,
				priceAmount: varDef.priceAmount,
				isDefault: varDef.isDefault,
				sortOrder: varDef.sortOrder,
			});
			ctx.variantIdsByTool[toolId].push(variantId);
			if (varDef.isDefault) {
				ctx.defaultVariantByTool[toolId] = variantId;
			}
		}

		// Images — reaproveita objetos reais do bucket (ver topo da função).
		for (let i = 0; i < toolDef.imageCount && imageNames.length > 0; i++) {
			const name = imageNames[imageCursor % imageNames.length];
			imageCursor++;
			await tx.insert(toolImage).values({
				id: crypto.randomUUID(),
				toolId,
				url: `${storageBase}/${name}`,
				sortOrder: i,
			});
		}
	}

	// --- 6. tool_category + attribute assignments + values ---
	for (const toolDef of TOOLS) {
		// Achar o toolId pelo slug (na ordem de inserção)
		const toolIndex = TOOLS.indexOf(toolDef);
		const toolId = ctx.toolIds[toolIndex];
		if (!toolId) {
			throw new Error(`toolId ausente no índice ${toolIndex}`);
		}

		// tool_category primária
		const primaryCatId = ctx.categoryIdBySlug[toolDef.primaryCategorySlug];
		if (!primaryCatId) {
			throw new Error(
				`Categoria primária não encontrada: ${toolDef.primaryCategorySlug}`
			);
		}
		await tx.insert(toolCategory).values({
			toolId,
			categoryId: primaryCatId,
			isPrimary: true,
		});
		ctx.primaryCategoryByTool[toolId] = primaryCatId;

		// Categoria secundária opcional
		if (toolDef.secondaryCategorySlug) {
			const secCatId = ctx.categoryIdBySlug[toolDef.secondaryCategorySlug];
			if (secCatId) {
				await tx.insert(toolCategory).values({
					toolId,
					categoryId: secCatId,
					isPrimary: false,
				});
			}
		}

		// Determinar o path da primary category para filtrar atributos elegíveis
		const primaryPath = pathById[primaryCatId];
		if (!primaryPath) {
			throw new Error(`Path não encontrado para categoria: ${primaryCatId}`);
		}

		// Construir set de IDs de categorias no path da primary
		// path formato: /root-slug/child-slug/...
		// Um atributo é elegível se sua categoryId está no caminho do root até a primary.
		const pathCategoryIds = new Set<string>();
		for (const [catId, catPath] of Object.entries(pathById)) {
			if (primaryPath === catPath || primaryPath.startsWith(`${catPath}/`)) {
				pathCategoryIds.add(catId);
			}
		}

		// Inserir assignments + values apenas para atributos elegíveis
		let sortOrder = 0;
		for (const av of toolDef.attributeValues) {
			const attrId = ctx.attributeIdBySlug[av.slug];
			if (!attrId) {
				continue;
			}
			const attrCatId = attrCategoryId[attrId];
			if (!attrCatId) {
				continue;
			}
			if (!pathCategoryIds.has(attrCatId)) {
				continue;
			}

			// tool_attribute_assignment
			await tx.insert(toolAttributeAssignment).values({
				toolId,
				attributeId: attrId,
				sortOrder,
			});

			// tool_attribute_value
			await tx.insert(toolAttributeValue).values({
				toolId,
				attributeId: attrId,
				valueText: av.valueText ?? null,
				valueNumeric: av.valueNumeric ?? null,
				valueNumericMax: av.valueNumericMax ?? null,
				valueBool: av.valueBool ?? null,
			});

			sortOrder++;
		}
	}
}
