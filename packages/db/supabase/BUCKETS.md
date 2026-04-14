# Supabase Storage Buckets

## tool-images

Armazena imagens de produto das ferramentas. Bucket **público** — leitura direta sem autenticação.

### Criar via CLI

```bash
npx supabase storage create tool-images --public
```

Rodar uma vez após provisionar o projeto Supabase (local ou remoto). A flag `--public` define política de leitura pública — imagens servidas via CDN Supabase sem token assinado.

### Padrão de URL pública

```
https://<project-ref>.supabase.co/storage/v1/object/public/tool-images/<path>
```

Salvar o path resultante em `tool.image_url`.

### Restrições de upload (client-side — enforced em `tool-image-upload.tsx`)

- MIME types: `image/jpeg`, `image/png`, `image/webp`
- Tamanho máximo: 5MB
- Naming convention sugerido: `<tool-id>/<timestamp>.<ext>` (evita colisão entre ferramentas)
