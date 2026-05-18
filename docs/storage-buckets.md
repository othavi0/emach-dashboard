# Supabase Storage Buckets

## tool-images

Armazena imagens de produto das ferramentas. Bucket **público** — leitura direta sem autenticação.

### Criar via Dashboard (cloud)

1. Supabase Dashboard → Storage → **New bucket**
2. Nome: `tool-images`
3. Public: **ON**
4. File size limit: **5 MB**
5. Allowed MIME types: `image/png`, `image/jpeg`, `image/webp`

> A CLI `supabase storage` (v2.91.x) só tem `cp/ls/mv/rm` — não cria bucket. Use Dashboard ou SQL.

### Criar via SQL (alternativa)

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tool-images',
  'tool-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
);
```

### Padrão de URL pública

```
https://<project-ref>.supabase.co/storage/v1/object/public/tool-images/<path>
```

Salvar a URL resultante em `tool_image.url` (uma linha por imagem, `sort_order` define a posição).

### Arquitetura de acesso

Upload e delete acontecem **server-side** via server actions em `apps/web/src/app/dashboard/tools/_components/image-actions.ts` usando `supabaseAdmin` (`apps/web/src/lib/supabase-server.ts`) com `SUPABASE_SERVICE_ROLE_KEY`. Bucket RLS permanece fechado para `anon` — apenas leitura pública via URL direta.

Validações de tipo e tamanho (5 MB, JPG/PNG/WEBP) acontecem tanto no client (`tool-image-gallery.tsx`) quanto no server (`image-actions.ts`) — defesa em camadas.

### Cleanup de storage

- `createTool`: sem cleanup (só escreve).
- `updateTool`: imagens removidas no form são deletadas do bucket após o DB commit (`Promise.allSettled`, best-effort).
- `deleteTool`: busca URLs antes do `DELETE tool` e limpa cada arquivo após o delete (cascade já removeu registros).
- `removeAt` (gallery × button): chama `deleteToolImage` imediatamente mas o registro só some do DB se o form for salvo. Se usuário fechar sem salvar, arquivo **removido** do bucket mas URL ainda no state — divergência aceitável (user já sinalizou intenção de remover).

## order-documents

Armazena anexos de pedido enviados pelo staff (canhoto de entrega, comprovante de postagem). Bucket **privado** — esses documentos podem carregar assinatura/PII, então **não** há leitura pública. Servido por **signed URLs** (TTL de 1 hora) geradas server-side a cada leitura.

> Não confundir com os documentos do Asaas (comprovante de pagamento, NF-e): aqueles chegam pelo banco em colunas de `order`, preenchidas pelo e-commerce (ver ADR-0008). `order-documents` é só para upload manual do staff.

### Criar via Dashboard (cloud)

1. Supabase Dashboard → Storage → **New bucket**
2. Nome: `order-documents`
3. Public: **OFF**
4. File size limit: **5 MB**
5. Allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`

### Criar via SQL (alternativa)

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-documents',
  'order-documents',
  false,
  5242880,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
);
```

### Padrão de path do objeto

```
<orderId>/<uuid>.<ext>
```

O **path** do objeto (não uma URL) é salvo em `order_attachment.file_url`. Signed URLs expiram — gerá-las só na leitura via `createSignedUrl()` (`apps/web/src/lib/storage.ts`). `getOrderDetail` assina cada anexo ao montar o detalhe do pedido.

### Arquitetura de acesso

Upload e delete acontecem **server-side** via server actions em `apps/web/src/app/dashboard/orders/_components/attachment-actions.ts` (`addOrderAttachment` / `deleteOrderAttachment`), usando `supabaseAdmin` (`SUPABASE_SERVICE_ROLE_KEY`). Ambas as actions são branch-scoped (`lockOrderAndAuthorize`) com capability `orders.update_status`. Bucket RLS permanece fechado para `anon` — sem acesso direto.

Validações de tipo e tamanho (5 MB, PDF/JPG/PNG/WEBP) acontecem no server (`storage.ts`).

### Cleanup de storage

- `addOrderAttachment`: se a transação/autorização falha após o upload, o objeto órfão é removido (best-effort, log em caso de falha).
- `deleteOrderAttachment`: remove o objeto **após** o commit do `DELETE order_attachment`. Se a remoção do storage falhar, sobra um objeto órfão inofensivo (preferível a uma row apontando para arquivo inexistente).
