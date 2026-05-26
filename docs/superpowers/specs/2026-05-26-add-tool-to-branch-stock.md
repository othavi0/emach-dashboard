# Adicionar ferramenta ao estoque de uma filial

> Item #1 do follow-up out-of-scope da PR #66 (unificação tools×stock). Feature nova.

**Goal:** Em `/dashboard/branches/[id]/stock`, permitir cadastrar uma variant nova no estoque da filial via sheet lateral, sem precisar navegar até `/tools/[id]?tab=estoque`.

**Arquitetura:** Sheet lateral aberto por botão "+ Adicionar tool" no `PageHeader`. Combobox async lista variants **sem** `stock_level` na filial. Submit cria `stock_level` (PK `(variantId, branchId)`) + opcionalmente `stock_movement` `entrada_compra` se qty>0.

**Tech stack:** Next 16 RSC + React 19 + Server Actions + Drizzle + Base UI `Combobox`.

---

## Contexto & insight

`adjustStock` já chama `INSERT … ON CONFLICT DO NOTHING` em `stock_level` antes do update — então qualquer ajuste numa variant×branch sem row cria a row de carona. A funcionalidade backend **já existe**.

**O que falta:** UX local em `/branches/[id]/stock`. Hoje a página só mostra rows que já existem; tools sem `stock_level` na filial são invisíveis. Operador precisaria sair pra `/tools/[id]?tab=estoque` e clicar a célula da filial pra criar a row.

Esta feature é **discovery + atalho local** na visão da filial.

---

## Decisões trancadas

1. **UX = Sheet lateral** (consistente com `StockCellSheet`/`BranchStockEditSheet`).
2. **Combobox = variants** (não tools) — mostra `SKU · voltagem · nome da tool`. Lista variants que **não têm** `stock_level` nesta filial.
3. **Action atomic:** `addToolToBranchStock` insere `stock_level` + se `qty > 0`, insere `stock_movement` `reason='entrada_compra'` na mesma transação.
4. **Sem `onConflictDoNothing`:** insert rejeita duplicate. UI já filtra duplicates via search, mas defense-in-depth no server.
5. **Default qty inicial = 0**, limites = 0/0 (sem alerta).
6. **Nota opcional** — só faz sentido quando `qty > 0` (movement criado).
7. **Capability `stock.adjust`** (mesma do `adjustStock`).
8. **Sem multi-add:** sheet adiciona 1 variant por vez. Repetir é OK.
9. **Query search:** server action `searchVariantsNotInBranch(branchId, query, limit)` retorna até 20 resultados. Sem cursor (Combobox usa "buscar mais" via re-query).
10. **Status da tool:** só tools com `status IN ('active', 'out_of_stock')` aparecem. `draft` e `discontinued` filtradas.

---

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/app/dashboard/stock/_components/stock-adjustment-schema.ts` | Modify | + `addToolToBranchStockSchema` + tipo |
| `apps/web/src/app/dashboard/stock/actions.ts` | Modify | + `addToolToBranchStock` action + `searchVariantsNotInBranch` query + `VariantNotInBranchRow` type |
| `apps/web/src/app/dashboard/stock/_components/add-tool-to-branch-sheet.tsx` | **Criar** | Sheet com combobox + form |
| `apps/web/src/app/dashboard/branches/[id]/stock/_components/add-tool-button.tsx` | **Criar** | Botão wrapper (state local pro sheet) |
| `apps/web/src/app/dashboard/branches/[id]/stock/page.tsx` | Modify | + `action` slot no `PageHeader` (gated por `stock.adjust`) |

---

## Detalhes técnicos

### Schema

```typescript
export const addToolToBranchStockSchema = z.object({
	branchId: z.string().min(1, "Filial obrigatória"),
	variantId: z.string().min(1, "Variante obrigatória"),
	initialQty: z
		.int("Quantidade deve ser inteira")
		.min(0, "Quantidade não pode ser negativa")
		.max(999_999),
	minQty: z.int().min(0).max(999_999),
	reorderPoint: z.int().min(0).max(999_999),
	reasonNote: z.string().trim().max(500).optional(),
});

