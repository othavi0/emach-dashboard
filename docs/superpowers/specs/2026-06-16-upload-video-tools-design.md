# Upload de vídeo de destaque em ferramentas — spec de implementação

> Data: 2026-06-16
> Escopo: dashboard. Permitir **1 vídeo de destaque por ferramenta** (estilo Mercado Livre), com upload no admin e render posterior no ecommerce.
> Base: análise de viabilidade em [`2026-06-16-galeria-drag-video-design.md`](./2026-06-16-galeria-drag-video-design.md) (Parte 2). Issue de render no storefront: [emach-ecommerce#137](https://github.com/othavioquiliao/emach-ecommerce/issues/137).
> Decisões de produto travadas no brainstorming: **lean v1**, poster **auto (1º frame, sem override)**, limites **50MB / 60s**, formatos **MP4(H.264)/WebM**, sem transcoding.

---

## 1. Objetivo e não-objetivos

**Objetivo:** operador anexa um vídeo curto a uma ferramenta; o vídeo + um poster (capa) ficam disponíveis para o storefront renderizar na galeria do produto.

**Não-objetivos (v1):**
- Transcoding / conversão de formato (rejeita `.mov` e afins).
- Múltiplos vídeos por ferramenta.
- Escolha manual do frame de capa ou upload de capa custom.
- Adaptive streaming.
- O render no ecommerce (trabalho do repo separado — issue #137).

## 2. Dados

Duas colunas **nullable** em `tool` (`packages/db/src/schema/tools.ts`):

| Coluna | Tipo | Notas |
|---|---|---|
| `video_url` | `text` (nullable) | URL pública absoluta do objeto em `tool-videos` (mesmo padrão de `tool_image.url`). |
| `video_poster_url` | `text` (nullable) | URL pública absoluta da capa (frame capturado), em `tool-images` (ou prefixo dedicado). |

- Aplicação: `bun db:sync` (push-only, ADR-0006). Sincroniza pro ecommerce via CI (`sync-db-schema.yml`).
- Invariante: ou ambas preenchidas, ou ambas nulas. O app garante (não há CHECK no DB — manter simples; o storefront trata `video_url` nulo como "sem vídeo").
- Vídeo é **opcional** e ortogonal às imagens — **não** entra na regra `MIN_SPECS_ACTIVE`/mínimo de 3 imagens para `status = "active"`.

## 3. Storage

- **Bucket novo `tool-videos`** (público), criado via Supabase com:
  - Cap de tamanho de objeto: 50MB.
  - MIME permitido: `video/mp4`, `video/webm`.
- Constante `TOOL_VIDEOS_BUCKET = "tool-videos"` em `apps/web/src/lib/supabase-server.ts`.
- Poster reusa o bucket público de imagens (`tool-images`) — é só uma imagem pequena.
- Bucket público = `<video src>` e `<img>`/`<video poster>` funcionam direto no storefront (host já whitelistado lá para imagens; vídeo é parte da issue #137).

## 4. Upload direto (browser → Supabase)

O server action de hoje sobe via base64/FormData e está capado em 5MB (`bodySizeLimit`). Vídeo de até 50MB **não passa** por aí. Caminho:

**Client Supabase novo** — `apps/web/src/lib/supabase-browser.ts`:
- `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY)` sem persistência de sessão. Singleton exportado. O token assinado é o que autoriza o upload — a chave pública só identifica o projeto.

**Server action** — `apps/web/src/app/dashboard/tools/_components/video-actions.ts` (`"use server"`):
- `createToolVideoUploadUrl(input: { contentType: string })`:
  1. `await requireCapability("tools.update")`.
  2. Valida `contentType ∈ { video/mp4, video/webm }` (defesa server-side mínima; bytes não são vistos aqui).
  3. `path = \`${crypto.randomUUID()}.${ext}\``.
  4. `supabaseAdmin.storage.from(TOOL_VIDEOS_BUCKET).createSignedUploadUrl(path)` → retorna `ActionResult<{ path, token }>`.
- `deleteToolVideoObject(url: string)`: `requireCapability("tools.update")` + `extractPublicUrlPath` + `removeStorageObject(TOOL_VIDEOS_BUCKET, path)`. Espelha `deleteToolImage`. Idem para o poster (via bucket de imagens, reusando `deleteToolImage`).
- Auditoria: `logUserActivity` em upload (`tool.video_uploaded`) e delete (`tool.video_deleted`), padrão de `image-actions.ts`.

**Fluxo client** (no `tool-video-field.tsx`):
1. Valida o arquivo (ver §6).
2. `const { path, token } = await createToolVideoUploadUrl({ contentType })`.
3. `await supabaseBrowser.storage.from(TOOL_VIDEOS_BUCKET).uploadToSignedUrl(path, token, file)`.
4. `getPublicUrl(path)` → `videoUrl`.
5. Captura poster (§5) → upload pelo caminho de imagem → `videoPosterUrl`.
6. `onChange({ videoUrl, videoPosterUrl })` → form state. (Persistência só no submit, igual imagens.)

## 5. Poster (auto, 1º frame)

Util client puro de DOM — `apps/web/src/lib/video-poster.ts`:
- `capturePosterFrame(file: File): Promise<File>`:
  - Cria `<video>` oculto, `src = URL.createObjectURL(file)`, `muted`, `preload="metadata"`.
  - `seek` para `min(1, duration/2)`s; no evento `seeked`, desenha em `<canvas>` (dimensões do vídeo, cap em ~1280px no maior lado), `canvas.toBlob('image/webp', 0.8)`.
  - Retorna um `File` (`poster.webp`). Revoga o object URL.
- O poster sobe pelo server action de imagem existente (`uploadToolImage` ou um `uploadToolPoster` análogo). Cabe nos 5MB.
- Falha na captura → o upload do vídeo é abortado com mensagem (não persistir vídeo sem poster).

## 6. Validação

**Client (antes de pedir o token):**
- MIME ∈ { `video/mp4`, `video/webm` } — senão `notify.error("Formato inválido. Use MP4 ou WebM (converta vídeos .mov).")`.
- `size ≤ 50MB`.
- `duration ≤ 60s` (lida via `HTMLVideoElement` `loadedmetadata`). Falha ao ler metadata → rejeita.
- Funções puras testáveis: `validateVideoFile(file): { ok: true } | { ok: false; error: string }` (type+size, síncrona) e a leitura de duração isolada (DOM, não testada em node).

**Server (`createToolVideoUploadUrl`):** revalida `contentType`. O cap de tamanho do bucket é a barreira dura server-side. Hardening opcional (fora da v1): `HEAD` no objeto pós-upload p/ conferir size/MIME antes de persistir.

## 7. UI

`apps/web/src/app/dashboard/tools/_components/tool-video-field.tsx` (client), na etapa **"Imagens & publicação"**, abaixo da galeria de imagens:
- **Vazio:** dropzone (mesmo visual da galeria) — "Arraste um vídeo ou clique · MP4/WebM · até 50MB, 60s".
- **Com vídeo:** `<video controls poster={videoPosterUrl} src={videoUrl}>` (~160-240px largura) + botão ✕ (remover) e "Trocar".
- **Enviando:** spinner + label de progresso ("Enviando vídeo…", "Gerando capa…").
- Erros de validação seguem o padrão `<FieldError>` no nível do bloco (não caixa no topo) — consistente com a galeria de imagens.

## 8. Persistência (form ↔ actions)

- `tool-schema.ts` (`toolFormSchema`): `videoUrl: z.string().url().nullable().optional()`, `videoPosterUrl: z.string().url().nullable().optional()`. Refine: se um existe, o outro também (coerência app-side).
- `tool-form-state.ts`: defaults `videoUrl: null`, `videoPosterUrl: null`. No edit, populados do `tool`.
- `actions.ts`:
  - `createTool`: incluir `videoUrl`/`videoPosterUrl` no insert de `tool`.
  - `updateTool`: setar as colunas; se a URL antiga existia e mudou/foi removida, `deleteToolVideoObject(antiga)` + delete do poster antigo (best-effort, após o commit da transação, como já é feito com imagens em `Promise.allSettled`).
- Campos **opcionais** → não entram em `STEP_FIELDS` (que governa navegação a passo com erro de campo **obrigatório**). Se tiverem erro de validação, mostrar no bloco do componente.

## 9. Tratamento de erro

- Upload falha (rede/token expirado/oversize rejeitado pelo bucket) → `notify.error` com a mensagem do erro + estado do campo limpo (sem `videoUrl` parcial).
- Server action devolve `ActionResult` (`{ ok:false, error }`) — erros de DB via `getPgError` (padrão `apps/web/CLAUDE.md`).
- Remover vídeo: limpa o estado e dispara `deleteToolVideoObject`; se o delete do storage falhar, `notify.error` mas não bloqueia (objeto órfão é tolerável; mesma postura das imagens).

## 10. Testes

- `validateVideoFile` (pura): aceita mp4/webm no limite, rejeita tipo/size inválidos.
- `toolFormSchema`: aceita vídeo ausente; aceita par completo; rejeita par incoerente (só um dos dois).
- `createTool`/`updateTool`: persistem `video_url`/`video_poster_url` (mock db `vi.hoisted`, padrão de `__tests__`).
- Captura de poster e upload direto: **smoke visual** (`bun dev:web`, subir um MP4 curto, ver preview, salvar, reabrir o tool e confirmar persistência) — não cobertos por vitest node.

## 11. Cross-repo

- Schema (2 colunas) sincroniza automaticamente pro ecommerce via CI. O render do `<video>` é trabalho do storefront, já rastreado em **emach-ecommerce#137** (blocked-by este trabalho).
- Coordenação de deploy: as colunas precisam existir/sincronizar antes do storefront referenciá-las.

## 12. Arquivos tocados (resumo)

| Arquivo | Mudança |
|---|---|
| `packages/db/src/schema/tools.ts` | +2 colunas em `tool` |
| `apps/web/src/lib/supabase-server.ts` | +`TOOL_VIDEOS_BUCKET` |
| `apps/web/src/lib/supabase-browser.ts` | **novo** — client browser |
| `apps/web/src/lib/video-poster.ts` | **novo** — captura de frame |
| `apps/web/src/app/dashboard/tools/_components/video-actions.ts` | **novo** — signed URL + delete |
| `apps/web/src/app/dashboard/tools/_components/tool-video-field.tsx` | **novo** — UI |
| `apps/web/src/app/dashboard/tools/_components/tool-schema.ts` | +campos zod |
| `apps/web/src/app/dashboard/tools/_components/tool-form-state.ts` | +defaults |
| `apps/web/src/app/dashboard/tools/_components/tool-sections.ts` (ou o passo de publish) | renderizar o novo campo |
| `apps/web/src/app/dashboard/tools/actions.ts` | persistência + delete de órfão |
| Supabase (infra) | criar bucket `tool-videos` |
