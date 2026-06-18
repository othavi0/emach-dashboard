# Plan 023: Cobertura de testes para o validador CPF/CNPJ (cpf-cnpj.ts)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> ```
> git diff --stat 79379ef5..HEAD -- apps/web/src/lib/cpf-cnpj.ts
> ```
> If `apps/web/src/lib/cpf-cnpj.ts` changed since this plan was written,
> compare the "Current state" excerpts against the live code before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (pairs with plan 025 — consolidation of the duplicate CNPJ validator)
- **Category**: tests
- **Planned at**: commit `79379ef5`, 2026-06-17

## Why this matters

`apps/web/src/lib/cpf-cnpj.ts` é o boundary de validação de CPF/CNPJ do
dashboard: `documentZodRefine` é consumido pelos formulários de cliente e o
valor normalizado é persistido em `client.document` na DB compartilhada com o
ecommerce (ADR-0004). Com cobertura zero, um bug no dígito verificador poderia
aceitar documentos inválidos silenciosamente — ou rejeitar documentos válidos —
sem nenhum sinal de regressão. Este plano é uma **characterization test suite**:
descreve o comportamento atual; se um caso falhar, pode indicar um bug real no
verificador (o plano 025 cuidará da consolidação com `src/lib/validation/cnpj.ts`).

## Current state

### Arquivo sob teste

`apps/web/src/lib/cpf-cnpj.ts` — validação e formatação de CPF/CNPJ sem
dependências externas. Exporta (verificado em 2026-06-17):

```typescript
// cpf-cnpj.ts:6
export function normalizeDocument(input: string | null | undefined): string

// cpf-cnpj.ts:13
export function formatDocument(input: string | null | undefined): string

// cpf-cnpj.ts:30
export function isValidCpf(input: string | null | undefined): boolean

// cpf-cnpj.ts:61
export function isValidCnpj(input: string | null | undefined): boolean

// cpf-cnpj.ts:90
export function isValidDocument(input: string | null | undefined): boolean

