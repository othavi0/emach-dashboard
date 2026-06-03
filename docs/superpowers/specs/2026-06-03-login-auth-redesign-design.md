# Redesign da tela de login + família de telas de auth

> Spec de design. Data: 2026-06-03. Status: aprovado para implementação da Slice 1.
> Brainstorm conduzido com visual companion (mockups em `.superpowers/brainstorm/155956-1780495707/`) + impeccable (register: product).

## 1. Problema

A tela de login (`apps/web/src/app/login/page.tsx` + `apps/web/src/components/auth-card.tsx`) é a única tela crua do produto — `Card` shadcn centrado, zero uso do sistema editorial (Cormorant, coral, surfaces warm-dark, AAA) que o resto do dashboard usa. É a primeira impressão e a mais sem graça. Além do visual, carrega slop funcional acumulada do bootstrap de autenticação:

- **Sign-up público** no mesmo card (toggle "Criar conta") — qualquer um cria conta `pending`. Superfície de risco num admin interno.
- **`AppHeader` renderiza por cima do login** (vem do root layout `apps/web/src/app/layout.tsx`): wordmark + botão "Entrar" redundante numa tela que já é a entrada.
- **Sem "esqueci minha senha"** — tabela `verification` existe e está ociosa.
- **Sem verificação de email** (`packages/auth/src/dashboard.ts`: `emailAndPassword` só `enabled: true`).
- **Erros vazam em inglês** via `toast` (`error.error.message`) — sem mapa pt-BR. Viola `apps/web/CLAUDE.md` (painel de erro, não toast genérico).
- **Copy sem acentos:** "Ainda nao tem acesso?", "Ja tenho conta", "Ja possui acesso?"; metadata "gestao".

## 2. Decisões travadas (brainstorm)

| Tema | Decisão |
|---|---|
| Modelo de cadastro | **Convite-only** — admin gera link/token; sem auto-cadastro público |
| Escopo deploy-ready | Login + **esqueci minha senha (reset por email)** + **verificação de email** |
| Sequenciamento | Desenhar a **família visual inteira** agora; implementar **login primeiro** (deploy-ready sozinho); backend (email/reset/verificação/convite) em slices seguintes |
| Direção visual | **A2** — split editorial, hero `surface-deep` + acento coral (vs A1 coral drenched, vs B card central, vs C well dramático) |
| pending/suspended | **Migram** pro novo `AuthShell` já na Slice 1 |
| Link "esqueci senha" | Tela `/esqueci-senha` **construída e navegável** na Slice 1, **submit inativo** até a slice de email transport |

## 3. Linguagem visual (direção A2)

Tudo via tokens do `DESIGN.md` / `packages/ui/src/styles/globals.css` — **nunca hex literal**.

- **Layout:** split em duas colunas (`grid-cols-[1.05fr_0.95fr]` aprox). Em mobile (`< md`), o hero colapsa pra uma faixa compacta no topo (wordmark + display reduzido) e o formulário ocupa a largura — responsividade estrutural, não tipografia fluida.
- **Hero (constante em todas as telas):**
  - Fundo `bg-surface-deep` (o nível mais escuro / "well" do sistema) + halo radial coral sutil no canto superior.
  - Wordmark EMACH real: `next/image` de `/emach-nome-branco.svg` (mesmo asset do sidebar, `alt="Emach"`).
  - Display Cormorant `font-serif text-5xl font-medium tracking-tight` (este é o "login hero" que o `DESIGN.md` sempre previu e nunca foi usado): **"Painel de gestão"**, com "gestão" em `text-primary` (coral) + traço de acento coral 3px abaixo.
  - Tagline `text-muted-foreground` curta. Rodapé `text-[11px] uppercase tracking-wider`: "Acesso restrito · equipe interna".
- **Painel direito (troca por tela):** `bg-background`, formulário centrado, largura de leitura contida (~`max-w-sm`). Título em Cormorant (`font-serif text-2xl/3xl`), subtítulo `text-muted-foreground text-sm`.
- **Form controls:** `Input`/`Label`/`Button` do `@emach/ui` (padrão `border-input`, focus ring coral hairline). Campo de senha com toggle **mostrar/ocultar** (ícone `Eye`/`EyeOff` lucide, botão `ghost icon-sm`, `aria-label`). CTA primário coral (`Button` default), 1 por tela.
- **Movimento:** transições 150–250ms (padrão product). Sem orquestração de page-load. Respeita `prefers-reduced-motion`.
- **AAA:** contraste 7:1 body, focus ring visível, todos os estados (default/hover/focus/disabled/loading/error).

## 4. Arquitetura de componentes

**`AuthShell`** (novo, `apps/web/src/app/(auth)/_components/auth-shell.tsx` ou `src/components/auth/auth-shell.tsx`) — Server Component que renderiza o split + hero constante e recebe o painel direito via `children`. Uma unidade, um propósito: o chrome da família de auth. Reusado por login, esqueci-senha, reset, convite, verificar-email, pending, suspended e estados de token.

- **O que faz:** layout split + hero (wordmark, display, tagline, rodapé). Sem estado.
- **Como se usa:** `<AuthShell><LoginForm /></AuthShell>`.
- **Depende de:** asset do logo, tokens do design system. Nada de sessão.

**Form components** (Client Components, um por tela com interação): `LoginForm`, `ForgotPasswordForm`, etc. Cada um isolado, com seu próprio estado de submit/erro.

