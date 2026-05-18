-- Trigger: prevent_category_cycle (anti-ciclo + path/depth materializados)
CREATE OR REPLACE FUNCTION prevent_category_cycle() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
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
    SELECT id, parent_id, 1 AS hops FROM public.category WHERE id = NEW.parent_id
    UNION ALL
    SELECT c.id, c.parent_id, a.hops + 1
    FROM public.category c JOIN ancestors a ON c.id = a.parent_id
    WHERE a.hops < 10
  )
  SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = NEW.id) INTO cycle_found;

  IF cycle_found THEN
    RAISE EXCEPTION 'category cycle detected for id %', NEW.id USING ERRCODE = 'P0001';
  END IF;

  SELECT path, depth INTO parent_path, parent_depth FROM public.category WHERE id = NEW.parent_id;
  NEW.path := parent_path || '/' || NEW.slug;
  NEW.depth := parent_depth + 1;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_category_cycle ON category;
CREATE TRIGGER trg_prevent_category_cycle
BEFORE INSERT OR UPDATE OF parent_id, slug ON category
FOR EACH ROW EXECUTE FUNCTION prevent_category_cycle();

-- Trigger AFTER: propaga path/depth para descendentes via re-trigger BEFORE no-op.
CREATE OR REPLACE FUNCTION cascade_category_path() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.path IS DISTINCT FROM OLD.path THEN
    UPDATE public.category SET parent_id = parent_id WHERE parent_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cascade_category_path ON category;
CREATE TRIGGER trg_cascade_category_path
AFTER UPDATE OF path ON category
FOR EACH ROW EXECUTE FUNCTION cascade_category_path();

-- Sequence para número do pedido (formato YYYY-000NNN)
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- =============================================================
-- client.last_seen_at: throttle 5min em update via client_session
-- =============================================================
CREATE OR REPLACE FUNCTION update_client_last_seen() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  current_last timestamp;
BEGIN
  SELECT last_seen_at INTO current_last FROM public.client WHERE id = NEW.user_id;
  IF current_last IS NULL OR NEW.updated_at > current_last + INTERVAL '5 minutes' THEN
    UPDATE public.client SET last_seen_at = NEW.updated_at WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_update_client_last_seen ON client_session;
CREATE TRIGGER trg_update_client_last_seen
AFTER INSERT OR UPDATE OF updated_at ON client_session
FOR EACH ROW EXECUTE FUNCTION update_client_last_seen();

-- =============================================================
-- client.client_type: deriva de document length se não setado manual
-- LENGTH=11 → b2c (CPF), LENGTH=14 → b2b (CNPJ), NULL → null
-- Override manual respeitado: só sobrescreve se NEW.client_type == OLD.client_type.
-- =============================================================
CREATE OR REPLACE FUNCTION derive_client_type() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.client_type IS NOT DISTINCT FROM OLD.client_type) THEN
    IF NEW.document IS NULL THEN
      NEW.client_type := NULL;
    ELSIF LENGTH(NEW.document) = 11 THEN
      NEW.client_type := 'b2c';
    ELSIF LENGTH(NEW.document) = 14 THEN
      NEW.client_type := 'b2b';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_derive_client_type ON client;
CREATE TRIGGER trg_derive_client_type
BEFORE INSERT OR UPDATE OF document, client_type ON client
FOR EACH ROW EXECUTE FUNCTION derive_client_type();