export type AddToolToBranchStockInput = z.infer<typeof addToolToBranchStockSchema>;
```

### Server action

```typescript
export async function addToolToBranchStock(
	input: AddToolToBranchStockInput
): Promise<ActionResult> {
	const session = await requireCapability("stock.adjust");
	const parsed = addToolToBranchStockSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues[0]?.message ?? "Entrada inválida" };
	}

	const { branchId, variantId, initialQty, minQty, reorderPoint, reasonNote } = parsed.data;

	try {
		await db.transaction(async (tx) => {
			await tx.insert(stockLevel).values({
				branchId,
				variantId,
				quantity: initialQty,
				minQty,
				reorderPoint,
				updatedAt: new Date(),
			});

			if (initialQty > 0) {
				await tx.insert(stockMovement).values({
					id: crypto.randomUUID(),
					branchId,
					variantId,
					previousQty: 0,
					newQty: initialQty,
					delta: initialQty,
					reason: "entrada_compra",
					reasonNote: reasonNote ?? null,
					actorType: "user",
					actorId: session.user.id,
				});
			}
		});
	} catch (error) {
		logger.error("addToolToBranchStock falhou", error);
		return { ok: false, error: "Não foi possível adicionar — verifique se já está cadastrada" };
	}

	revalidatePath(`/dashboard/branches/${branchId}/stock`);
	revalidatePath("/dashboard", "layout");
	return { ok: true, data: undefined };
}
```

### Search query

```typescript
export interface VariantNotInBranchRow {
	variantId: string;
	variantSku: string;
	variantVoltage: string | null;
	toolId: string;
	toolName: string;
}

export async function searchVariantsNotInBranch(
	branchId: string,
	query: string,
	limit = 20
): Promise<VariantNotInBranchRow[]> {
	await requireCapability("stock.read");

	const cleanQuery = query.trim();
	const conditions: SQL[] = [
		isNull(stockLevel.variantId),
		inArray(tool.status, ["active", "out_of_stock"]),
	];
	if (cleanQuery.length > 0) {
		const filter = or(
			ilike(tool.name, `%${cleanQuery}%`),
			ilike(toolVariant.sku, `%${cleanQuery}%`)
		);
		if (filter) conditions.push(filter);
	}

	return await db
		.select({
			variantId: toolVariant.id,
			variantSku: toolVariant.sku,
			variantVoltage: toolVariant.voltage,
			toolId: tool.id,
			toolName: tool.name,
		})
		.from(toolVariant)
		.innerJoin(tool, eq(tool.id, toolVariant.toolId))
		.leftJoin(
			stockLevel,
			and(
				eq(stockLevel.variantId, toolVariant.id),
				eq(stockLevel.branchId, branchId)
			)
		)
		.where(and(...conditions))
		.orderBy(asc(tool.name))
		.limit(limit);
}
```

### Sheet UX

```tsx
"use client";

interface Props {
	branchId: string;
	branchName: string;
	onClose: () => void;
	open: boolean;
}

