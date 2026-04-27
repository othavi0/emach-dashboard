-- Trigger: prevent_category_cycle (anti-ciclo + path/depth materializados)
CREATE OR REPLACE FUNCTION prevent_category_cycle() RETURNS trigger AS $$
DECLARE
  cycle_found boolean;
  parent_path text;
  parent_depth integer;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    NEW.path := '/' || NEW.slug;
    RETURN NEW;
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, 1 AS hops FROM category WHERE id = NEW.parent_id
    UNION ALL
    SELECT c.id, c.parent_id, a.hops + 1
    FROM category c JOIN ancestors a ON c.id = a.parent_id
    WHERE a.hops < 10
  )
  SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = NEW.id) INTO cycle_found;

  IF cycle_found THEN
    RAISE EXCEPTION 'category cycle detected for id %', NEW.id USING ERRCODE = 'P0001';
  END IF;

  SELECT path, depth INTO parent_path, parent_depth FROM category WHERE id = NEW.parent_id;
  NEW.path := parent_path || '/' || NEW.slug;
  NEW.depth := parent_depth + 1;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_category_cycle ON category;
CREATE TRIGGER trg_prevent_category_cycle
BEFORE INSERT OR UPDATE OF parent_id, slug ON category
FOR EACH ROW EXECUTE FUNCTION prevent_category_cycle();

-- Trigger AFTER: propaga path/depth para descendentes via re-trigger BEFORE no-op.
CREATE OR REPLACE FUNCTION cascade_category_path() RETURNS trigger AS $$
BEGIN
  IF NEW.path IS DISTINCT FROM OLD.path THEN
    UPDATE category SET parent_id = parent_id WHERE parent_id = NEW.id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_category_path ON category;
CREATE TRIGGER trg_cascade_category_path
AFTER UPDATE OF path ON category
FOR EACH ROW EXECUTE FUNCTION cascade_category_path();

-- Idempotência de débito de venda
CREATE UNIQUE INDEX IF NOT EXISTS stock_movement_sale_idempotency
ON stock_movement (order_item_id)
WHERE reason = 'saida_venda' AND order_item_id IS NOT NULL;
