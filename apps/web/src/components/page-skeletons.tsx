import { Skeleton } from "@emach/ui/components/skeleton";
import { cn } from "@emach/ui/lib/utils";

// Chaves estáveis (nunca index) — listas fixas que não reordenam.
const FILTER_SLOTS = ["busca", "f1", "f2", "f3", "f4"] as const;
const CARD_SLOTS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] as const;
const METRIC_SLOTS = ["m1", "m2", "m3"] as const;
const TABLE_COLS = ["col1", "col2", "col3", "col4", "col5"] as const;
const TABLE_ROWS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"] as const;
const TAB_SLOTS = ["t1", "t2", "t3", "t4"] as const;
const FIELD_SLOTS = ["fld1", "fld2", "fld3", "fld4", "fld5", "fld6"] as const;
const KPI_SLOTS = ["k1", "k2", "k3", "k4"] as const;
const TREE_ROWS = [
	{ id: "tr1", pad: "" },
	{ id: "tr2", pad: "pl-6" },
	{ id: "tr3", pad: "pl-6" },
	{ id: "tr4", pad: "pl-12" },
	{ id: "tr5", pad: "" },
	{ id: "tr6", pad: "pl-6" },
	{ id: "tr7", pad: "pl-6" },
] as const;

/** Espelha `<PageHeader>`: título + descrição à esquerda, ação opcional à direita. */
function PageHeaderSkeleton({ hasAction = true }: { hasAction?: boolean }) {
	return (
		<div className="flex items-start justify-between gap-4">
			<div className="flex flex-col gap-2">
				<Skeleton className="h-7 w-48" />
				<Skeleton className="h-4 w-80 max-w-full" />
			</div>
			{hasAction ? <Skeleton className="h-9 w-36 shrink-0" /> : null}
		</div>
	);
}

/** Espelha `<FiltersBar>`: linha de campos de filtro. */
function FiltersBarSkeleton() {
	return (
		<div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
			{FILTER_SLOTS.map((slot) => (
				<div className="flex flex-col gap-1" key={slot}>
					<Skeleton className="h-3 w-20" />
					<Skeleton
						className={slot === "busca" ? "h-9 w-full md:w-56" : "h-9 w-40"}
					/>
				</div>
			))}
		</div>
	);
}

/** Espelha `<EntityTabs>`: fileira de gatilhos de aba sobre uma borda. */
function TabsBarSkeleton() {
	return (
		<div className="flex gap-2 border-border border-b pb-2">
			{TAB_SLOTS.map((slot) => (
				<Skeleton className="h-8 w-24" key={slot} />
			))}
		</div>
	);
}