export function AddToolToBranchSheet({ branchId, branchName, onClose, open }: Props) {
	const [search, setSearch] = useState("");
	const [results, setResults] = useState<VariantNotInBranchRow[]>([]);
	const [selected, setSelected] = useState<VariantNotInBranchRow | null>(null);
	const [initialQty, setInitialQty] = useState<number>(0);
	const [minQty, setMinQty] = useState<number>(0);
	const [reorderPoint, setReorderPoint] = useState<number>(0);
	const [reasonNote, setReasonNote] = useState("");
	const [pending, startTransition] = useTransition();
	const [searching, startSearch] = useTransition();
	const router = useRouter();

	// debounce search → searchVariantsNotInBranch
	useEffect(() => {
		const handle = setTimeout(() => {
			startSearch(async () => {
				setResults(await searchVariantsNotInBranch(branchId, search, 20));
			});
		}, 200);
		return () => clearTimeout(handle);
	}, [branchId, search]);

	function handleSubmit() {
		if (!selected) return;
		startTransition(async () => {
			const result = await addToolToBranchStock({
				branchId,
				variantId: selected.variantId,
				initialQty,
				minQty,
				reorderPoint,
				reasonNote: reasonNote.trim() === "" ? undefined : reasonNote.trim(),
			});
			if (result.ok) {
				toast.success("Ferramenta adicionada");
				router.refresh();
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	// reset on close
	useEffect(() => {
		if (!open) {
			setSearch(""); setSelected(null); setInitialQty(0);
			setMinQty(0); setReorderPoint(0); setReasonNote("");
		}
	}, [open]);

	return (
		<Sheet open={open} onOpenChange={(o) => !o && onClose()}>
			<SheetContent className="...">
				<SheetTitle>Adicionar ao estoque</SheetTitle>
				<p>Filial: {branchName}</p>

				{!selected ? (
					<>
						{/* Combobox-like UI: Input + result list */}
						<Label>Ferramenta</Label>
						<Input
							placeholder="Buscar por nome ou SKU…"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
						{searching ? <Spinner /> : (
							<ul>
								{results.map((v) => (
									<li key={v.variantId} onClick={() => setSelected(v)}>
										{v.toolName} · {v.variantSku}
										{v.variantVoltage ? ` · ${v.variantVoltage}` : ""}
									</li>
								))}
								{results.length === 0 && search.length > 0 && (
									<p>Nenhuma variante disponível.</p>
								)}
							</ul>
						)}
					</>
				) : (
					<>
						<div>{selected.toolName} · {selected.variantSku} {selected.variantVoltage}</div>
						<Button variant="ghost" onClick={() => setSelected(null)}>Trocar</Button>

						<Label>Quantidade inicial</Label>
						<MaskedInput value={initialQty} onChange={(v) => setInitialQty(v ?? 0)} />

						<Label>Limites de alerta (opcional)</Label>
						<div className="grid grid-cols-2 gap-2">
							<MaskedInput value={minQty} onChange={(v) => setMinQty(v ?? 0)} />
							<MaskedInput value={reorderPoint} onChange={(v) => setReorderPoint(v ?? 0)} />
						</div>

						{initialQty > 0 && (
							<>
								<Label>Nota (opcional)</Label>
								<Textarea
									placeholder="NF #1234, fornecedor X…"
									rows={2}
									value={reasonNote}
									onChange={(e) => setReasonNote(e.target.value)}
								/>
							</>
						)}

						<Button onClick={handleSubmit} disabled={pending}>
							{pending ? <><Spinner /> Adicionando…</> : "Adicionar"}
						</Button>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
```

### Botão wrapper

`AddToolButton` é client component que mantém state `open` e renderiza o sheet. Page.tsx (server) passa `branchId`, `branchName` e renderiza condicional via capability check.

```tsx
"use client";

interface Props {
	branchId: string;
	branchName: string;
}

export function AddToolButton({ branchId, branchName }: Props) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button onClick={() => setOpen(true)} size="sm">
				<Plus className="size-4" /> Adicionar tool
			</Button>
			<AddToolToBranchSheet
				branchId={branchId}
				branchName={branchName}
				onClose={() => setOpen(false)}
				open={open}
			/>
		</>
	);
}
```

### Page integration

```tsx
const canMutate = can(session, "stock.adjust");

<PageHeader
	action={canMutate ? <AddToolButton branchId={id} branchName={detail.name} /> : null}
	description="Ajuste quantidades e configure limites de alerta por ferramenta."
	title={`Estoque — ${detail.name}`}
/>
```

---

## Riscos & mitigações

1. **Combobox async sem `<Combobox>` Base UI:** o sheet usa um padrão Input+lista simples (debounced). Pra acelerar, considerar `<Combobox>` do `@emach/ui` em iteração futura. Aceitável pra primeira versão.
2. **Race entre debounce e select:** `setSelected` deve cancelar debounce em curso (useRef + cancelar). Edge case — vou usar `useTransition` que naturalmente cancela startTransition pendentes.
3. **Tool search query perf:** `tool.name` e `tool_variant.sku` precisam ter index. Verificar no schema; adicionar se faltar.
4. **Insert sem `onConflictDoNothing`:** PK `(variantId, branchId)` rejeita duplicates. UI filtra via `LEFT JOIN stockLevel WHERE NULL`, mas race condition (dois operadores adicionando ao mesmo tempo) cai no catch com erro genérico. Mensagem "verifique se já está cadastrada" cobre.
5. **`stock.adjust` capability:** verificar se non-`super_admin` é escopado por filial (não deve adicionar em filial fora do `user_branch`). `requireCapability` puro **não escopa** por filial — usar `requireCapabilityWithContext` com `targetBranchIds: [branchId]`.

---

## Test Plan

- [ ] `bun check-types` 0 erros.
- [ ] `/dashboard/branches/[id]/stock`:
  - [ ] Botão "+ Adicionar tool" visível pra super_admin/admin/manager (cap `stock.adjust`).
  - [ ] Botão ausente pra `user` (sem cap).
  - [ ] Sheet abre ao clicar.
  - [ ] Busca por nome filtra resultados (variants já cadastradas não aparecem).
  - [ ] Busca por SKU filtra resultados.
  - [ ] Selecionar variant mostra summary + Trocar button.
  - [ ] Qty inicial = 0 → submit OK, row criada, **sem** stock_movement.
  - [ ] Qty inicial = 10 → submit OK, row criada, stock_movement `entrada_compra` delta=10.
  - [ ] Após add → toast verde, sheet fecha, lista revalida, ferramenta aparece no grid.
- [ ] non-super_admin tenta adicionar em filial fora do escopo → erro (capability deny).
- [ ] Duplicate (race) → catch retorna mensagem amigável.

---

## Próximos passos

Spec aprovada → plano com tasks granulares → execução inline (5-6 tasks, PR único).
