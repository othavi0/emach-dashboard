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

Salvar o path resultante em `tool.image_url`.

### Restrições de upload (client-side — enforced em `tool-image-upload.tsx`)

- MIME types: `image/jpeg`, `image/png`, `image/webp`
- Tamanho máximo: 5MB
- Naming convention sugerido: `<tool-id>/<timestamp>.<ext>` (evita colisão entre ferramentas)
