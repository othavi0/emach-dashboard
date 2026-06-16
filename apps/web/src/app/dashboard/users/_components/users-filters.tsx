"use client";

import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";

import { FiltersBar } from "@/components/filters-bar";
import { useDebouncedParam, useFilterState } from "@/lib/use-filter-state";

interface BranchLite {
	id: string;
	name: string;
}

interface UsersFiltersProps {
	branches: BranchLite[];
}

const BASE = "/dashboard/users";
const TRACKED = ["search", "role", "branchId"] as const;

const ROLE_LABELS: Record<string, string> = {
	all: "Todos os cargos",
	super_admin: "Super Admin",
	admin: "Admin",
	user: "Estoquista",
};

export function UsersFilters({ branches }: UsersFiltersProps) {
	const { setParam, clearAll, hasActive, searchParams } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [search, setSearch] = useDebouncedParam({
		basePath: BASE,
		key: "search",
	});

	const currentRole = searchParams.get("role") ?? "all";
	const currentBranch = searchParams.get("branchId") ?? "all";

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
			<div className="flex flex-1 flex-col gap-1">
				<label className="text-muted-foreground text-xs" htmlFor="users-search">
					Buscar usuário
				</label>
				<Input
					id="users-search"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Nome ou e-mail"
					value={search}
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-44">
				<label className="text-muted-foreground text-xs" htmlFor="users-role">
					Cargo
				</label>
				<Select
					onValueChange={(v) => setParam("role", v === "all" ? null : v)}
					value={currentRole}
				>
					<SelectTrigger id="users-role">
						<SelectValue>
							{(v: string) => ROLE_LABELS[v] ?? ROLE_LABELS.all}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="all">Todos os cargos</SelectItem>
							<SelectItem value="super_admin">Super Admin</SelectItem>
							<SelectItem value="admin">Admin</SelectItem>
							<SelectItem value="user">Estoquista</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			{branches.length > 0 && (
				<div className="flex flex-col gap-1 md:w-44">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="users-branch"
					>
						Filial
					</label>
					<Select
						onValueChange={(v) => setParam("branchId", v === "all" ? null : v)}
						value={currentBranch}
					>
						<SelectTrigger id="users-branch">
							<SelectValue>
								{(v: string) =>
									v === "all"
										? "Todas as filiais"
										: (branches.find((b) => b.id === v)?.name ??
											"Todas as filiais")
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="all">Todas as filiais</SelectItem>
								{branches.map((b) => (
									<SelectItem key={b.id} value={b.id}>
										{b.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			)}
		</FiltersBar>
	);
}
