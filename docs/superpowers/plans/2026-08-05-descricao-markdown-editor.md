# Editor rico na descrição da ferramenta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Descrição de ferramenta editável em WYSIWYG (negrito/itálico/listas/quebras) gravando Markdown puro, com render fiel no detalhe.

**Architecture:** Componente client `MarkdownEditor` (Tiptap v3 com whitelist de extensões + `tiptap-markdown` para ler/gravar Markdown) substitui o `Textarea` em `identity-fields.tsx`, carregado por `next/dynamic` (`ssr: false`). `<ToolDescription>` ganha `remark-breaks` e estilos próprios do subset (as classes `prose` atuais são no-op — o plugin typography não existe no projeto). `tool.description` continua Markdown puro: sem schema change, sem migração.

**Tech Stack:** `@tiptap/react@^3.29.2`, `@tiptap/starter-kit@^3.29.2`, `tiptap-markdown@^0.9.0`, `remark-breaks@^4.0.0`, `happy-dom` (devDep, só p/ teste), react-markdown 10 + rehype-sanitize (já existentes).

**Spec:** `docs/superpowers/specs/2026-08-05-descricao-markdown-editor-design.md`

## Global Constraints

- CWD é a **raiz** do monorepo — nunca `cd apps/web`; deps via `bun add --cwd apps/web <pkg>`; testes via `bun --cwd apps/web test <path>`.
- Banco Supabase é único e compartilhado (dev = prod): o smoke cria no máximo 1 tool `EM-TEST-*` via app e **deleta ao terminar**. Nada de seed/truncate/reset.
- Proibido: `console.*` (usar `logger` de `apps/web/src/lib/logger.ts`), `: any`/`as any`/`@ts-ignore`, barrel files, `React.forwardRef`, `useMemo`/`useCallback` manuais (React Compiler ativo).
- Commits: Conventional Commits em PT, subject ≤50 chars. **ZERO atribuição de AI** em commit/PR/issue (sem "Generated with", sem "Co-Authored-By: Claude", sem 🤖).
- Gate antes de PR: `bun verify` (check-types + check + test) na raiz.
- Branch de trabalho: `descricao-boas` (já criada; spec comitado nela).
- Hook PostToolUse roda `bun fix` após Write/Edit — se um Edit subsequente falhar por `old_string`, re-ler o arquivo.
- O editor produz APENAS: parágrafos, **negrito**, *itálico*, listas (ul/ol), hard break. Sem headings, links, tabelas, imagens, HTML.

---

### Task 1: Render fiel no `<ToolDescription>` (remark-breaks + estilos próprios)

**Files:**
- Modify: `apps/web/src/components/tool-description.tsx`
- Test: `apps/web/src/components/__tests__/tool-description.test.ts` (novo)
- Modify: `apps/web/package.json` (dep `remark-breaks`)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `ToolDescription({ markdown }: { markdown: string | null | undefined })` — contrato inalterado; consumidores (`tools/[id]/_components/overview-tab.tsx`, `suppliers/[id]/_components/overview-tab.tsx`) não mudam.

- [ ] **Step 1: Instalar a dep**

```bash
bun add --cwd apps/web remark-breaks@^4.0.0
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `apps/web/src/components/__tests__/tool-description.test.ts`. Arquivo `.ts` (não `.tsx`) com `createElement` — evita depender de transform JSX no vitest. `react-markdown` v10 é sync, funciona com `renderToStaticMarkup` em env `node`.

```ts
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolDescription } from "../tool-description";

function render(markdown: string | null): string {
	return renderToStaticMarkup(createElement(ToolDescription, { markdown }));
}

