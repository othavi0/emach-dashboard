# Guard de enforcement contra erro de validação não-fiado (#157)

> Spec de design. Issue: #157 (`chore(forms): guard de enforcement contra erro de validação não-fiado`).
> Depende de #154 (componente `<LabeledField>`) e #155 (migração) — ambos **CLOSED**.

## Problema

A fiação de erro por campo — `Label` + `aria-invalid` no controle + `<FieldError>` abaixo — foi
encapsulada no `<LabeledField>` (#154) e propagada a todos os forms (#155). Mas o componente é uma
**convenção**, não uma barreira: um autor futuro pode reintroduzir um `<p>` de erro cru
(`<p className="text-destructive">{errors.x}</p>`) e o campo perde silenciosamente o realce e a âncora
de scroll do `focusFirstError`. Não há lint nem tipo que pegue isso.

Este guard barra a regressão **no nível de tooling**, falhando o CI.

## Contexto verificado (2026-06-14)

- **Base já 100% limpa** pós-#155: zero ocorrências de `text-destructive` ligado a `{errors.X}`. O guard
  é **puramente preventivo** — não há nada a corrigir agora.
- Os `<p className="text-destructive">` remanescentes na base são **erros de fetch/runtime**
  (`{error}` de estado local: `activity-tab-client`, `infinite-sentinel`, `variants-editor/tab`,
  `destructive-action-dialog`, texto literal em `social-settings-form`). **Não** são erros de validação
  e **não** devem ser barrados. → O discriminador correto é `{errors.X}` (member_expression de objeto
  `errors`), não todo `text-destructive`.
- **Não existe CI de lint hoje**: `.github/workflows/` só tem `sync-db-schema.yml`. Sem husky/lefthook.
  O guard precisa de um lugar novo para rodar.
- ast-grep 0.43.0 disponível localmente; Biome subiu a 2.4.15 (já suporta plugins GritQL).

## Decisões (HITL — aprovadas)

| Eixo | Escolha | Razão |
|---|---|---|
| Mecanismo | **ast-grep** (regra YAML versionada) | AST preciso, sem dep de plugin API, citado no issue + CLAUDE.md |
| Severidade | **error** (bloqueia CI) | base já limpa → zero falso positivo hoje, sem período de graça a absorver |
| Escopo | **só `{errors.X}` cru** em elemento `text-destructive` | alta precisão; o stretch `aria-invalid` ausente fica fora |
| Onde roda | **novo workflow GitHub Actions** dedicado | atende "rodando no CI"; não polui `sync-db-schema.yml` |

## A regra (validada por probe)

Casa um `jsx_element` que tem **as duas** condições:

1. `text-destructive` no className do **próprio** `open_tag` (corta Classe A — ver abaixo).
2. Um filho `{…}` (`jsx_expression`) contendo um `member_expression` cujo objeto é o identifier
   `errors`, que **não** seja callee de uma chamada (corta Classe B — `errors.map(...)`).

```yaml
id: raw-validation-error
language: tsx
severity: error
message: >-
  Erro de validação renderizado fora do padrão <FieldError>/<LabeledField>.
  Use <FieldError>{errors.campo?.message}</FieldError> ou <LabeledField error={errors.campo}>.
  Exceção legítima: // ast-grep-ignore: raw-validation-error <motivo>
note: |
  Detecta <p|span|div className="...text-destructive...">{errors.X}</...> cru.
  NÃO casa: <FieldError>, {error} de fetch (identifier solto), asterisco required
  aninhado (className em filho), nem errors.map(...) (array local).
rule:
  kind: jsx_element
  all:
    - has:
        field: open_tag
        has:
          kind: jsx_attribute
          all:
            - has: { kind: property_identifier, regex: '^className$' }
            - has: { stopBy: end, kind: string, regex: 'text-destructive' }
    - has:
        kind: jsx_expression
        has:
          stopBy: end
          kind: member_expression
          all:
            - has: { field: object, stopBy: end, kind: identifier, regex: '^errors$' }
            - not: { inside: { kind: call_expression, field: function } }
```

### Falsos positivos descobertos no probe e como são cortados

Uma versão ingênua da regra (com `stopBy: end` irrestrito) produziu **4 falsos positivos** na base real,
de duas classes:

- **Classe A — estrutural** (`identity-fields.tsx:61/104`): um `<div>` externo casava porque o
  `text-destructive` (asterisco de campo `required`) e um `{errors.X}` qualquer estavam em descendentes
  **não-relacionados** do mesmo subtree. **Corte:** exigir o className no `field: open_tag` do próprio
  elemento, não em qualquer descendente.
- **Classe B — semântica** (`attachment-upload-form.tsx:70`): `{errors.map((e) => ...)}` onde `errors` é
  um **array local de strings** de upload, não o `formState.errors` do react-hook-form. **Corte:**
  `not inside call_expression field:function` exclui o member_expression que é callee de chamada.

Após os cortes: casa os 3 anti-padrões de teste (`errors.x`, `errors.x?.message`, `errors.x.message`) e dá
**zero match na base real**.

## Artefatos

1. **`tooling/ast-grep/rules/raw-validation-error.yml`** — a regra acima.
2. **`sgconfig.yml`** (raiz) — `ruleDirs: [tooling/ast-grep/rules]`. Permite `ast-grep scan` sem `-r` e deixa
   futuros guards AST caírem na mesma pasta sem tocar no CI.
3. **`package.json`** (raiz) — `@ast-grep/cli` pinado em `devDependencies` + script `"guard:forms": "ast-grep scan"`.
   Pinar via npm garante **CI = local** (não depender do binário 0.43.0 do sistema).
4. **`.github/workflows/forms-guard.yml`** — `on: [pull_request, push]`; `bun install`; `bun guard:forms`.
   Exit 1 da regra ⇒ job vermelho ⇒ PR bloqueado. Workflow próprio, **não** anexado ao `sync-db-schema.yml`.
5. **Teste do guard** — `tooling/ast-grep/rules/__tests__/raw-validation-error.yml` (casos `valid`/`invalid`,
   rodados por `ast-grep test`). Anti-regressão da própria regra: um tweak futuro não pode parar de pegar o
   padrão silenciosamente.
6. **Doc** — uma linha em `apps/web/CLAUDE.md` (seção "Feedback de erro de validação") referenciando o guard
   e o escape hatch `// ast-grep-ignore: raw-validation-error <motivo>`.

## Fora de escopo (follow-ups)

- Stretch `aria-invalid` ausente em input que recebe `errors.X` fora de `<LabeledField>` — escolhido **não**
  cobrir. A pasta `rules/` deixa pronto para adicionar depois como segunda regra.
- Migrar o CI a também rodar `bun check`/`check-types` (inexistentes em CI hoje) — concern separado; não
  embolar com o guard.

## Acceptance criteria → cobertura

- [x] Mecanismo escolhido (ast-grep) e implementado, rodando no CI (workflow próprio).
- [x] Guard falha quando erro de validação é renderizado fora de `<FieldError>`/`<LabeledField>`.
- [x] Zero falso positivo na base atual (provado por probe) + escape hatch documentado.
- [x] Convenção em `apps/web/CLAUDE.md` referencia o guard.
