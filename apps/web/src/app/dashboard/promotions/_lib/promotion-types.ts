// Tipos públicos de promoção compartilhados entre _lib e data.ts (Task 5).
// Sem diretiva — importável tanto de server quanto de testes.

export type PromotionStatus = "active" | "scheduled" | "expired" | "inactive";

export type PromotionSort =
	| "createdDesc"
	| "createdAsc"
	| "discountDesc"
	| "discountAsc"
	| "endsAtAsc";
