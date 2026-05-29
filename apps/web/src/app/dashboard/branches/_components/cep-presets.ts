/**
 * Presets de faixa de CEP para preencher rapidamente o editor.
 *
 * Faixas por UF conforme a tabela oficial dos Correios (faixa de CEP por
 * estado). Estados com áreas postais interligadas têm **múltiplas faixas**
 * (AM, DF, GO) — adicionadas como entradas separadas. São sugestões editáveis,
 * não roteamento autoritativo.
 *
 * Fontes: Correios (busca de faixa de CEP por UF) + Wikipedia (CEP).
 */

export type CepRange = { from: string; to: string };

export const BRASIL_PRESET: CepRange & { label: string } = {
	from: "00000000",
	to: "99999999",
	label: "Brasil",
};

export interface UfPreset {
	name: string;
	ranges: CepRange[];
	uf: string;
}

export const UF_CEP_PRESETS: UfPreset[] = [
	{ uf: "AC", name: "Acre", ranges: [{ from: "69900000", to: "69999999" }] },
	{ uf: "AL", name: "Alagoas", ranges: [{ from: "57000000", to: "57999999" }] },
	{
		uf: "AM",
		name: "Amazonas",
		ranges: [
			{ from: "69000000", to: "69299999" },
			{ from: "69400000", to: "69899999" },
		],
	},
	{ uf: "AP", name: "Amapá", ranges: [{ from: "68900000", to: "68999999" }] },
	{ uf: "BA", name: "Bahia", ranges: [{ from: "40000000", to: "48999999" }] },
	{ uf: "CE", name: "Ceará", ranges: [{ from: "60000000", to: "63999999" }] },
	{
		uf: "DF",
		name: "Distrito Federal",
		ranges: [
			{ from: "70000000", to: "72799999" },
			{ from: "73000000", to: "73699999" },
		],
	},
	{
		uf: "ES",
		name: "Espírito Santo",
		ranges: [{ from: "29000000", to: "29999999" }],
	},
	{
		uf: "GO",
		name: "Goiás",
		ranges: [
			{ from: "72800000", to: "72999999" },
			{ from: "73700000", to: "76799999" },
		],
	},
	{
		uf: "MA",
		name: "Maranhão",
		ranges: [{ from: "65000000", to: "65999999" }],
	},
	{
		uf: "MT",
		name: "Mato Grosso",
		ranges: [{ from: "78000000", to: "78899999" }],
	},
	{
		uf: "MS",
		name: "Mato Grosso do Sul",
		ranges: [{ from: "79000000", to: "79999999" }],
	},
	{
		uf: "MG",
		name: "Minas Gerais",
		ranges: [{ from: "30000000", to: "39999999" }],
	},
	{ uf: "PA", name: "Pará", ranges: [{ from: "66000000", to: "68899999" }] },
	{ uf: "PB", name: "Paraíba", ranges: [{ from: "58000000", to: "58999999" }] },
	{ uf: "PR", name: "Paraná", ranges: [{ from: "80000000", to: "87999999" }] },
	{
		uf: "PE",
		name: "Pernambuco",
		ranges: [{ from: "50000000", to: "56999999" }],
	},
	{ uf: "PI", name: "Piauí", ranges: [{ from: "64000000", to: "64999999" }] },
	{
		uf: "RJ",
		name: "Rio de Janeiro",
		ranges: [{ from: "20000000", to: "28999999" }],
	},
	{
		uf: "RN",
		name: "Rio Grande do Norte",
		ranges: [{ from: "59000000", to: "59999999" }],
	},
	{
		uf: "RS",
		name: "Rio Grande do Sul",
		ranges: [{ from: "90000000", to: "99999999" }],
	},
	{
		uf: "RO",
		name: "Rondônia",
		ranges: [{ from: "76800000", to: "76999999" }],
	},
	{ uf: "RR", name: "Roraima", ranges: [{ from: "69300000", to: "69399999" }] },
	{
		uf: "SC",
		name: "Santa Catarina",
		ranges: [{ from: "88000000", to: "89999999" }],
	},
	{
		uf: "SP",
		name: "São Paulo",
		ranges: [{ from: "01000000", to: "19999999" }],
	},
	{ uf: "SE", name: "Sergipe", ranges: [{ from: "49000000", to: "49999999" }] },
	{
		uf: "TO",
		name: "Tocantins",
		ranges: [{ from: "77000000", to: "77999999" }],
	},
];
