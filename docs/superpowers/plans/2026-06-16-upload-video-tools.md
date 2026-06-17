# Upload de vídeo de destaque em tools — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir 1 vídeo de destaque (MP4/WebM) por ferramenta no admin, com upload direto ao Supabase, poster auto-gerado, persistido nas colunas `tool.video_url`/`tool.video_poster_url` para o storefront renderizar.

**Architecture:** Upload direto browser→Supabase via signed upload URL (contorna o teto de 5MB do server action). Server action emite o token + valida MIME; client sobe os bytes, captura o poster do 1º frame via canvas e o sobe pelo caminho de imagem existente. URLs guardadas no form state e persistidas no submit, igual à galeria de imagens. Schema sincroniza pro ecommerce via CI (issue #137 cobre o render lá).

**Tech Stack:** Next 16 / React 19 / Drizzle / `@supabase/supabase-js` 2.105.x (`createSignedUploadUrl` + `uploadToSignedUrl`) / Zod / Vitest (node).

## Global Constraints

- Lean v1: **1 vídeo** por tool, **MP4 (`video/mp4`) e WebM (`video/webm`) apenas**, sem transcoding.
- Limites: **≤ 50 MB** (52428800 bytes) e **≤ 60 s**.
- Poster: **auto, 1º frame**, sem override; formato WEBP.
- Vídeo é **opcional** — não conta para o mínimo de 3 imagens nem para `MIN_SPECS_ACTIVE`.
- Schema é **push-only** (ADR-0006): `bun db:sync` após editar `packages/db/src/schema/*.ts`.
- Server actions: `"use server"` + `await requireCapability(...)` no topo; retorno `ActionResult` quando aplicável; sem `console.*` (usar `logger`); sem `: any`.
- Coerência app-side: `video_url` e `video_poster_url` são ambas preenchidas ou ambas nulas (sem CHECK no DB).
- Capability: emitir signed URL e subir = `tools.update`; deletar objeto de storage = `tools.delete` (espelha `deleteToolImage`).
- Branch de trabalho: `feat/upload-video-tools` (já criada).

---

### Task 1: Validação pura do arquivo de vídeo

Função síncrona de validação de tipo+tamanho, sem DOM, 100% testável. A leitura de duração (DOM) fica na Task 6.

**Files:**
- Create: `apps/web/src/lib/video-validation.ts`
- Test: `apps/web/src/lib/__tests__/video-validation.test.ts`

**Interfaces:**
- Produces:
  - `MAX_VIDEO_BYTES = 52_428_800` (50 MB)
  - `MAX_VIDEO_DURATION_SECONDS = 60`
  - `ALLOWED_VIDEO_MIME: Record<"video/mp4" | "video/webm", "mp4" | "webm">`
  - `validateVideoFile(file: File): { ok: true } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/__tests__/video-validation.test.ts
import { describe, expect, it } from "vitest";
import { MAX_VIDEO_BYTES, validateVideoFile } from "../video-validation";

function fakeFile(type: string, size: number): File {
	const f = new File(["x"], "clip", { type });
	Object.defineProperty(f, "size", { value: size });
	return f;
}

describe("validateVideoFile", () => {
	it("aceita mp4 dentro do limite", () => {
		expect(validateVideoFile(fakeFile("video/mp4", 1_000_000))).toEqual({
			ok: true,
		});
	});

	it("aceita webm dentro do limite", () => {
		expect(validateVideoFile(fakeFile("video/webm", 1_000_000))).toEqual({
			ok: true,
		});
	});

	it("rejeita formato não suportado (.mov)", () => {
		const r = validateVideoFile(fakeFile("video/quicktime", 1_000_000));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toMatch(/MP4 ou WebM/);
		}
	});

	it("rejeita acima de 50MB", () => {
		const r = validateVideoFile(fakeFile("video/mp4", MAX_VIDEO_BYTES + 1));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toMatch(/50MB/);
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test video-validation`
Expected: FAIL — `Cannot find module '../video-validation'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/video-validation.ts
export const MAX_VIDEO_BYTES = 52_428_800; // 50 MB
export const MAX_VIDEO_DURATION_SECONDS = 60;

export const ALLOWED_VIDEO_MIME = {
	"video/mp4": "mp4",
	"video/webm": "webm",
} as const;

export type AllowedVideoMime = keyof typeof ALLOWED_VIDEO_MIME;

export function validateVideoFile(
	file: File
): { ok: true } | { ok: false; error: string } {
	if (!(file.type in ALLOWED_VIDEO_MIME)) {
		return {
			ok: false,
			error: "Formato inválido. Use MP4 ou WebM (converta vídeos .mov).",
		};
	}
	if (file.size > MAX_VIDEO_BYTES) {
		return { ok: false, error: "Vídeo excede 50MB." };
	}
	return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test video-validation`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/video-validation.ts apps/web/src/lib/__tests__/video-validation.test.ts
git commit -m "feat: validação pura de arquivo de vídeo de tool"
```

---

### Task 2: Schema, bucket e env (fundação)

Colunas no DB, bucket de storage e validação de env. Sem unit test (config) — o gate é `check-types` + `db:sync` + o bucket existir.

**Files:**
- Modify: `packages/db/src/schema/tools.ts` (tabela `tool`)
- Modify: `apps/web/src/lib/supabase-server.ts` (+constante de bucket)
- Modify: `packages/env/src/server.ts` (+validação da publishable key)
- Infra: criar bucket `tool-videos` no Supabase

**Interfaces:**
- Produces:
  - `tool.videoUrl` (`text`, nullable), `tool.videoPosterUrl` (`text`, nullable)
  - `TOOL_VIDEOS_BUCKET = "tool-videos"` (export de `supabase-server.ts`)

- [ ] **Step 1: Adicionar colunas em `tool`**

Em `packages/db/src/schema/tools.ts`, dentro do `pgTable("tool", { ... })`, adicionar (perto das demais colunas de texto opcionais, antes dos timestamps):

```ts
		videoUrl: text("video_url"),
		videoPosterUrl: text("video_poster_url"),
```

- [ ] **Step 2: Adicionar a constante de bucket**

Em `apps/web/src/lib/supabase-server.ts`, junto às outras constantes:

```ts
export const TOOL_VIDEOS_BUCKET = "tool-videos";
```

- [ ] **Step 3: Validar a env da publishable key**

Em `packages/env/src/server.ts`, no objeto `server`, adicionar (logo após `NEXT_PUBLIC_SUPABASE_URL`):

```ts
		NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: z.string().min(1),
```

- [ ] **Step 4: Criar o bucket no Supabase**

Rodar via Supabase (MCP `execute_sql` ou SQL editor do dashboard):

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tool-videos', 'tool-videos', true, 52428800, array['video/mp4','video/webm'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
```

Confirmar: `select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'tool-videos';` deve retornar a linha com `public = true`, `file_size_limit = 52428800`.

- [ ] **Step 5: Sincronizar o schema e checar tipos**

```bash
bun db:sync
bun --cwd apps/web check-types
```
Expected: `db:sync` aplica as 2 colunas sem prompt destrutivo; `check-types` passa (sem erros). Se `db:sync` pedir TTY, rodar interativo.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/tools.ts apps/web/src/lib/supabase-server.ts packages/env/src/server.ts
git commit -m "feat: colunas video_url/video_poster_url, bucket tool-videos e env"
```

---

### Task 3: Campos no schema do form, defaults e STEP_FIELDS

`videoUrl`/`videoPosterUrl` no zod do form (com refine de coerência), defaults no estado, e cobertura no assert de exaustividade de `STEP_FIELDS`.

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-state.ts`
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts`
- Test: `apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts` (estender)

**Interfaces:**
- Consumes: `toolFormSchema`, `ToolFormValues`, `EMPTY_TOOL_VALUES`, `STEP_FIELDS` (Tasks anteriores não alteram suas assinaturas).
- Produces: `ToolFormValues` ganha `videoUrl: string | null` e `videoPosterUrl: string | null`.

- [ ] **Step 1: Write the failing tests** (anexar ao final de `tool-schema.test.ts`)

```ts
describe("toolFormSchema — campos de vídeo", () => {
	it("aceita ferramenta sem vídeo (ambos null)", () => {
		const r = toolFormSchema.safeParse(
			baseTool({ videoUrl: null, videoPosterUrl: null })
		);
		expect(r.success).toBe(true);
	});

	it("aceita par de vídeo completo", () => {
		const r = toolFormSchema.safeParse(
			baseTool({
				videoUrl: "https://x/v.mp4",
				videoPosterUrl: "https://x/p.webp",
			})
		);
		expect(r.success).toBe(true);
	});

	it("rejeita par incoerente (vídeo sem poster)", () => {
		const r = toolFormSchema.safeParse(
			baseTool({ videoUrl: "https://x/v.mp4", videoPosterUrl: null })
		);
		expect(r.success).toBe(false);
		if (!r.success) {
			expect(
				r.error.issues.some((i) => String(i.path[0]) === "videoUrl")
			).toBe(true);
		}
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun --cwd apps/web test tool-schema`
Expected: FAIL — o par incoerente passa (ainda não há refine) e/ou os campos são desconhecidos.

- [ ] **Step 3: Adicionar os campos ao `toolFormSchema`**

Em `tool-schema.ts`, dentro do `.object({ ... })` (após `attributeAssignments`):

```ts
		videoUrl: z.url("URL de vídeo inválida").nullable().default(null),
		videoPosterUrl: z.url("URL de poster inválida").nullable().default(null),
```

E no `.superRefine((data, ctx) => { ... })`, adicionar o check de coerência (no início do corpo):

```ts
		if (Boolean(data.videoUrl) !== Boolean(data.videoPosterUrl)) {
			ctx.addIssue({
				code: "custom",
				path: ["videoUrl"],
				message: "Vídeo e poster devem ser definidos juntos",
			});
		}
```

- [ ] **Step 4: Adicionar defaults ao estado**

Em `tool-form-state.ts`, no objeto `EMPTY_TOOL_VALUES` (após `images: []`):

```ts
	videoUrl: null,
	videoPosterUrl: null,
```

- [ ] **Step 5: Cobrir no `STEP_FIELDS`**

Em `tool-form-steps.ts`, no `STEP_FIELDS.publish`, adicionar as duas chaves:

```ts
	publish: ["images", "status", "visibleOnSite", "videoUrl", "videoPosterUrl"],
```

(Obrigatório mesmo sendo opcionais: o assert `_stepFieldsAreExhaustive` cobre toda chave de `ToolFormValues`.)

- [ ] **Step 6: Run tests + check-types**

Run:
```bash
bun --cwd apps/web test tool-schema
bun --cwd apps/web check-types
```
Expected: testes PASS; `check-types` passa (o assert de `STEP_FIELDS` não quebra).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-schema.ts apps/web/src/app/dashboard/tools/_components/tool-form-state.ts apps/web/src/app/dashboard/tools/_components/tool-form-steps.ts apps/web/src/app/dashboard/tools/_components/__tests__/tool-schema.test.ts
git commit -m "feat: campos de vídeo no schema do form de tool"
```

---

### Task 4: Client Supabase do browser + server action de upload

Client browser leve + action que emite signed upload URL e deleta objeto de vídeo.

**Files:**
- Create: `apps/web/src/lib/supabase-browser.ts`
- Create: `apps/web/src/app/dashboard/tools/_components/video-actions.ts`

**Interfaces:**
- Consumes: `TOOL_VIDEOS_BUCKET` (Task 2), `extractPublicUrlPath`/`removeStorageObject` (`@/lib/storage`), `supabaseAdmin` (`@/lib/supabase-server`), `requireCapability`, `logUserActivity`.
- Produces:
  - `supabaseBrowser` (client `@supabase/supabase-js`, sem sessão)
  - `createToolVideoUploadUrl(input: { contentType: string }): Promise<{ ok: true; data: { bucket: string; path: string; token: string } } | { ok: false; error: string }>`
  - `deleteToolVideoObject(url: string): Promise<void>`

- [ ] **Step 1: Criar o client browser**

```ts
// apps/web/src/lib/supabase-browser.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
	process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!(url && publishableKey)) {
	throw new Error("Supabase browser env não configurada");
}

// Client sem sessão — usado só para uploadToSignedUrl (o token assina a operação)
// e getPublicUrl. A publishable key apenas identifica o projeto.
export const supabaseBrowser = createClient(url, publishableKey, {
	auth: { persistSession: false, autoRefreshToken: false },
});
```

- [ ] **Step 2: Criar as server actions**

```ts
// apps/web/src/app/dashboard/tools/_components/video-actions.ts
"use server";

import { logUserActivity } from "@/lib/activity";
import { requireCapability } from "@/lib/permissions";
import { extractPublicUrlPath, removeStorageObject } from "@/lib/storage";
import { supabaseAdmin, TOOL_VIDEOS_BUCKET } from "@/lib/supabase-server";
import { ALLOWED_VIDEO_MIME } from "@/lib/video-validation";

export async function createToolVideoUploadUrl(input: {
	contentType: string;
}): Promise<
	| { ok: true; data: { bucket: string; path: string; token: string } }
	| { ok: false; error: string }
> {
	await requireCapability("tools.update");
	const ext = ALLOWED_VIDEO_MIME[input.contentType as keyof typeof ALLOWED_VIDEO_MIME];
	if (!ext) {
		return { ok: false, error: "Formato inválido. Use MP4 ou WebM." };
	}
	const path = `${crypto.randomUUID()}.${ext}`;
	const { data, error } = await supabaseAdmin.storage
		.from(TOOL_VIDEOS_BUCKET)
		.createSignedUploadUrl(path);
	if (error || !data) {
		return { ok: false, error: "Não foi possível iniciar o upload do vídeo." };
	}
	return {
		ok: true,
		data: { bucket: TOOL_VIDEOS_BUCKET, path: data.path, token: data.token },
	};
}

export async function deleteToolVideoObject(url: string): Promise<void> {
	const session = await requireCapability("tools.delete");
	const path = extractPublicUrlPath(url, TOOL_VIDEOS_BUCKET);
	if (!path) {
		return;
	}
	await removeStorageObject(TOOL_VIDEOS_BUCKET, path);
	await logUserActivity({
		actorUserId: session.user.id,
		action: "tool.video_deleted",
		targetType: "tool",
		metadata: { path },
	});
}
```

- [ ] **Step 3: check-types + lint**

```bash
bun --cwd apps/web check-types
bunx ultracite check apps/web/src/lib/supabase-browser.ts apps/web/src/app/dashboard/tools/_components/video-actions.ts
```
Expected: ambos limpos. (`createSignedUploadUrl` retorna `{ data: { signedUrl, token, path } }`; `removeStorageObject`/`extractPublicUrlPath` já existem em `storage.ts`.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/supabase-browser.ts apps/web/src/app/dashboard/tools/_components/video-actions.ts
git commit -m "feat: client supabase browser + action de signed upload de vídeo"
```

---

### Task 5: Persistência (createTool, updateTool, deleteTool)

Gravar/atualizar/limpar as colunas de vídeo. Sem unit test de actions (a codebase não tem harness de mock de DB para `createTool`/`updateTool`); o gate é `check-types` + smoke na Task 7.

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/actions.ts`

**Interfaces:**
- Consumes: `parsed.data.videoUrl`, `parsed.data.videoPosterUrl` (Task 3); `deleteToolVideoObject` (Task 4).
- Produces: `tool` insert/update incluem `videoUrl`/`videoPosterUrl`; `deleteTool` limpa os objetos de storage.

- [ ] **Step 1: Incluir as colunas no `buildToolColumns`**

Em `actions.ts`, na função que monta as colunas do `tool` (retorno que termina em `visibleOnSite: input.visibleOnSite`), adicionar:

```ts
		videoUrl: input.videoUrl,
		videoPosterUrl: input.videoPosterUrl,
```

(Como `createTool` e `updateTool` usam esse builder para o insert/update do `tool`, isso cobre os dois caminhos de gravação.)

- [ ] **Step 2: Limpar objeto antigo no `updateTool`**

No `updateTool`, após buscar o `tool` atual (antes do `buildToolColumns`), capturar as URLs antigas e, ao final (no bloco `Promise.allSettled` pós-commit que já existe para imagens), incluir o delete do vídeo/poster quando mudou ou foi removido. Adicionar perto da leitura do tool existente:

```ts
		const [prevVideo] = await tx
			.select({ url: tool.videoUrl, poster: tool.videoPosterUrl })
			.from(tool)
			.where(eq(tool.id, id));
```

E no cleanup pós-transação (junto ao `Promise.allSettled` das imagens órfãs):

```ts
		if (prevVideo?.url && prevVideo.url !== parsed.data.videoUrl) {
			await deleteToolVideoObject(prevVideo.url).catch(() => undefined);
			if (prevVideo.poster) {
				await deleteToolImage(prevVideo.poster).catch(() => undefined);
			}
		}
```

(`deleteToolImage` já é importado em `actions.ts`. Importar `deleteToolVideoObject` de `./_components/video-actions` — Task 5.)

- [ ] **Step 3: Limpar no `deleteTool`**

No `deleteTool`, junto à busca de URLs de `toolImage` (antes do `db.delete(tool)`), buscar também as colunas de vídeo:

```ts
	const [videoRow] = await db
		.select({ url: tool.videoUrl, poster: tool.videoPosterUrl })
		.from(tool)
		.where(eq(tool.id, id));
```

E no cleanup pós-delete (após o `Promise.allSettled(urls.map(...))`):

```ts
	if (videoRow?.url) {
		await deleteToolVideoObject(videoRow.url).catch(() => undefined);
		if (videoRow.poster) {
			await deleteToolImage(videoRow.poster).catch(() => undefined);
		}
	}
```

- [ ] **Step 4: check-types**

Run: `bun --cwd apps/web check-types`
Expected: passa. (`deleteToolVideoObject` foi criado na Task 4.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/actions.ts
git commit -m "feat: persiste e limpa vídeo/poster em create/update/deleteTool"
```

---

### Task 6: Utils de cliente — duração e captura de poster

Helpers DOM (não testáveis em vitest node) — leitura de duração e captura do 1º frame. Gate: `check-types` + smoke na Task 7.

**Files:**
- Create: `apps/web/src/lib/video-client.ts`

**Interfaces:**
- Produces:
  - `readVideoDuration(file: File): Promise<number>` (segundos; rejeita se metadata não carregar)
  - `capturePosterFrame(file: File): Promise<File>` (WEBP do 1º frame)

- [ ] **Step 1: Implementar os helpers**

```ts
// apps/web/src/lib/video-client.ts

const POSTER_MAX_EDGE = 1280;

export function readVideoDuration(file: File): Promise<number> {
	return new Promise((resolve, reject) => {
		const video = document.createElement("video");
		video.preload = "metadata";
		video.muted = true;
		const objectUrl = URL.createObjectURL(file);
		const cleanup = () => URL.revokeObjectURL(objectUrl);
		video.onloadedmetadata = () => {
			cleanup();
			resolve(video.duration);
		};
		video.onerror = () => {
			cleanup();
			reject(new Error("Não foi possível ler o vídeo."));
		};
		video.src = objectUrl;
	});
}

export function capturePosterFrame(file: File): Promise<File> {
	return new Promise((resolve, reject) => {
		const video = document.createElement("video");
		video.preload = "auto";
		video.muted = true;
		// biome-ignore lint/suspicious/noExplicitAny: playsInline não está no lib dom desta versão
		(video as any).playsInline = true;
		const objectUrl = URL.createObjectURL(file);
		const cleanup = () => URL.revokeObjectURL(objectUrl);

		video.onloadeddata = () => {
			const target = Math.min(1, (video.duration || 2) / 2);
			video.currentTime = target;
		};
		video.onseeked = () => {
			const scale = Math.min(
				1,
				POSTER_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight)
			);
			const canvas = document.createElement("canvas");
			canvas.width = Math.round(video.videoWidth * scale);
			canvas.height = Math.round(video.videoHeight * scale);
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				cleanup();
				reject(new Error("Não foi possível gerar a capa do vídeo."));
				return;
			}
			ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
			canvas.toBlob(
				(blob) => {
					cleanup();
					if (!blob) {
						reject(new Error("Não foi possível gerar a capa do vídeo."));
						return;
					}
					resolve(new File([blob], "poster.webp", { type: "image/webp" }));
				},
				"image/webp",
				0.8
			);
		};
		video.onerror = () => {
			cleanup();
			reject(new Error("Não foi possível processar o vídeo."));
		};
		video.src = objectUrl;
	});
}
```

- [ ] **Step 2: check-types + lint**

```bash
bun --cwd apps/web check-types
bunx ultracite check apps/web/src/lib/video-client.ts
```
Expected: limpos.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/video-client.ts
git commit -m "feat: utils de duração e captura de poster de vídeo no client"
```

---

### Task 7: Componente de UI + fiar na etapa de publicação

Campo de vídeo (dropzone + preview) e integração no `PublishFields`. Gate: `check-types` + `ultracite` + **smoke visual** (round-trip completo).

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_components/tool-video-field.tsx`
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/publish-fields.tsx`

**Interfaces:**
- Consumes: `validateVideoFile`, `MAX_VIDEO_DURATION_SECONDS` (Task 1); `readVideoDuration`, `capturePosterFrame` (Task 6); `createToolVideoUploadUrl`, `deleteToolVideoObject` (Task 4); `supabaseBrowser` (Task 4); `uploadToolImage` (`./image-actions`); `notify` (`@/lib/notify`).
- Produces: `<ToolVideoField value={{ videoUrl, videoPosterUrl }} onChange={(v) => void} disabled />`.

- [ ] **Step 1: Criar o componente**

```tsx
// apps/web/src/app/dashboard/tools/_components/tool-video-field.tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { notify } from "@/lib/notify";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { capturePosterFrame, readVideoDuration } from "@/lib/video-client";
import {
	MAX_VIDEO_DURATION_SECONDS,
	validateVideoFile,
} from "@/lib/video-validation";
import { uploadToolImage } from "./image-actions";
import {
	createToolVideoUploadUrl,
	deleteToolVideoObject,
} from "./video-actions";

export interface ToolVideoValue {
	videoPosterUrl: string | null;
	videoUrl: string | null;
}

interface ToolVideoFieldProps {
	disabled?: boolean;
	onChange: (value: ToolVideoValue) => void;
	value: ToolVideoValue;
}

export function ToolVideoField({
	value,
	onChange,
	disabled,
}: ToolVideoFieldProps) {
	const fileInput = useRef<HTMLInputElement>(null);
	const [status, setStatus] = useState<string | null>(null);
	const busy = status !== null;

	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fluxo de upload com validação, captura de poster e rollback
	async function handleFile(file: File) {
		const valid = validateVideoFile(file);
		if (!valid.ok) {
			notify.error(valid.error);
			return;
		}
		setStatus("Lendo vídeo…");
		try {
			const duration = await readVideoDuration(file);
			if (duration > MAX_VIDEO_DURATION_SECONDS) {
				notify.error(`Vídeo excede ${MAX_VIDEO_DURATION_SECONDS}s.`);
				return;
			}

			setStatus("Gerando capa…");
			const poster = await capturePosterFrame(file);

			setStatus("Enviando vídeo…");
			const target = await createToolVideoUploadUrl({ contentType: file.type });
			if (!target.ok) {
				notify.error(target.error);
				return;
			}
			const upload = await supabaseBrowser.storage
				.from(target.data.bucket)
				.uploadToSignedUrl(target.data.path, target.data.token, file);
			if (upload.error) {
				notify.error("Falha ao enviar o vídeo.");
				return;
			}
			const videoUrl = supabaseBrowser.storage
				.from(target.data.bucket)
				.getPublicUrl(target.data.path).data.publicUrl;

			setStatus("Enviando capa…");
			try {
				const posterForm = new FormData();
				posterForm.append("file", poster);
				const { url: videoPosterUrl } = await uploadToolImage(posterForm);
				onChange({ videoUrl, videoPosterUrl });
				notify.success("Vídeo enviado");
			} catch {
				// poster falhou → não deixa vídeo órfão
				await deleteToolVideoObject(videoUrl).catch(() => undefined);
				notify.error("Falha ao gerar a capa. Tente novamente.");
			}
		} catch (err) {
			notify.error(err instanceof Error ? err.message : "Erro no vídeo.");
		} finally {
			setStatus(null);
		}
	}

	function handleRemove() {
		const url = value.videoUrl;
		const poster = value.videoPosterUrl;
		onChange({ videoUrl: null, videoPosterUrl: null });
		if (url) {
			deleteToolVideoObject(url).catch(() =>
				notify.error("Não foi possível remover o vídeo do storage.")
			);
		}
		if (poster) {
			// poster vive no bucket de imagens; reusa o delete de imagem
			import("./image-actions").then(({ deleteToolImage }) =>
				deleteToolImage(poster).catch(() => undefined)
			);
		}
	}

	if (value.videoUrl) {
		return (
			<div className="flex items-start gap-3">
				{/* biome-ignore lint/a11y/useMediaCaption: vídeo de produto sem legenda */}
				<video
					className="h-40 w-auto rounded-md border border-border"
					controls
					poster={value.videoPosterUrl ?? undefined}
					src={value.videoUrl}
				/>
				<Button
					disabled={disabled || busy}
					onClick={handleRemove}
					size="sm"
					type="button"
					variant="ghost"
				>
					<X className="size-3.5" /> Remover
				</Button>
			</div>
		);
	}

	return (
		<>
			<button
				className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-border border-dashed bg-muted/30 p-6 text-center transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-50"
				disabled={disabled || busy}
				onClick={() => fileInput.current?.click()}
				type="button"
			>
				{busy ? (
					<>
						<Spinner />
						<span className="text-muted-foreground text-xs">{status}</span>
					</>
				) : (
					<>
						<Upload className="size-6 text-muted-foreground" />
						<span className="text-xs">
							Arraste um vídeo ou clique para selecionar
						</span>
						<span className="text-[10px] text-muted-foreground">
							MP4/WebM · até 50MB, {MAX_VIDEO_DURATION_SECONDS}s
						</span>
					</>
				)}
			</button>
			<input
				accept="video/mp4,video/webm"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) {
						handleFile(file).catch(() => undefined);
					}
					e.target.value = "";
				}}
				ref={fileInput}
				type="file"
			/>
		</>
	);
}
```

- [ ] **Step 2: Fiar no `PublishFields`**

Em `fields/publish-fields.tsx`, importar e renderizar o campo abaixo da galeria de imagens (após o `<FieldError>{errors.images}</FieldError>`, ainda dentro do primeiro `<div className="flex flex-col gap-2">` ou logo após ele):

```tsx
import { ToolVideoField } from "../tool-video-field";
```

E no JSX, após o bloco da galeria:

```tsx
			<div className="flex flex-col gap-2">
				<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
					Vídeo (opcional)
				</span>
				<ToolVideoField
					disabled={disabled}
					onChange={(v) => onPatch(v)}
					value={{
						videoPosterUrl: values.videoPosterUrl ?? null,
						videoUrl: values.videoUrl ?? null,
					}}
				/>
				<FieldError>{errors.videoUrl}</FieldError>
			</div>
```

- [ ] **Step 3: check-types + lint**

```bash
bun --cwd apps/web check-types
bun --cwd apps/web run ../../node_modules/.bin/biome check src/app/dashboard/tools/_components/tool-video-field.tsx || bunx ultracite check apps/web/src/app/dashboard/tools/_components/tool-video-field.tsx apps/web/src/app/dashboard/tools/_components/fields/publish-fields.tsx
```
Expected: limpos.

- [ ] **Step 4: Smoke visual (round-trip)**

Com `bun dev:web` (ou o server já rodando na 3006):
1. Abrir `/dashboard/tools/<id>/edit` → etapa "Imagens & publicação".
2. Subir um MP4 curto (<50MB, <60s). Confirmar: aparece o preview `<video>` com poster.
3. "Salvar alterações". Reabrir o tool → o vídeo persiste (preview presente).
4. Confirmar no DB: `select video_url, video_poster_url from tool where id = '<id>';` → ambas preenchidas.
5. Remover o vídeo, salvar, reabrir → ambas null; o objeto sumiu do bucket `tool-videos`.
6. Console sem erros (`read_console_messages onlyErrors`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-video-field.tsx apps/web/src/app/dashboard/tools/_components/fields/publish-fields.tsx
git commit -m "feat: campo de upload de vídeo na etapa de publicação de tools"
```

---

## Verificação final

- `bun --cwd apps/web check-types` limpo.
- `bun --cwd apps/web test` verde (inclui `video-validation` e `tool-schema`).
- `bun check` (ultracite) limpo nos arquivos tocados.
- Smoke round-trip da Task 7 ok.
- Após merge: o schema sincroniza pro ecommerce via CI; desbloquear emach-ecommerce#137 (render).
