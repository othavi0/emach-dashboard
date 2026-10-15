# anti-slop vendorizado

- Origem: https://github.com/dmmulroy/anti-slop
- Commit: `13909c9e07590f5a85d93c62712259fe14a883f7`
- Copiado em: 2026-10-14, da cópia de `othavi0/emach-ecommerce` (PR #266), idêntica ao `src/` upstream nesse commit.
- Caminho de origem: `src/` (canônico upstream), copiado para `tools/oxlint/anti-slop/`.
- Dependências: `oxlint` e `@oxlint/plugins` na mesma versão exata (1.78.0), devDependencies da raiz.

O `LICENSE` (MIT) da raiz do upstream foi copiado para cá; a cópia do ecommerce não o tem. O `vendor/eslint-stylistic/` traz o próprio `LICENSE` (MIT) e o próprio `UPSTREAM.md`; os dois seguem junto com o código.

## Desvios locais

- Os `*.test.ts` de `src/` não foram copiados. O RuleTester do upstream depende de `tsx` e não roda no CI daqui.
- O plugin Effect (`effect/`) foi copiado mas não está registrado em `.oxlintrc.json`: o repo não depende de `effect`.
- Severidade em `.oxlintrc.json`: todas as regras do plugin principal e `oxc/no-accumulating-spread` estão em `error`, como o upstream recomenda. A dívida inicial (795 avisos) foi zerada regra a regra antes de cada uma subir para `error`. A única exceção:
  - `off`: `no-module-mocking`. Teste unit mocka `@emach/db` porque o CI não tem banco.
- O código daqui fica fora do Biome (`biome.json`) e do próprio oxlint (`ignorePatterns`).
- O `ignorePatterns` também deixa de fora `packages/ui/**` (shadcn, regenerado pelo CLI).

## Atualizar

Buscar um commit explícito do upstream, comparar `src/` com esta cópia, portar as mudanças preservando os desvios acima e atualizar este arquivo. O `emach-ecommerce` tem a mesma cópia: atualizar os dois juntos.
