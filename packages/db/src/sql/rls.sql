-- RLS deny-all (sem policies) em toda tabela do schema public.
--
-- Por quê: o Supabase expõe o schema public pela REST API do PostgREST, e a anon
-- key é pública (vai no front do ecommerce). O app não usa PostgREST: todo
-- acesso é server-side via Drizzle/DATABASE_URL, role `postgres`
-- (rolbypassrls = true), que ignora RLS. Habilitar RLS sem criar policies fecha
-- a porta REST (deny-all para anon/authenticated) sem afetar o app.
--
-- Duas barreiras: nas 14 tabelas originais (ADR-0014) anon/authenticated têm
-- grant e o RLS é o que fecha a REST. Nas demais, hoje essas roles não têm
-- grant, mas nenhum arquivo do repo garante isso; o RLS é a segunda barreira,
-- que não depende de grant.
--
-- Toda tabela nova do schema entra aqui, em ordem alfabética, e declara
-- .enableRLS() no pgTable. Sem o .enableRLS(), o drizzle-kit push emite
-- DISABLE ROW LEVEL SECURITY nela, e o db:push sozinho deixa a REST aberta.
-- O teste src/__tests__/rls-coverage.test.ts cobra as duas coisas: falha se um
-- pgTable faltar ou sobrar aqui, ou se não declarar .enableRLS().
-- `order` e `user` são palavras reservadas e vão entre aspas.
--
-- Ownership: infra DB é owned-by-dashboard (ADR-0009/0014; precedente:
-- triggers.sql). Este é o arquivo canônico (fonte de verdade); o CI espelha pro
-- emach-ecommerce via PR automático. Não editar a cópia do ecommerce direto.
--
-- Idempotente: ENABLE ROW LEVEL SECURITY é no-op se já habilitado.
ALTER TABLE public.account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribute_definition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_address ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_export_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_note ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_picking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_picking_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_picking_scan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_tool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_box ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_alert_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_level ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_attribute_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_attribute_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_image ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_variant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_branch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_capability_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification ENABLE ROW LEVEL SECURITY;