// cpf-cnpj.ts:105
export function documentZodRefine(value: string): boolean
```

Detalhes relevantes do algoritmo (lidos diretamente do arquivo):

- **`normalizeDocument` (linha 10):** `input.replace(/\D+/g, "")` — strip de
  tudo que não é dígito.
- **`allSameDigit` (linha 26):** regex `ALL_SAME_DIGIT_RE = /^(\d)\1+$/` (linha
  24) — rejeita CPF/CNPJ com todos os dígitos iguais.
- **CPF DV1 (linhas 40-43):** `dv1 = (sum * 10) % 11`; se `dv1 === 10 → dv1 = 0`.
- **CPF DV2 (linhas 53-56):** mesma fórmula; se `dv2 === 10 → dv2 = 0`.
- **CNPJ DV1 (linhas 73-74):** `dv1 = sum % 11; dv1 = dv1 < 2 ? 0 : 11 - dv1`.
- **CNPJ DV2 (linhas 84-85):** mesma fórmula.
- **`isValidDocument` (linhas 92-98):** despacha por comprimento — 11 dígitos →
  `isValidCpf`; 14 dígitos → `isValidCnpj`; qualquer outro → `false`.
- **`documentZodRefine` (linhas 105-109):** retorna `true` para string vazia
  (caller usa `.optional()` quando o campo é opcional), senão `isValidDocument`.
- **`formatDocument` (linhas 15-22):** 11 dígitos → `XXX.XXX.XXX-XX`; 14
  dígitos → `XX.XXX.XXX/XXXX-XX`; demais → dígitos crus.

### Arquivo com segundo validador (referência, não modificar)

`apps/web/src/lib/validation/cnpj.ts` — validador separado (sem CPF, sem
`documentZodRefine`). Consolidação planejada no plano 025.

### Arquivo de teste inexistente

`apps/web/src/lib/__tests__/cpf-cnpj.test.ts` — **não existe**; este plano o
cria.

### Padrão de teste existente (referência estrutural)

`apps/web/src/lib/__tests__/auth-error.test.ts` — teste de função pura sem
mocks, importação direta, `describe`/`it`/`expect` do vitest. É o modelo a
seguir para este plano (funções puras, sem `vi.mock`).

`apps/web/src/lib/__tests__/discount-format.test.ts` — outro exemplar de
`describe` agrupando múltiplos `it` por comportamento.

### Convenções do projeto

- **Ambiente vitest:** `environment: node` (`apps/web/vitest.config.ts:6`).
- **Include pattern:** `src/**/*.test.ts` — o arquivo em `src/lib/__tests__/`
  é coberto automaticamente.
- **Alias `@`:** `path.resolve(import.meta.dirname, "src")` (vitest.config.ts:15).
- **Alias `server-only`:** stub vazio em `src/__mocks__/server-only.ts` — não
  necessário aqui (cpf-cnpj.ts não importa `server-only`).
- **Anti-patterns proibidos:** `console.*` (usar logger), `: any`/`as any`,
  `@ts-ignore`. Nenhum se aplica a um arquivo de teste de funções puras.
- **Conventional Commits em PT, subject ≤50 chars.**

## Commands you will need

| Purpose                     | Command                                                                   | Expected on success           |
|-----------------------------|---------------------------------------------------------------------------|-------------------------------|
| Rodar todos os testes       | `bun --cwd apps/web test`                                                 | exit 0, todos verdes          |
| Rodar só este teste         | `bun --cwd apps/web test src/lib/__tests__/cpf-cnpj.test.ts`             | exit 0, todos verdes          |
| Typecheck                   | `bun check-types`                                                         | exit 0, sem erros             |
| Lint                        | `bun check`                                                               | exit 0                        |
| Guard de forms              | `bun guard:forms`                                                         | exit 0                        |

## Scope

**In scope** (único arquivo a criar):
- `apps/web/src/lib/__tests__/cpf-cnpj.test.ts` (criar)

**Out of scope** (não tocar, mesmo que um teste falhe):
- `apps/web/src/lib/cpf-cnpj.ts` — este plano é characterization: se um caso
  esperado falhar, é sinal de bug no código de produção; registrar como STOP e
  não corrigir aqui.
- `apps/web/src/lib/validation/cnpj.ts` — consolidação planejada no plano 025.
- Qualquer outro arquivo do repo.

## Git workflow

- Branch: `advisor/023-tests-cpf-cnpj`
- Commit único ao fim do step 2 (ou por step se preferir):
  `testes: cobertura isValidCpf/Cnpj/Document/formatDocument`
- **Não** fazer push nem abrir PR sem instrução.

## Steps

### Step 1: Criar branch de trabalho

```bash
git checkout -b advisor/023-tests-cpf-cnpj
```

**Verify**: `git branch --show-current` → `advisor/023-tests-cpf-cnpj`

---

### Step 2: Criar `apps/web/src/lib/__tests__/cpf-cnpj.test.ts`

Criar o arquivo abaixo **exatamente** neste caminho. Não há arquivo preexistente
a ler; use a ferramenta Write diretamente.

O arquivo deve cobrir todos os casos listados na seção "Test plan". Use o
esqueleto abaixo como guia — você pode ajustar nomes de variáveis e comentários,
mas os casos de teste devem estar presentes:

```typescript
import { describe, expect, it } from "vitest";

import {
  documentZodRefine,
  formatDocument,
  isValidCnpj,
  isValidCpf,
  isValidDocument,
  normalizeDocument,
} from "../cpf-cnpj";

// CPF real válido para testes (Receita Federal — gerado por algoritmo,
// não pertence a pessoa física real).
// DV calculado: soma 1-9 ponderada por (10-i); (sum*10)%11; idem DV2.
const VALID_CPF_DIGITS = "529.982.247-25"; // dígitos: 52998224725
const VALID_CPF_NORMALIZED = "52998224725";

// CNPJ real válido para testes (empresa fictícia, não cadastrada).
const VALID_CNPJ_DIGITS = "11.222.333/0001-81"; // dígitos: 11222333000181
const VALID_CNPJ_NORMALIZED = "11222333000181";

describe("normalizeDocument", () => {
  it("remove pontuação de CPF formatado", () => {
    expect(normalizeDocument("529.982.247-25")).toBe("52998224725");
  });

  it("remove pontuação de CNPJ formatado", () => {
    expect(normalizeDocument("11.222.333/0001-81")).toBe("11222333000181");
  });

  it("retorna string vazia para null", () => {
    expect(normalizeDocument(null)).toBe("");
  });

  it("retorna string vazia para undefined", () => {
    expect(normalizeDocument(undefined)).toBe("");
  });

  it("retorna string vazia para string vazia", () => {
    expect(normalizeDocument("")).toBe("");
  });
});

describe("formatDocument", () => {
  it("formata 11 dígitos como CPF (XXX.XXX.XXX-XX)", () => {
    expect(formatDocument(VALID_CPF_NORMALIZED)).toBe("529.982.247-25");
  });

  it("formata 14 dígitos como CNPJ (XX.XXX.XXX/XXXX-XX)", () => {
    expect(formatDocument(VALID_CNPJ_NORMALIZED)).toBe("11.222.333/0001-81");
  });

  it("retorna dígitos crus para comprimento inválido (ex: 10)", () => {
    expect(formatDocument("1234567890")).toBe("1234567890");
  });

  it("normaliza antes de formatar (aceita entrada com pontuação)", () => {
    expect(formatDocument(VALID_CPF_DIGITS)).toBe("529.982.247-25");
  });
});

