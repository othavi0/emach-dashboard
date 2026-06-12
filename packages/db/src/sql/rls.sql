-- RLS deny-all (sem policies) nas tabelas public expostas via PostgREST.
--
-- Por quê: sem RLS, qualquer um com a anon key do projeto Supabase consegue ler
-- (e nas sem grants restritos, escrever) essas tabelas direto pela REST API do
-- PostgREST — estoque por filial, margens de promoção, reviews. O app não usa
-- PostgREST: todo acesso é server-side via Drizzle/DATABASE_URL, role `postgres`
-- (rolbypassrls = true), que ignora RLS. Habilitar RLS sem criar policies fecha
-- a porta REST (deny-all para anon/authenticated) sem afetar o app.
--
-- Ownership: infra DB é owned-by-dashboard (ADR-0009/0014; precedente:
-- triggers.sql). Este é o arquivo canônico (fonte de verdade); o CI espelha pro
-- emach-ecommerce via PR automático. Não editar a cópia do ecommerce direto.
--
-- Idempotente: ENABLE ROW LEVEL SECURITY é no-op se já habilitado.
ALTER TABLE public.tool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_variant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_image ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_attribute_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_attribute_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribute_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_level ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_tool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review ENABLE ROW LEVEL SECURITY;
