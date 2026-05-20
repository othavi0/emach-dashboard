"use client";

import { Button } from "@emach/ui/components/button";
import { Eye, Users } from "lucide-react";
import Link from "next/link";

import { EntityCard, EntityCardGrid } from "@/components/entity/entity-card";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { fetchMoreUsersAction } from "../actions";
import type { UserListFilters, UserListRow } from "../data";
import { RoleBadge } from "./role-badge";
import { StatusBadge } from "./status-badge";

// ─── helpers ────────────────────────────────────────────────────────────────

function initials(name: string): string {
	const parts = name.split(" ").filter(Boolean);
	const first = parts[0]?.[0]?.toUpperCase() ?? "";
	const last = parts.length > 1 ? (parts.at(-1)?.[0]?.toUpperCase() ?? "") : "";
	return first + last || "?";
}

const RELATIVE = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});

function formatRelative(date: Date): string {
	const diffMs = date.getTime() - Date.now();
	const diffDays = Math.round(diffMs / 86_400_000);
	if (Math.abs(diffDays) < 1) {
		const diffHours = Math.round(diffMs / 3_600_000);
		if (Math.abs(diffHours) < 1) {
			const diffMinutes = Math.round(diffMs / 60_000);
			return RELATIVE.format(diffMinutes, "minute");
		}
		return RELATIVE.format(diffHours, "hour");
	}
	if (Math.abs(diffDays) < 30) {
		return RELATIVE.format(diffDays, "day");
	}
	const diffMonths = Math.round(diffDays / 30);
	return RELATIVE.format(diffMonths, "month");
}

// ─── component ──────────────────────────────────────────────────────────────

interface Props {
	filters: UserListFilters;
	initialCursor: string | null;
	initialItems: UserListRow[];
}

export function UsersCardGrid({ initialItems, initialCursor, filters }: Props) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems,
		initialCursor,
		fetchPage: (cursor) => fetchMoreUsersAction(filters, cursor),
		resetKey,
	});

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-3 py-16 text-center">
				<Users aria-hidden className="size-12 opacity-40" />
				<p className="font-medium text-sm">Nenhum usuário encontrado</p>
				<p className="text-muted-foreground text-xs">
					Ajuste os filtros ou o status selecionado.
				</p>
			</div>
		);
	}

	return (
		<div aria-live="polite">
			<EntityCardGrid>
				{items.map((user) => {
					const branchMeta =
						user.branchNames.length > 0
							? user.branchNames.slice(0, 2).join(" · ") +
								(user.branchNames.length > 2
									? ` +${user.branchNames.length - 2}`
									: "")
							: "Sem filial";

					return (
						<EntityCard
							avatarFallback={initials(user.name)}
							avatarUrl={user.image}
							badges={
								<>
									<RoleBadge role={user.role} />
									<StatusBadge status={user.status} />
								</>
							}
							footer={
								<>
									<span className="text-muted-foreground text-xs">
										{user.lastLoginAt
											? `Login ${formatRelative(user.lastLoginAt)}`
											: "Nunca logou"}
									</span>
									<Button
										nativeButton={false}
										render={<Link href={`/dashboard/users/${user.id}`} />}
										size="sm"
										variant="outline"
									>
										<Eye className="size-3.5" />
										Ver
									</Button>
								</>
							}
							href={`/dashboard/users/${user.id}`}
							key={user.id}
							meta={branchMeta}
							subtitle={user.email}
							title={user.name}
						/>
					);
				})}
			</EntityCardGrid>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
