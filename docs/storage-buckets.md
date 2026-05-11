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
