// packages/db/scripts/seed/random.ts
// PRNG determinístico para seeds — mulberry32 com seed fixa.
// Substitui Math.random() em inventory.ts e sales.ts para garantir
// que duas execuções consecutivas produzam as mesmas contagens.

function mulberry32(seed: number): () => number {
	let s = seed;
	return () => {
		// biome-ignore lint/suspicious/noBitwiseOperators: mulberry32 PRNG — algoritmo requer operações bit a bit para mixing de bits do estado
		s |= 0;
		// biome-ignore lint/suspicious/noBitwiseOperators: mulberry32 PRNG — operação bit a bit necessária para truncamento inteiro de 32 bits
		s = (s + 0x6d_2b_79_f5) | 0;
		// biome-ignore lint/suspicious/noBitwiseOperators: mulberry32 PRNG — mixing de bits via XOR e shift necessários para qualidade do PRNG
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		// biome-ignore lint/suspicious/noBitwiseOperators: mulberry32 PRNG — mixing de bits via XOR e shift necessários para qualidade do PRNG
		// biome-ignore lint/style/useShorthandAssign: operadores explícitos mantêm legibilidade do algoritmo
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		// biome-ignore lint/suspicious/noBitwiseOperators: mulberry32 PRNG — shift e truncamento para normalizar resultado em [0, 2^32)
		return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
	};
}

// Seed fixa baseada na data de criação do seed demo (YYYYMMDD).
const _rng = mulberry32(20_260_517);

/** Número pseudoaleatório em [0, 1). */
export function rng(): number {
	return _rng();
}

/** Inteiro pseudoaleatório em [min, max] (inclusivo). */
export function randInt(min: number, max: number): number {
	return Math.floor(rng() * (max - min + 1)) + min;
}

/** Retorna um elemento aleatório do array. Lança se vazio. */
export function pick<T>(arr: T[]): T {
	if (arr.length === 0) {
		throw new Error("pick() chamado em array vazio");
	}
	const idx = Math.floor(rng() * arr.length);
	return arr[idx] as T;
}

/** Retorna até `n` elementos aleatórios (sem repetição) do array. */
export function pickN<T>(arr: T[], n: number): T[] {
	const shuffled = [...arr].sort(() => rng() - 0.5);
	return shuffled.slice(0, Math.min(n, shuffled.length));
}