describe("ToolDescription", () => {
	it("preserva quebra de linha simples como <br>", () => {
		expect(render("linha um\nlinha dois")).toContain("<br");
	});

	it("renderiza lista com marcador visível", () => {
		const html = render("- item um\n- item dois");
		expect(html).toContain("<ul");
		expect(html).toContain("list-disc");
	});

	it("renderiza lista numerada com marcador", () => {
		const html = render("1. um\n2. dois");
		expect(html).toContain("<ol");
		expect(html).toContain("list-decimal");
	});

	it("renderiza negrito como strong", () => {
		expect(render("**importante**")).toContain("<strong>importante</strong>");
	});

	it("não contém classes prose mortas", () => {
		expect(render("texto")).not.toContain("prose");
	});

	it("markdown vazio/null mostra placeholder", () => {
		expect(render(null)).toContain("Sem descrição.");
		expect(render("   ")).toContain("Sem descrição.");
	});
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/components/__tests__/tool-description.test.ts`
Expected: FAIL — sem `<br` (remark-breaks ausente) e sem `list-disc` (classes prose no-op).

- [ ] **Step 4: Implementar**

Substituir o conteúdo de `apps/web/src/components/tool-description.tsx` por:

```tsx
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkBreaks from "remark-breaks";

interface ToolDescriptionProps {
	markdown: string | null | undefined;
}

export function ToolDescription({ markdown }: ToolDescriptionProps) {
	if (!markdown?.trim()) {
		return <p className="text-muted-foreground text-sm">Sem descrição.</p>;
	}
	return (
		<div className="max-w-none text-foreground text-sm leading-relaxed [&_:is(h1,h2,h3,h4)]:mt-3 [&_:is(h1,h2,h3,h4)]:font-semibold [&_:is(h1,h2,h3,h4)]:first:mt-0 [&_li]:mt-1 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mt-2 [&_p]:first:mt-0 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
			<ReactMarkdown rehypePlugins={[rehypeSanitize]} remarkPlugins={[remarkBreaks]}>
				{markdown}
			</ReactMarkdown>
		</div>
	);
}
```

Nota: o estilo de headings existe só para os 2 blobs legados que podem conter `#` — o editor novo não produz heading.

- [ ] **Step 5: Rodar e ver passar**

Run: `bun --cwd apps/web test src/components/__tests__/tool-description.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/tool-description.tsx apps/web/src/components/__tests__/tool-description.test.ts apps/web/package.json bun.lock
git commit -m "fix: quebras e listas no render da descrição"
```

---

### Task 2: Extensões do editor + round-trip Markdown testado

**Files:**
- Create: `apps/web/src/components/markdown-editor-extensions.ts`
- Test: `apps/web/src/components/__tests__/markdown-editor-extensions.test.ts` (novo)
- Modify: `apps/web/package.json` (deps tiptap + happy-dom)

**Interfaces:**
- Consumes: nada.
- Produces: `buildDescriptionExtensions(): Extensions` (tipo `Extensions` de `@tiptap/core`) — usada pela Task 3 no `useEditor` e pelo teste. O Markdown serializado sai de `editor.storage.markdown.getMarkdown()` (API do `tiptap-markdown`).

- [ ] **Step 1: Instalar deps**

```bash
bun add --cwd apps/web @tiptap/react@^3.29.2 @tiptap/starter-kit@^3.29.2 tiptap-markdown@^0.9.0
bun add --cwd apps/web -d happy-dom
```

- [ ] **Step 2: Criar o módulo de extensões**

Criar `apps/web/src/components/markdown-editor-extensions.ts` (sem `"use client"` — módulo puro, importável no teste):

```ts
import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";

// Whitelist do spec: parágrafo, negrito, itálico, listas, hard break.
// Tudo além disso desligado — o render (ToolDescription) e a loja só estilizam esse subset.
export function buildDescriptionExtensions(): Extensions {
	return [
		StarterKit.configure({
			blockquote: false,
			code: false,
			codeBlock: false,
			heading: false,
			horizontalRule: false,
			link: false,
			strike: false,
			underline: false,
		}),
		Markdown.configure({
			breaks: true,
			html: false,
			transformPastedText: true,
		}),
	];
}
```

Se o `check-types` reclamar que `link`/`underline` não são chaves do StarterKit desta versão, removê-las do `configure` (significa que não vêm incluídas — mesmo efeito).

- [ ] **Step 3: Escrever o teste de round-trip que falha (ainda sem happy-dom configurado ele nem roda — o objetivo é validar a serialização)**

Criar `apps/web/src/components/__tests__/markdown-editor-extensions.test.ts`. O pragma na primeira linha troca o environment só deste arquivo (`Editor` do Tiptap precisa de DOM):

```ts
// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { buildDescriptionExtensions } from "../markdown-editor-extensions";

function roundTrip(markdown: string): string {
	const editor = new Editor({
		content: markdown,
		extensions: buildDescriptionExtensions(),
	});
	const out = editor.storage.markdown.getMarkdown();
	editor.destroy();
	return out;
}

describe("buildDescriptionExtensions", () => {
	it("preserva negrito, itálico e listas no round-trip", () => {
		const md = "**negrito** e *itálico*\n\n- item um\n- item dois";
		expect(roundTrip(md)).toBe(md);
	});

	it("preserva lista numerada", () => {
		expect(roundTrip("1. um\n2. dois")).toContain("1. um");
	});

	it("degrada heading colado (whitelist)", () => {
		expect(roundTrip("# Título")).not.toContain("#");
	});

	it("degrada tachado colado (whitelist)", () => {
		expect(roundTrip("~~riscado~~")).not.toContain("~~");
	});

	it("texto plano legado passa intacto", () => {
		expect(roundTrip("só um parágrafo simples")).toBe("só um parágrafo simples");
	});
});
```

- [ ] **Step 4: Rodar e ver o resultado**

Run: `bun --cwd apps/web test src/components/__tests__/markdown-editor-extensions.test.ts`
Expected: PASS se o Step 2 estiver correto (aqui o "fail first" é fraco porque módulo e teste nascem juntos — o valor do teste é travar a serialização contra upgrades futuros). Se falhar em assert exato de round-trip por normalização do serializer (ex: bullet `*` em vez de `-`), afrouxar o assert para `toContain` dos fragmentos (`"**negrito**"`, `"item um"`) — a semântica importa, o char do marcador não.

- [ ] **Step 5: Confirmar que a suíte inteira continua verde (env pragma não vazou)**

Run: `bun --cwd apps/web test`
Expected: PASS (694+ testes; os antigos seguem em env node).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/markdown-editor-extensions.ts apps/web/src/components/__tests__/markdown-editor-extensions.test.ts apps/web/package.json bun.lock
git commit -m "feat: extensões markdown do editor de descrição"
```

---

### Task 3: Componente `MarkdownEditor` (UI + toolbar)

**Files:**
- Create: `apps/web/src/components/markdown-editor.tsx`

**Interfaces:**
- Consumes: `buildDescriptionExtensions()` da Task 2.
- Produces: `MarkdownEditor({ id?, value, onChange, disabled?, "aria-invalid"? })` — `value: string` é Markdown; `onChange(markdown: string)` dispara a cada edição. Export **nomeado** (a Task 4 importa via `next/dynamic`).

Sem teste unit próprio: é integração de UI com DOM interativo (env node não cobre; a serialização — o núcleo — já está testada na Task 2). Verificação: `check-types` aqui + smoke visual na Task 5.

- [ ] **Step 1: Criar o componente**

Criar `apps/web/src/components/markdown-editor.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { cn } from "@emach/ui/lib/utils";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Bold, Italic, List, ListOrdered } from "lucide-react";
import { useEffect } from "react";
import { buildDescriptionExtensions } from "./markdown-editor-extensions";

interface MarkdownEditorProps {
	"aria-invalid"?: boolean | undefined;
	disabled?: boolean;
	id?: string;
	onChange: (markdown: string) => void;
	value: string;
}

export function MarkdownEditor({
	"aria-invalid": ariaInvalid,
	disabled = false,
	id,
	onChange,
	value,
}: MarkdownEditorProps) {
	const editor = useEditor({
		content: value,
		editable: !disabled,
		editorProps: {
			attributes: {
				"aria-multiline": "true",
				class: "min-h-24 px-2.5 py-2 text-xs outline-none",
				role: "textbox",
			},
		},
		extensions: buildDescriptionExtensions(),
		immediatelyRender: false,
		onUpdate: ({ editor: e }) => {
			onChange(e.storage.markdown.getMarkdown() as string);
		},
	});

	// value pode mudar por fora (hydrate do draft de localStorage pós-mount,
	// reset do form) — re-sincronizar sem loop: só quando diverge do estado interno.
	useEffect(() => {
		if (!editor) {
			return;
		}
		const current = editor.storage.markdown.getMarkdown() as string;
		if (value !== current) {
			editor.commands.setContent(value);
		}
	}, [editor, value]);

	useEffect(() => {
		editor?.setEditable(!disabled);
	}, [editor, disabled]);

	const active = useEditorState({
		editor,
		selector: ({ editor: e }) =>
			e
				? {
						bold: e.isActive("bold"),
						bulletList: e.isActive("bulletList"),
						italic: e.isActive("italic"),
						orderedList: e.isActive("orderedList"),
					}
				: null,
	});

	const controls = [
		{
			action: () => editor?.chain().focus().toggleBold().run(),
			icon: Bold,
			isActive: active?.bold,
			label: "Negrito (Ctrl+B)",
		},
		{
			action: () => editor?.chain().focus().toggleItalic().run(),
			icon: Italic,
			isActive: active?.italic,
			label: "Itálico (Ctrl+I)",
		},
		{
			action: () => editor?.chain().focus().toggleBulletList().run(),
			icon: List,
			isActive: active?.bulletList,
			label: "Lista com marcadores",
		},
		{
			action: () => editor?.chain().focus().toggleOrderedList().run(),
			icon: ListOrdered,
			isActive: active?.orderedList,
			label: "Lista numerada",
		},
	];

	return (
		<div
			aria-invalid={ariaInvalid}
			className={cn(
				"rounded-md border border-input bg-transparent transition-colors focus-within:ring-1 focus-within:ring-ring dark:bg-input/30",
				ariaInvalid &&
					"border-destructive ring-1 ring-destructive/20 dark:border-destructive/50",
				disabled && "cursor-not-allowed opacity-50"
			)}
			id={id}
		>
			<div className="flex items-center gap-0.5 border-border border-b px-1 py-0.5">
				{controls.map((control) => (
					<Button
						aria-label={control.label}
						aria-pressed={control.isActive}
						className={cn(control.isActive && "bg-muted text-foreground")}
						disabled={disabled}
						key={control.label}
						onClick={control.action}
						size="icon-xs"
						title={control.label}
						type="button"
						variant="ghost"
					>
						<control.icon />
					</Button>
				))}
			</div>
			<EditorContent editor={editor} />
		</div>
	);
}
```

Pontos que NÃO são opcionais:
- `immediatelyRender: false` — sem isso o Tiptap tenta renderizar no SSR e quebra hidratação.
- `type="button"` nos controles — dentro de `<form>`, botão sem type submete o form.
- O `useEffect` de re-sync — o wizard hidrata draft do `localStorage` pós-mount (`use-tool-draft.ts`); sem o sync o draft não aparece no editor.
- `aria-invalid` no wrapper — o `focusFirstError` acha o campo via `[aria-invalid="true"]`/`data-error` (padrão LabeledField do CLAUDE.md de apps/web).

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS. Se `useEditorState` não existir nesta versão de `@tiptap/react`, atualizar o import (é a API v3 para estado derivado sem re-render por transação — conferir com `find-docs`/context7 antes de improvisar).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/markdown-editor.tsx
git commit -m "feat: componente MarkdownEditor com toolbar"
```

---

### Task 4: Substituir o `Textarea` no form (wizard + edição)

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/fields/identity-fields.tsx` (campo Descrição, ~linhas 94–115)

**Interfaces:**
- Consumes: `MarkdownEditor` da Task 3 (export nomeado, via `next/dynamic`).
- Produces: nada novo — `onPatch({ description: string })` continua o contrato com `tool-form-state.ts`. Wizard e edição ganham juntos (fonte única `tool-sections.ts`).

- [ ] **Step 1: Trocar o campo**

Em `identity-fields.tsx`:

1. Adicionar no topo (junto aos imports; `identity-fields` já é `"use client"`):

```tsx
import dynamic from "next/dynamic";

const MarkdownEditor = dynamic(
	() =>
		import("@/components/markdown-editor").then((m) => ({
			default: m.MarkdownEditor,
		})),
	{
		loading: () => (
			<div className="h-32 animate-pulse rounded-md border border-input bg-muted/40" />
		),
		ssr: false,
	}
);
```

2. Substituir o bloco do `Textarea` da descrição:

```tsx
<LabeledField
	help={
		<HelpTooltip
			body="Selecione o texto e use a barra: negrito, itálico e listas. O que você vê aqui é como aparece na página da ferramenta."
			title="Editor de texto"
		/>
	}
	id="description"
	label="Descrição"
>
	{(field) => (
		<MarkdownEditor
			{...field}
			disabled={disabled}
			onChange={(markdown) => onPatch({ description: markdown })}
			value={values.description ?? ""}
		/>
	)}
</LabeledField>
```

3. Remover o import de `Textarea` se este era o único uso no arquivo (conferir com `rg -n "Textarea" apps/web/src/app/dashboard/tools/_components/fields/identity-fields.tsx`).

- [ ] **Step 2: Gate de tipos + lint + testes**

Run: `bun verify`
Expected: PASS (o CI roda `bun check` — o `check-types` sozinho não pega regra de lint).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/fields/identity-fields.tsx
git commit -m "feat: editor rico na descrição do cadastro"
```

---

### Task 5: Smoke visual com dado real (3 provas de pronto)

**Files:** nenhum — verificação no browser (dev server na porta 3007, tab do dev-up).

O banco é o compartilhado: criar **um** tool de teste e **deletar ao final**.

- [ ] **Step 1: Funcional (editor)** — abrir o wizard de nova ferramenta (`/dashboard/tools/new`), preencher o mínimo, e na Descrição: digitar um parágrafo, Enter, segundo parágrafo; selecionar uma palavra → clicar **B** → conferir que fica em negrito **na hora, sem asteriscos**; criar lista com marcadores de 2 itens pela toolbar; Shift+Enter dentro de um parágrafo (quebra simples). Nome do tool: prefixo `EM-TEST-`.

- [ ] **Step 2: Dados (markdown gravado)** — salvar (draft basta, não precisa ativar) e conferir o dado real: a `description` gravada deve ser Markdown limpo (`**palavra**`, `- item`), **sem HTML**. Conferir via a própria UI de edição (reabrir e ver o editor re-hidratar igual) e via query de leitura (ex: página de detalhe).

- [ ] **Step 3: Perceptual (render)** — abrir `/dashboard/tools/<id>` e comparar o bloco Descrição com o mockup aprovado no brainstorm (bloco "Depois"): parágrafos separados, quebra simples preservada, lista com marcador, negrito. Screenshot lado a lado.

- [ ] **Step 4: Regressão legada** — abrir um tool antigo com description em texto plano (se existir um dos 2 com blob) e conferir que o render não piorou (quebras de texto plano agora aparecem — melhora esperada).

- [ ] **Step 5: Limpar** — deletar o tool `EM-TEST-*` criado (guardar o id no Step 1 e excluir pela UI ou action de delete).

- [ ] **Step 6: Se algo falhou** — voltar à task correspondente; NÃO declarar pronto com só a prova funcional (regra do repo: false-done). Se tudo passou, seguir.

---

### Task 6: PR (`Closes #364`) + issue no ecommerce

**Files:** nenhum — entrega via `gh` CLI. Autorizado pelo pedido original do user ("quando comitarmos e criarmos o PR fechando o issue, criamos um issue lá no ecommerce").

- [ ] **Step 1: Push da branch**

```bash
git push -u origin descricao-boas
```

- [ ] **Step 2: Criar o PR** (RELER o body antes: zero atribuição de AI)

```bash
gh pr create --repo othavi0/emach-dashboard \
  --title "feat(catalogo): editor rico na descrição da ferramenta" \
  --body "$(cat <<'EOF'
## O que muda

- **Cadastro:** a Descrição do wizard/edição de ferramenta vira editor WYSIWYG (Tiptap v3, whitelist: negrito, itálico, listas, quebras). Selecionar palavra → **B** → negrito na hora, sem sintaxe visível. Grava Markdown puro em `tool.description` — sem mudança de schema, sem migração; descrições legadas abrem como parágrafos.
- **Exibição:** `<ToolDescription>` ganha `remark-breaks` (Enter simples vira quebra de verdade) e estilos próprios do subset — as classes `prose` anteriores eram no-op (`@tailwindcss/typography` nunca esteve instalado). A página de fornecedor reusa o componente e herda o conserto.
- **Invariante:** o editor só produz o que o render estiliza — o que se vê no campo é o que aparece no detalhe.

## Escopo vs #364

Closes #364. Decisão consciente: este PR resolve a camada de **escrita/exibição** da descrição. As partes 1–3 do issue (campos separados `highlights`/`boxContents`, specs para `tool_attribute_value`, textos fixos da loja fora do produto) ficam de fora; se voltarem à pauta, abrir issue própria por item.

## Ecommerce

A PDP hoje trata `description` como texto plano (othavi0/emach-ecommerce#213). Issue derivada aberta no repo da loja para renderizar o mesmo subset de Markdown.

## Verificação

- `bun verify` verde (testes novos: render do `ToolDescription` e round-trip Markdown das extensões).
- Smoke visual no wizard + detalhe com dado real (criado e removido tool `EM-TEST-*`).
EOF
)"
```

- [ ] **Step 3: Criar a issue no ecommerce** (RELER o body: zero atribuição de AI; ajustar `<PR>` para o número real do PR criado no Step 2)

```bash
gh issue create --repo othavi0/emach-ecommerce \
  --title "feat(pdp): renderizar descrição como Markdown" \
  --body "$(cat <<'EOF'
## Contexto

O dashboard agora edita `tool.description` em editor rico e grava **Markdown puro** (othavi0/emach-dashboard PR <PR>). O subset é fechado: parágrafos, **negrito**, *itálico*, listas (`-` e `1.`) e quebras de linha simples.

A PDP hoje renderiza `description` como texto plano (tratamento do #213: parágrafos por linha em branco + agrupamento de listas). Com Markdown no banco, esse tratamento passa a mostrar `**asteriscos**` crus.

## O que se pede

Substituir o tratamento de texto plano da PDP por render de Markdown do mesmo subset:

- `react-markdown` + `rehype-sanitize` (preset `defaultSchema`) + `remark-breaks` — mesma pilha do dashboard (`apps/web/src/components/tool-description.tsx` de lá como referência).
- Estilizar só o subset (p, strong, em, ul, ol, li) no visual da loja.
- Quebra de linha simples deve virar quebra de verdade (`remark-breaks`) — isso também melhora as descrições legadas em texto plano, que continuam válidas.

## Compatibilidade

- Descrição legada (texto plano) renderiza igual ou melhor — Markdown sem marcação é só texto.
- Nenhuma mudança de schema: o campo continua `tool.description`.
EOF
)"
```

- [ ] **Step 4: Registrar os links** — reportar ao user: URL do PR e da issue criada. **Não mergear** — merge é decisão do user.

---

## Self-review (feito na escrita do plano)

- **Spec coverage:** editor WYSIWYG whitelist (Tasks 2–3), substituição no form com `aria-invalid`/draft-hydrate (Task 4), `remark-breaks` + estilos próprios (Task 1), invariante WYSIWYG (whitelist = subset estilizado), sem schema change (nenhuma task toca `packages/db`), PR `Closes #364` com registro do descarte + issue ecommerce (Task 6), verificação 3 provas (Task 5). ✓
- **Placeholders:** nenhum TBD/TODO; todo step de código tem o código. ✓
- **Type consistency:** `buildDescriptionExtensions()` (Task 2) = consumida na Task 3; `MarkdownEditor` props (Task 3) = uso na Task 4 (`{...field}` fornece `id` + `aria-invalid`; `value`/`onChange`/`disabled` explícitos). ✓
- **Riscos apontados onde existem:** chaves do StarterKit por versão (Task 2 Step 2), `useEditorState` por versão (Task 3 Step 2), normalização do serializer (Task 2 Step 4).