**Painel de erro** (`apps/web/CLAUDE.md`): caixa `bg-destructive` translúcida + `border-destructive`, mensagem pt-BR no topo do form. **Não** `toast.error` genérico.

**Remoção do `AppHeader`:** o `AppHeader` é renderizado pelo **root layout** (`apps/web/src/app/layout.tsx`) — um route group `(auth)` com layout próprio **não** consegue removê-lo (route groups herdam o root layout acima deles). A remoção correta é **estender o early-return do `AppHeader`**: ele já retorna `null` em `/dashboard` (`pathname.startsWith(DASHBOARD_ROUTE)`); adicionar as rotas de auth (`/login`, `/esqueci-senha`, `/pending`, `/suspended`, e futuras `/redefinir-senha`, `/convite`, `/verificar-email`) à mesma condição. Route group `(auth)` continua **opcional** como organização de pastas, mas não é o mecanismo de remoção do header.

## 5. Telas

### Slice 1 (implementa agora)

| Rota | Conteúdo | Estado |
|---|---|---|
| `/login` | "Entrar" + email + senha (toggle) + CTA "Entrar" + link "Esqueci minha senha" | Funcional. Erro → painel pt-BR. Loading → "Entrando…" |
| `/esqueci-senha` | "Recuperar acesso" + email + CTA "Enviar link" + "← Voltar para o login" | **Submit inativo** (botão desabilitado + hint "disponível em breve") até slice de email |
| `/pending` | Estado "Conta aguardando aprovação" + botão "Sair" | Migra do `Card` antigo pro `AuthShell` |
| `/suspended` | Estado "Acesso suspenso" + botão "Sair" | Migra do `Card` antigo pro `AuthShell` |

### Família visual (desenhada agora, implementada em slices futuras)

| Rota | Conteúdo |
|---|---|
| `/redefinir-senha?token=…` | "Nova senha" + senha + confirmar + CTA "Salvar nova senha" |
| `/convite?token=…` | "Criar seu acesso" + email (read-only do convite) + nome + senha + CTA "Ativar conta" |
| `/verificar-email` | Estado "Verifique seu email" + ícone + "Reenviar email" + voltar |
| token inválido/expirado | "Link expirado" + CTA "Solicitar novo link" |

## 6. Comportamento / limpeza (Slice 1)

- **Remover o toggle de sign-up** do login (vira convite-only). O `signUp.email` sai da tela; cadastro passa a ser só por convite (slice futura) / SQL (bootstrap, já documentado).
- **Remover `AppHeader`** das rotas de auth (via route group `(auth)`).
- **Mapa de erros Better Auth → pt-BR:** função `authErrorMessage(error)` que traduz os códigos comuns (`INVALID_EMAIL_OR_PASSWORD`, `USER_NOT_FOUND`, etc.) para mensagens pt-BR diretas (voz do `DESIGN.md` §8: "Email ou senha incorretos.", sem hedging). Fallback genérico pt-BR.
- **Corrigir acentos** em toda a copy de auth + metadata do `layout.tsx` ("gestão").
- `authClient.signIn.email` mantém o fluxo de redirect existente (`/dashboard`, com `/pending` e `/suspended` resolvidos pelo `page.tsx` do login via `getUserStatus`).

## 7. Fora de escopo desta slice (slices futuras, specs próprias)

1. **Email transport** (Resend provavelmente — Vercel-friendly; nenhuma infra hoje). Env var + callback `sendResetPassword`/`sendVerificationEmail` no `authDashboard`. **Dependência** de 2 e 3.
2. **Reset de senha** (wiring): ativar o submit de `/esqueci-senha` + construir `/redefinir-senha`. Better Auth `requestPasswordReset` + `resetPassword`.
3. **Verificação de email:** `requireEmailVerification` + `/verificar-email` + reenvio.
4. **Convite-only:** modelo de token (tabela nova ou reuso de `verification`), UI de geração em `/dashboard/users` (perto do `approval-sheet` existente), expiração/single-use, tela `/convite` de aceite.

## 8. Testes / verificação

- **`bun check-types`** + **`bun check`** (ultracite) antes de commit.
- **Smoke visual** obrigatório (mudança de UI): subir `bun dev:web`, visitar `/login`, `/esqueci-senha`, `/pending`, `/suspended`; verificar render, focus states, toggle de senha, painel de erro (login com credencial errada), responsividade mobile do hero colapsado. `check-types` não pega hook client em Server Component nem render quebrado — só o browser pega.
- **Acessibilidade:** focus ring visível, `aria-label` no toggle de senha, contraste AAA (hero coral-accent sobre surface-deep).
- Sem teste unitário novo obrigatório nesta slice (telas são composição visual + chamadas Better Auth existentes); cobertura de fluxo entra com o wiring de reset/convite.

## 9. Isolamento e clareza

- `AuthShell` tem um propósito (chrome da família), interface clara (`children`), sem dependência de sessão — testável e legível isolado.
- Cada form é uma unidade client isolada; trocar o miolo de uma tela não afeta as outras nem o shell.
- `auth-card.tsx` (o componente monolítico atual com sign-in+sign-up+toggle) é **substituído** por `AuthShell` + `LoginForm` — desfaz o acoplamento das duas responsabilidades num arquivo só.
