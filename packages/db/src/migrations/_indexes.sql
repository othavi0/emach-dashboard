-- Índices para cursor-based pagination com sort por created_at DESC.
-- Drizzle Kit não gera índices avulsos — aplicar via runner `bun db:apply-indexes`.

CREATE INDEX IF NOT EXISTS tool_created_idx
	ON tool (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS branch_created_idx
	ON branch (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS promotion_created_idx
	ON promotion (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS supplier_created_idx
	ON supplier (created_at DESC, id DESC);

-- order, review já têm índices compostos com created_at
-- (ver schema/orders.ts:95 order_status_created_idx e schema/reviews.ts:62 review_status_created_idx).
-- tool_variant: PK em id já serve como tiebreaker default.
