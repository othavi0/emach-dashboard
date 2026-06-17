# Galeria de tools — drag-and-drop + análise de vídeo

> Data: 2026-06-16
> Escopo: tab "Imagens & publicação" do wizard/edit de ferramentas.
> Dois entregáveis com maturidade distinta:
> 1. **Drag-and-drop para reordenar imagens** — especificado e implementado neste ciclo.
> 2. **Upload de vídeo (estilo Mercado Livre)** — análise de viabilidade + issue no repo ecommerce; implementação fica para ciclo futuro.

---

## Parte 1 — Drag-and-drop na galeria de imagens (implementar)

### Contexto atual

A galeria vive em `apps/web/src/app/dashboard/tools/_components/tool-image-gallery.tsx` e é compartilhada por `ToolWizard` (create) e `ToolEditView` (edit) via `tool-sections.ts`.

- Layout: lista vertical (`<ul>`), thumbs 48px, primeira imagem = capa (destaque visual).
- Reordenação hoje: botões **↑ / ↓** (`moveUp`/`moveDown`), **⭐** (`promoteToPrimary` → posição 0) e **✕** (`removeAt`).
- **Persistência:** o upload ao bucket público `tool-images` é imediato (`uploadToolImage`), mas as linhas `tool_image` (`url` + `sortOrder`) só são escritas no **submit** do form (`createTool`/`updateTool` em `actions.ts`). O `onChange` da galeria apenas reordena um array em memória; `reindex()` normaliza `sortOrder` para o índice do array.
- O `updateTool` já faz update de `sortOrder` em **duas fases** (negativa → final) para não violar o unique `(toolId, sortOrder)`.

### Decisão

Substituir os botões ↑/↓ por **drag-and-drop com handle**, seguindo o padrão da casa já estabelecido em `dashboard/categories/_components/categories-tree.tsx` (dnd-kit). Mantém ⭐ (capa) e ✕ (remover).

Como o reorder é puramente **in-memory até o submit**, o drag é mais simples que o de categorias: não há server action, optimistic update nem revert. É só `arrayMove` no array `value` seguido de `onChange(reindex(...))` — exatamente o que os ↑/↓ já faziam.

### Implementação (1 arquivo: `tool-image-gallery.tsx`)

- **Imports** (`@dnd-kit` já está nas deps):
  - `@dnd-kit/core`: `DndContext`, `DragEndEvent`, `PointerSensor`, `KeyboardSensor`, `useSensor`, `useSensors`, `closestCenter`.
  - `@dnd-kit/sortable`: `SortableContext`, `useSortable`, `verticalListSortingStrategy`, `arrayMove`, `sortableKeyboardCoordinates`.
  - `@dnd-kit/utilities`: `CSS`.
  - `lucide-react`: `GripVertical`.
- **Subcomponente `SortableImageRow`** extraído do `<li>` atual, usando `useSortable({ id: img.id ?? img.url })`.
  - `img.id` é `undefined` em create (só existe após o write em edit) → o fallback `img.url` é único e estável (path flat `<uuid>.<ext>`), serve como id do sortable e como `key`.
  - Aplica `ref={setNodeRef}` + `style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}`.
- **Sensors:** `useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))`. O `KeyboardSensor` dá acessibilidade por teclado (categorias não tem; aqui é barato e melhora — a lista é curta, ≤8 itens).
- **Wrapper:** envolver o `<ul>` em
  `<DndContext id="tool-image-gallery" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>`
  `<SortableContext items={sorted.map((i) => i.id ?? i.url)} strategy={verticalListSortingStrategy}>`.
  - O `id="tool-image-gallery"` **estável** no `DndContext` é obrigatório (gotcha documentado no `apps/web/CLAUDE.md` §"Listas drag-reorder": id não-determinístico do dnd-kit quebra a hidratação SSR↔client).
- **`handleDragEnd(event)`:** se `over && active.id !== over.id`, achar índices em `sorted` por id, `arrayMove(sorted, from, to)`, `onChange(reindex(moved))`.
- **Handle:** botão com ícone `GripVertical`, `className="cursor-grab text-muted-foreground"`, `aria-label="Reordenar imagem N"`, recebendo `{...attributes} {...listeners}`. Desabilitado enquanto `uploading`.
- **Remover:** `moveUp`, `moveDown` e os dois `<Button>` ↑/↓.
- **Manter:** `promoteToPrimary` (⭐) e `removeAt` (✕) intactos.

### UX

- Arrastar um item para a posição 0 o torna a **capa** automaticamente (capa = índice 0). O ⭐ permanece como atalho rápido "mandar pra capa" sem arrastar até o topo.
- Layout permanece **lista vertical** (não vira grid). YAGNI: não foi pedido, e mantém consistência com o destaque de capa atual e com o padrão de categorias.

### Verificação

- `bun check-types` + `bun check` (ultracite — pega `useAwait`/nested-ternary que o tsc não pega).
- **Smoke visual** em `localhost/dashboard/tools/new` (e em um tool existente via `/dashboard/tools/[id]/edit`): subir 3+ imagens, arrastar pra reordenar, confirmar que a capa acompanha a posição 0, e que o submit persiste a ordem (re-abrir o tool e conferir).
- `check-types` não pega regressão de hidratação nem hook client em RSC — por isso o smoke visual é obrigatório.

### Esforço

Baixo — 1 arquivo, ~1 sessão. Sem mudança de schema, server action ou cross-repo.

---

## Parte 2 — Upload de vídeo (análise de viabilidade)

### Objetivo

Permitir um vídeo de destaque por ferramenta (estilo Mercado Livre), renderizado depois na galeria do produto no **ecommerce** (repo separado, banco compartilhado).

