/**
 * Presets de faixa de CEP para preencher rapidamente o editor.
 *
 * As faixas por UF são **aproximadas** — usam a faixa contígua principal de
 * cada estado (tabela de faixas-CEP dos Correios). Estados com faixas
 * interligadas (DF/GO, RO dentro de GO, AM com múltiplos blocos) ficam com a
 * faixa principal. São sugestões editáveis, não roteamento autoritativo.
 */

export type CepPreset = { from: string; label: string; to: string };

export const BRASIL_PRESET: CepPreset = {
	from: "00000000",
	to: "99999999",
	label: "Brasil",
};

export interface UfPreset {
	from: string;
	name: string;
	to: string;
	uf: string;
}

export const UF_CEP_PRESETS: UfPreset[] = [
	{ uf: "AC", name: "Acre", from: "69900000", to: "69999999" },
	{ uf: "AL", name: "Alagoas", from: "57000000", to: "57999999" },
	{ uf: "AP", name: "Amapá", from: "68900000", to: "68999999" },
	{ uf: "AM", name: "Amazonas", from: "69000000", to: "69899999" },
	{ uf: "BA", name: "Bahia", from: "40000000", to: "48999999" },
	{ uf: "CE", name: "Ceará", from: "60000000", to: "63999999" },
	{ uf: "DF", name: "Distrito Federal", from: "70000000", to: "72799999" },
	{ uf: "ES", name: "Espírito Santo", from: "29000000", to: "29999999" },
	{ uf: "GO", name: "Goiás", from: "72800000", to: "76799999" },
	{ uf: "MA", name: "Maranhão", from: "65000000", to: "65999999" },
	{ uf: "MT", name: "Mato Grosso", from: "78000000", to: "78899999" },
	{ uf: "MS", name: "Mato Grosso do Sul", from: "79000000", to: "79999999" },
	{ uf: "MG", name: "Minas Gerais", from: "30000000", to: "39999999" },
	{ uf: "PA", name: "Pará", from: "66000000", to: "68899999" },
	{ uf: "PB", name: "Paraíba", from: "58000000", to: "58999999" },
	{ uf: "PR", name: "Paraná", from: "80000000", to: "87999999" },
	{ uf: "PE", name: "Pernambuco", from: "50000000", to: "56999999" },
	{ uf: "PI", name: "Piauí", from: "64000000", to: "64999999" },
	{ uf: "RJ", name: "Rio de Janeiro", from: "20000000", to: "28999999" },
	{ uf: "RN", name: "Rio Grande do Norte", from: "59000000", to: "59999999" },
	{ uf: "RS", name: "Rio Grande do Sul", from: "90000000", to: "99999999" },
	{ uf: "RO", name: "Rondônia", from: "76800000", to: "76999999" },
	{ uf: "RR", name: "Roraima", from: "69300000", to: "69399999" },
	{ uf: "SC", name: "Santa Catarina", from: "88000000", to: "89999999" },
	{ uf: "SP", name: "São Paulo", from: "01000000", to: "19999999" },
	{ uf: "SE", name: "Sergipe", from: "49000000", to: "49999999" },
	{ uf: "TO", name: "Tocantins", from: "77000000", to: "77999999" },
];