describe("isValidCpf", () => {
  it("aceita CPF válido (dígitos puros)", () => {
    expect(isValidCpf(VALID_CPF_NORMALIZED)).toBe(true);
  });

  it("aceita CPF válido com pontuação (normaliza internamente)", () => {
    expect(isValidCpf(VALID_CPF_DIGITS)).toBe(true);
  });

  it("rejeita todos-dígitos-iguais: 000.000.000-00", () => {
    expect(isValidCpf("00000000000")).toBe(false);
  });

  it("rejeita todos-dígitos-iguais: 111.111.111-11", () => {
    expect(isValidCpf("11111111111")).toBe(false);
  });

  it("rejeita todos-dígitos-iguais: 999.999.999-99", () => {
    expect(isValidCpf("99999999999")).toBe(false);
  });

  it("rejeita quando DV1 está errado (último dígito - 1, módulo ajustado)", () => {
    // Altera o 10º dígito (DV1) do CPF válido
    const corrupted =
      VALID_CPF_NORMALIZED.slice(0, 9) +
      String((Number(VALID_CPF_NORMALIZED[9]) + 1) % 10) +
      VALID_CPF_NORMALIZED[10];
    expect(isValidCpf(corrupted)).toBe(false);
  });

  it("rejeita quando DV2 está errado (último dígito)", () => {
    // Altera só o 11º dígito (DV2)
    const corrupted =
      VALID_CPF_NORMALIZED.slice(0, 10) +
      String((Number(VALID_CPF_NORMALIZED[10]) + 1) % 10);
    expect(isValidCpf(corrupted)).toBe(false);
  });

  it("rejeita comprimento diferente de 11 dígitos", () => {
    expect(isValidCpf("1234567890")).toBe(false); // 10 dígitos
    expect(isValidCpf("123456789012")).toBe(false); // 12 dígitos
  });

  it("rejeita null", () => {
    expect(isValidCpf(null)).toBe(false);
  });

  it("rejeita undefined", () => {
    expect(isValidCpf(undefined)).toBe(false);
  });
});

describe("isValidCpf — caso DV >= 10 -> 0", () => {
  // CPF cujo cálculo de DV produz resto 10 (mapeado para 0).
  // Exemplo: 000.000.001-91
  // sum(1-9) para "000000001": 1 * (10-8) = 2 → (2*10)%11 = 9 → DV1 = 9
  // Usar CPF com DV=0 derivado de soma que produz resto 10.
  // "01234567890" → calculado externamente: DV1 = ?
  // Por ser characterization, testamos simplesmente um CPF onde o dígito é 0
  // e ele é válido:
  it("aceita CPF cujo DV calculado é 0 (caso (sum*10)%11 == 10 → dv = 0)", () => {
    // CPF "100.000.001-08": base "100000001", (sum*10)%11 = 10 → DV1 = 0.
    // Verificado externamente pelo mesmo algoritmo de cpf-cnpj.ts: retorna true.
    expect(isValidCpf("10000000108")).toBe(true);
  });
});

describe("isValidCnpj", () => {
  it("aceita CNPJ válido (dígitos puros)", () => {
    expect(isValidCnpj(VALID_CNPJ_NORMALIZED)).toBe(true);
  });

  it("aceita CNPJ válido com pontuação (normaliza internamente)", () => {
    expect(isValidCnpj(VALID_CNPJ_DIGITS)).toBe(true);
  });

  it("rejeita todos-dígitos-iguais: 00.000.000/0000-00", () => {
    expect(isValidCnpj("00000000000000")).toBe(false);
  });

  it("rejeita todos-dígitos-iguais: 11.111.111/1111-11", () => {
    expect(isValidCnpj("11111111111111")).toBe(false);
  });

  it("rejeita quando DV1 está errado", () => {
    // Altera o 13º dígito (DV1)
    const corrupted =
      VALID_CNPJ_NORMALIZED.slice(0, 12) +
      String((Number(VALID_CNPJ_NORMALIZED[12]) + 1) % 10) +
      VALID_CNPJ_NORMALIZED[13];
    expect(isValidCnpj(corrupted)).toBe(false);
  });

  it("rejeita quando DV2 está errado", () => {
    // Altera o 14º dígito (DV2)
    const corrupted =
      VALID_CNPJ_NORMALIZED.slice(0, 13) +
      String((Number(VALID_CNPJ_NORMALIZED[13]) + 1) % 10);
    expect(isValidCnpj(corrupted)).toBe(false);
  });

  it("rejeita comprimento diferente de 14 dígitos", () => {
    expect(isValidCnpj("1234567890123")).toBe(false); // 13 dígitos
    expect(isValidCnpj("123456789012345")).toBe(false); // 15 dígitos
  });

  it("rejeita null", () => {
    expect(isValidCnpj(null)).toBe(false);
  });

  it("rejeita undefined", () => {
    expect(isValidCnpj(undefined)).toBe(false);
  });
});