### Nível de ambição escolhido: **lean v1**

1 vídeo por ferramenta, formatos web-nativos apenas, sem transcoding. Cobre o caso principal (1 vídeo de destaque) com o menor custo e a menor superfície no schema compartilhado.

### Restrições descobertas (o que estava passando despercebido)

| # | Restrição | Consequência |
|---|---|---|
| 1 | **Limite de 5MB do server action** (`next.config.ts > experimental.serverActions.bodySizeLimit`). O upload de imagem hoje passa por server action (base64/FormData). | Vídeo (10–50MB+) **não passa** por esse caminho. Exige **upload direto browser → Supabase Storage** (signed upload URL). |
| 2 | **Supabase Storage não transcoda.** | `.mov` de iPhone (comum) pode não tocar em todos os browsers. v1 **rejeita** formatos não-web e exige MP4(H.264)/WebM. |
| 3 | **Schema compartilhado sincroniza sozinho** pro ecommerce via CI (ADR-0009, `sync-db-schema.yml`). | Adicionar colunas de vídeo em `tool` *é* o contrato cross-repo. O **render** continua sendo trabalho do ecommerce. |
| 4 | **Custo/banda de storage.** Vídeo é pesado; bucket público serve direto mas pesa. | Cap de tamanho (≤50MB) e duração (≤60s) obrigatórios. |
| 5 | Regra "Status Ativo exige ≥3 imagens". | Vídeo **não** conta para o mínimo — é opcional, ortogonal às imagens. |

### Arquitetura recomendada (lean v1)

- **Schema:** duas colunas novas em `tool` (`packages/db/src/schema/tools.ts`):
  - `video_url text` (nullable) — URL pública absoluta (mesmo padrão de `tool_image.url`).
  - `video_poster_url text` (nullable) — frame de capa.
  - **Por que não `tool_image` nem tabela nova:** menor blast radius no schema compartilhado, mantém o vídeo independente do drag-drop de imagens, e 1 vídeo não justifica `sortOrder`/tabela. Generalizar para `tool_media` (ver rejeitados) seria reescrever a galeria do ecommerce também.
- **Bucket novo `tool-videos`** (público), com cap de tamanho no nível do bucket. Constante ao lado de `TOOL_IMAGES_BUCKET` em `apps/web/src/lib/supabase-server.ts`.
- **Upload direto** browser → Supabase via **signed upload URL**: um server action (`createVideoUploadUrl`) faz `requireCapability("tools.update")` + emite o token de upload assinado; o browser sobe os bytes direto pro Storage (contorna o limite de 5MB). Após o upload, o browser chama `getPublicUrl` e guarda a URL no estado do form (mesmo modelo in-memory das imagens — persiste no submit).
- **Poster** gerado no client: carregar o vídeo num `<video>` oculto, fazer `seek` para ~1s, desenhar o frame num `<canvas>`, exportar como JPEG/WEBP e subir pelo caminho de imagem existente (`uploadToolImage` ou um bucket dedicado).
- **Validação client + server:** MIME ∈ {`video/mp4`, `video/webm`}, `size ≤ 50MB`, `duration ≤ 60s` (lida via `HTMLVideoElement.duration` antes do upload). Mensagem clara ao rejeitar `.mov`/outros.
- **Ecommerce:** as colunas sincronizam via CI PR. O storefront whitelista o host do bucket em `next.config.ts > images.remotePatterns` (já feito para `tool-images`) e renderiza um `<video controls poster={videoPosterUrl} src={videoUrl}>` na galeria do produto. **Isso é a issue no repo ecommerce.**

### Alternativas rejeitadas

- **Transcoding (Mux/Cloudinary/Coconut) + adaptive streaming:** cobre qualquer formato e otimiza entrega, mas adiciona serviço externo, custo recorrente e bem mais trabalho. Fora do escopo lean; reconsiderar se "rejeitar `.mov`" virar atrito real para os operadores.
- **Generalizar `tool_image` → `tool_media` (`mediaType` enum + poster + duração):** mais elegante (vídeo vira item da galeria, drag cobre os dois), mas maior blast radius no schema compartilhado e exige reescrever a galeria do ecommerce. Só vale se o roadmap pedir N vídeos intercalados com imagens.
- **Upload via server action (como imagens):** barrado pelo limite de 5MB; aumentar o `bodySizeLimit` para dezenas de MB carregaria bytes grandes pela função serverless (timeout/memória) — direct upload é o caminho correto.

### Riscos abertos

- **UX do `.mov` rejeitado:** operadores que filmam no iPhone vão esbarrar. Mitigar com mensagem explicando "converta para MP4" ou reavaliar o meio-termo (transcode leve) se virar reclamação recorrente.
- **Banda/custo do bucket público** conforme o catálogo cresce — monitorar.
- **Dependência de ordem cross-repo:** a issue do ecommerce é **blocked-by** o landing das colunas no dashboard (senão o storefront referencia colunas inexistentes).

### Esforço estimado (quando for implementar)

Médio — schema + bucket + signed-upload action + UI de upload/poster no client + validação, do lado dashboard; mais a issue de render no ecommerce. Maior risco técnico = o fluxo de signed upload direto e a geração de poster no client.

---

## Sequência de execução deste ciclo

1. ✅ Design doc (este arquivo), commitado.
2. Confirmar com o usuário e **abrir a issue no repo ecommerce** referenciando a Parte 2 (blocked-by a implementação dashboard do vídeo).
3. Implementar a **Parte 1 (drag-and-drop)** via writing-plans → execução → smoke visual.
