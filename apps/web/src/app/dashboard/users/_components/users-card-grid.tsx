"use client";

import { Users } from "lucide-react";
import { useCallback } from "react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchMoreUsersAction } from "../actions";
import type { UserListFilters, UserListRow } from "../data";
import type { BranchLite } from "./types";
import { UserCard } from "./user-card";

interface Props {
	actorRole: UserListRow["role"];
	branches: BranchLite[];
	filters: UserListFilters;
	initialCursor: string | null;
	initialItems: UserListRow[];
}

export function UsersCardGrid({
	initialItems,
	initialCursor,
	filters,
	branches,
	actorRole,
}: Props) {
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error, removeItem } =
		useInfiniteList({
			initialItems,
			initialCursor,
			fetchPage: (cursor) => fetchMoreUsersAction(filters, cursor),
			resetKey,
		});

	const handleResolved = useCallback(
		(userId: string) => {
			removeItem((u) => u.id === userId);
		},
		[removeItem]
	);

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
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((user) => (
					<UserCard
						actorRole={actorRole}
						branches={branches}
						key={user.id}
						onResolved={handleResolved}
						user={user}
					/>
				))}
			</div>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