/** Grid de cards de mídia (imagem 16:9 + corpo + footer de 3 métricas). */
function MediaCardGridSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{CARD_SLOTS.map((slot) => (
				<div
					className="flex flex-col overflow-hidden rounded-[10px] border border-border bg-card"
					key={slot}
				>
					<Skeleton className="aspect-[16/9] w-full rounded-none" />
					<div className="flex flex-col gap-2 px-4 pt-3 pb-3">
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-3 w-1/2" />
					</div>
					<div className="grid grid-cols-3 border-border border-t">
						{METRIC_SLOTS.map((metric) => (
							<div
								className="flex flex-col items-center gap-1 py-2.5"
								key={metric}
							>
								<Skeleton className="h-4 w-6" />
								<Skeleton className="h-2 w-10" />
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

/** Grid de cards de identidade (avatar + nome/subtítulo + footer de métricas). */
function IdentityCardGridSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{CARD_SLOTS.map((slot) => (
				<div
					className="overflow-hidden rounded-[10px] border border-border bg-card"
					key={slot}
				>
					<div className="flex items-start gap-3 px-4 pt-4 pb-3">
						<Skeleton className="size-12 rounded-[10px]" />
						<div className="flex-1 space-y-2 pt-1">
							<Skeleton className="h-4 w-2/3" />
							<Skeleton className="h-3 w-1/2" />
						</div>
					</div>
					<div className="grid grid-cols-3 border-border border-t">
						{METRIC_SLOTS.map((metric) => (
							<div
								className="flex flex-col items-center gap-1.5 py-3"
								key={metric}
							>
								<Skeleton className="h-5 w-6" />
								<Skeleton className="h-2 w-10" />
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}

/** Tabela com cabeçalho + linhas (movimentações, estoque). */
function TableSkeleton() {
	return (
		<div className="overflow-hidden rounded-[10px] border border-border">
			<div className="flex items-center gap-4 border-border border-b bg-muted/40 px-4 py-3">
				{TABLE_COLS.map((col) => (
					<Skeleton className="h-3 flex-1" key={col} />
				))}
			</div>
			{TABLE_ROWS.map((row) => (
				<div
					className="flex items-center gap-4 border-border border-b px-4 py-4 last:border-b-0"
					key={row}
				>
					{TABLE_COLS.map((col) => (
						<Skeleton className="h-4 flex-1" key={`${row}-${col}`} />
					))}
				</div>
			))}
		</div>
	);
}

type ListVariant = "media" | "identity" | "table";

/**
 * Fallback de Suspense para listagens. Vai num `loading.tsx` de rota — sob
 * `cacheComponents` é o que o router exibe durante a navegação, no lugar da
 * área de conteúdo em branco. A `variant` casa a forma real da lista:
 * `media` (cards com imagem), `identity` (cards com avatar) ou `table` (linhas).
 */
export function ListPageSkeleton({
	variant = "media",
	hasFilters = true,
	hasAction = true,
}: {
	variant?: ListVariant;
	hasFilters?: boolean;
	hasAction?: boolean;
} = {}) {
	return (
		<>
			<PageHeaderSkeleton hasAction={hasAction} />
			{hasFilters ? <FiltersBarSkeleton /> : null}
			{variant === "media" ? <MediaCardGridSkeleton /> : null}
			{variant === "identity" ? <IdentityCardGridSkeleton /> : null}
			{variant === "table" ? <TableSkeleton /> : null}
		</>
	);
}

/**
 * Fallback para detalhe de entidade (`/dashboard/<recurso>/[id]`): header de
 * identidade (avatar + título + ação) + barra de abas + bloco de conteúdo.
 * `sideColumn` adiciona a coluna lateral de ações (ex.: detalhe de pedido).
 */
export function DetailPageSkeleton({
	sideColumn = false,
}: {
	sideColumn?: boolean;
} = {}) {
	const header = (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex min-w-0 items-center gap-3">
				<Skeleton className="size-12 shrink-0 rounded-[10px]" />
				<div className="space-y-2">
					<Skeleton className="h-5 w-48" />
					<Skeleton className="h-3 w-32" />
				</div>
			</div>
			<Skeleton className="h-9 w-32" />
		</div>
	);

	const body = (
		<div className="space-y-4">
			<TabsBarSkeleton />
			<Skeleton className="h-64 w-full" />
		</div>
	);

	return (
		<div className="flex flex-col gap-6 p-6">
			{header}
			{sideColumn ? (
				<div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,1fr)]">
					{body}
					<Skeleton className="h-80 w-full" />
				</div>
			) : (
				body
			)}
		</div>
	);
}

/** Fallback para páginas de formulário (`/new`, `/[id]/edit`): título + campos. */
export function FormPageSkeleton() {
	return (
		<div className="flex flex-col gap-6">
			<div className="space-y-2">
				<Skeleton className="h-7 w-56" />
				<Skeleton className="h-4 w-80 max-w-full" />
			</div>
			<div className="flex max-w-2xl flex-col gap-5">
				{FIELD_SLOTS.map((slot) => (
					<div className="flex flex-col gap-1.5" key={slot}>
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-9 w-full" />
					</div>
				))}
				<Skeleton className="h-9 w-32" />
			</div>
		</div>
	);
}

/** Fallback para a árvore de categorias: header + linhas indentadas. */
export function TreePageSkeleton() {
	return (
		<>
			<PageHeaderSkeleton />
			<div className="flex flex-col gap-2">
				{TREE_ROWS.map((row) => (
					<div
						className={cn(
							"flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5",
							row.pad
						)}
						key={row.id}
					>
						<Skeleton className="size-5" />
						<Skeleton className="h-4 w-48" />
					</div>
				))}
			</div>
		</>
	);
}

/** Fallback para a listagem de pedidos: painéis de pendência + filtros + grid de cards. */
export function OrdersListSkeleton() {
	return (
		<>
			<PageHeaderSkeleton hasAction={false} />
			<div className="grid gap-3 lg:grid-cols-2">
				<Skeleton className="h-72 w-full" />
				<Skeleton className="h-72 w-full" />
			</div>
			<FiltersBarSkeleton />
			<IdentityCardGridSkeleton />
		</>
	);
}

/** Fallback para a home do dashboard: saudação + KPIs + painéis + gráficos. */
export function DashboardHomeSkeleton() {
	return (
		<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-2 py-4">
			<div className="flex items-end justify-between gap-4">
				<div className="space-y-2">
					<Skeleton className="h-4 w-16" />
					<Skeleton className="h-8 w-48" />
				</div>
				<Skeleton className="h-9 w-48" />
			</div>
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				{KPI_SLOTS.map((slot) => (
					<Skeleton className="h-24 w-full" key={slot} />
				))}
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				<Skeleton className="h-72 w-full" />
				<Skeleton className="h-72 w-full" />
			</div>
			<Skeleton className="h-64 w-full" />
			<div className="grid gap-4 lg:grid-cols-2">
				<Skeleton className="h-56 w-full" />
				<Skeleton className="h-56 w-full" />
			</div>
		</main>
	);
}

/** Fallback para Configurações do site: header + abas + grid de formulário. */
export function SettingsPageSkeleton() {
	return (
		<>
			<PageHeaderSkeleton hasAction={false} />
			<TabsBarSkeleton />
			<div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
				<div className="flex flex-col gap-5">
					{FIELD_SLOTS.slice(0, 4).map((slot) => (
						<div className="flex flex-col gap-1.5" key={slot}>
							<Skeleton className="h-3 w-24" />
							<Skeleton className="h-9 w-full" />
						</div>
					))}
				</div>
				<Skeleton className="h-64 w-full" />
			</div>
		</>
	);
}