describe("isValidDocument", () => {
  it("despacha para isValidCpf quando 11 dígitos (válido)", () => {
    expect(isValidDocument(VALID_CPF_NORMALIZED)).toBe(true);
  });

  it("despacha para isValidCnpj quando 14 dígitos (válido)", () => {
    expect(isValidDocument(VALID_CNPJ_NORMALIZED)).toBe(true);
  });

  it("retorna false para CPF inválido (11 dígitos, DV errado)", () => {
    expect(isValidDocument("00000000000")).toBe(false);
  });

  it("retorna false para CNPJ inválido (14 dígitos, todos iguais)", () => {
    expect(isValidDocument("00000000000000")).toBe(false);
  });

  it("retorna false para comprimento que não é 11 nem 14", () => {
    expect(isValidDocument("123456789012")).toBe(false); // 12 dígitos
    expect(isValidDocument("")).toBe(false);
  });

  it("aceita entrada com pontuação (normaliza internamente)", () => {
    expect(isValidDocument(VALID_CPF_DIGITS)).toBe(true);
    expect(isValidDocument(VALID_CNPJ_DIGITS)).toBe(true);
  });
});

describe("documentZodRefine", () => {
  it("retorna true para string vazia (campo opcional)", () => {
    expect(documentZodRefine("")).toBe(true);
  });

  it("retorna true para CPF válido", () => {
    expect(documentZodRefine(VALID_CPF_NORMALIZED)).toBe(true);
  });

  it("retorna true para CNPJ válido", () => {
    expect(documentZodRefine(VALID_CNPJ_NORMALIZED)).toBe(true);
  });

  it("retorna false para CPF inválido", () => {
    expect(documentZodRefine("00000000000")).toBe(false);
  });

  it("retorna false para CNPJ inválido", () => {
    expect(documentZodRefine("00000000000000")).toBe(false);
  });

  it("retorna false para comprimento arbitrário (não é CPF nem CNPJ)", () => {
    expect(documentZodRefine("123")).toBe(false);
  });
});
```

**ATENÇÃO — CPFs de exemplo usados no esqueleto:**

Os CPFs/CNPJs no esqueleto acima precisam ser válidos de verdade. Antes de usar,
confirme rodando `bun --cwd apps/web test src/lib/__tests__/cpf-cnpj.test.ts`
e verificando se os testes "aceita CPF válido" e "aceita CNPJ válido" passam.
Se falharem, significa que os valores de exemplo estão errados (não é bug no
código de produção) — substituir por valores válidos calculados externamente e
tentar de novo.

Para gerar um CPF válido pelo algoritmo do arquivo (sem deps externas), você
pode calcular manualmente ou usar o seguinte snippet Node uma vez:

```js
// Verificar se um CPF é válido pela mesma lógica de cpf-cnpj.ts
function checkCpf(digits) {
  const d = digits.replace(/\D/g,'');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let s=0; for(let i=0;i<9;i++) s+=parseInt(d[i])*(10-i);
  let dv1=(s*10)%11; if(dv1===10) dv1=0;
  if(dv1!==parseInt(d[9])) return false;
  s=0; for(let i=0;i<10;i++) s+=parseInt(d[i])*(11-i);
  let dv2=(s*10)%11; if(dv2===10) dv2=0;
  return dv2===parseInt(d[10]);
}
console.log(checkCpf("52998224725")); // deve ser true
```

**Verify**: `bun --cwd apps/web test src/lib/__tests__/cpf-cnpj.test.ts` →
todos os testes passam (verde), incluindo os casos de CPF/CNPJ válido.

---

### Step 3: Verificar typecheck e lint

```bash
bun check-types
bun check
bun guard:forms
```

**Verify**: todos os três comandos saem com exit 0 sem erros.

---

### Step 4: Garantir que a suíte completa continua verde

```bash
bun --cwd apps/web test
```

**Verify**: exit 0; baseline de 54 arquivos / 359 testes mais os novos testes
deste arquivo — nenhum teste existente regressou.

---

### Step 5: Commit

```bash
git add apps/web/src/lib/__tests__/cpf-cnpj.test.ts
git commit -m "testes: cobertura isValidCpf/Cnpj/Document/formatDocument"
```

**Verify**: `git log --oneline -1` mostra o commit com a mensagem acima.

## Test plan

**Arquivo a criar:** `apps/web/src/lib/__tests__/cpf-cnpj.test.ts`

**Modelo estrutural:** `apps/web/src/lib/__tests__/auth-error.test.ts` e
`apps/web/src/lib/__tests__/discount-format.test.ts` — funções puras, sem mocks,
`describe`/`it`/`expect` vitest.

**Casos por função:**

| Função             | Casos                                                                                                              |
|--------------------|--------------------------------------------------------------------------------------------------------------------|
| `normalizeDocument`| strip pontuação CPF formatado; strip pontuação CNPJ formatado; null → ""; undefined → ""; "" → ""                 |
| `formatDocument`   | 11 dígitos → `XXX.XXX.XXX-XX`; 14 dígitos → `XX.XXX.XXX/XXXX-XX`; comprimento inválido → dígitos crus; normaliza entrada com pontuação |
| `isValidCpf`       | válido puro; válido com pontuação; todos-iguais (000, 111, 999); DV1 errado; DV2 errado; comprimento errado; null; undefined; caso DV calculado = 0 |
| `isValidCnpj`      | válido puro; válido com pontuação; todos-iguais (00, 11); DV1 errado; DV2 errado; comprimento errado; null; undefined |
| `isValidDocument`  | despacha para CPF (válido); despacha para CNPJ (válido); CPF inválido; CNPJ inválido; comprimento nem 11 nem 14; aceita pontuação |
| `documentZodRefine`| "" → true; CPF válido → true; CNPJ válido → true; CPF inválido → false; CNPJ inválido → false; comprimento arbitrário → false |

**Verificação final:** `bun --cwd apps/web test src/lib/__tests__/cpf-cnpj.test.ts`
→ todos os casos passam.

## Done criteria

Machine-checkable. TODOS devem ser verdade:

- [ ] `bun check-types` sai com exit 0
- [ ] `bun check` sai com exit 0
- [ ] `bun guard:forms` sai com exit 0
- [ ] `bun --cwd apps/web test src/lib/__tests__/cpf-cnpj.test.ts` sai com exit 0, todos os testes verdes
- [ ] `bun --cwd apps/web test` sai com exit 0; nenhum teste preexistente regressou
- [ ] Apenas `apps/web/src/lib/__tests__/cpf-cnpj.test.ts` foi criado (`git status` mostra só esse arquivo)
- [ ] `plans/README.md` tem a linha de status deste plano atualizada para `DONE`

## STOP conditions

Parar e reportar (não improvisar) se:

1. O drift check detectar que `apps/web/src/lib/cpf-cnpj.ts` mudou desde
   commit `79379ef5` — revalidar as assinaturas e o algoritmo antes de
   continuar.
2. Um teste de "aceita CPF/CNPJ válido" falhar após confirmar que os valores
   de exemplo são matematicamente corretos — isso indica **bug real no verificador**
   de produção. **Não corrigir `cpf-cnpj.ts`**; registrar o caso exato que falhou
   e a divergência esperada vs. recebida.
3. `bun check-types` ou `bun check` falhar por causa do novo arquivo de teste —
   reportar o erro exato; não fazer cast `as any` nem adicionar `@ts-ignore`.
4. Qualquer teste preexistente regredir após a criação do arquivo — reportar;
   não tentar corrigir outros arquivos.
5. `bun --cwd apps/web test` ultrapassar 2 minutos — pode ser timeout de CI;
   reportar sem tentar workaround.

## Maintenance notes

- **Plano 025** fará a consolidação de `src/lib/validation/cnpj.ts` com
  `src/lib/cpf-cnpj.ts`. Após essa consolidação, rever se os testes deste plano
  precisam ser migrados ou expandidos para cobrir a implementação unificada.
- Se um campo de formulário novo usar `documentZodRefine` com variante diferente
  (ex: aceitar apenas CPF, ou apenas CNPJ), o schema Zod no caller deve aplicar
  `isValidCpf`/`isValidCnpj` diretamente em vez de `documentZodRefine` — e novos
  testes devem cobrir essa restrição específica.
- O reviewer deve verificar que os valores de CPF/CNPJ de exemplo não são
  documentos reais cadastrados em nome de pessoas físicas (usar geradores de
  dígito verificador fictícios, não CPFs de pessoas reais).
