// packages/db/scripts/ready-to-ship-marks.ts
// Marcas que ligam seed-ready-to-ship.ts ao seu unseed. Vivem num módulo à
// parte porque ambos os scripts executam `main()` no top-level: importar um do
// outro dispararia o script inteiro no import.

/** Prefixo dos pedidos criados pelo seed — âncora do unseed. */
export const SEED_ORDER_PREFIX = "EM-TEST-91";

/** Marca das movimentações de carga inicial de estoque — âncora do unseed. */
export const SEED_STOCK_NOTE = "[EM-TEST-91] carga inicial de teste";
