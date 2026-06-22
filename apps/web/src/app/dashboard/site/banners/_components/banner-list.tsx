"use client";

import {
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import type { Banner } from "@emach/db/schema/banner";
import { buttonVariants } from "@emach/ui/components/button";
import { cn } from "@emach/ui/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { reorderBanners, toggleBannerActive } from "../actions";
import { BannerCard } from "./banner-card";
import { MAX_ACTIVE_BANNERS } from "./banner-schema";

export function BannerList({ banners }: { banners: Banner[] }) {
	const router = useRouter();
	const [, startTransition] = useTransition();
	const [order, setOrder] = useState(banners);

	const active = order
		.filter((b) => b.isActive)
		.sort((a, b) => a.sortOrder - b.sortOrder);
	const drafts = order.filter((b) => !b.isActive);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
	);

	function handleToggle(id: string, next: boolean) {
		startTransition(async () => {
			const r = await toggleBannerActive(id, next);
			if (r.ok) {
				setOrder((prev) =>
					prev.map((b) => (b.id === id ? { ...b, isActive: next } : b))
				);
				notify.success(next ? "Banner publicado" : "Banner despublicado");
				router.refresh();
			} else {
				notify.error(r.error);
			}
		});
	}

	function handleDelete(id: string) {
		setOrder((prev) => prev.filter((b) => b.id !== id));
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active: a, over } = event;
		if (!over || a.id === over.id) {
			return;
		}
		const ids = active.map((b) => b.id);
		const from = ids.indexOf(String(a.id));
		const to = ids.indexOf(String(over.id));
		if (from === -1 || to === -1) {
			return;
		}
		const reordered = [...ids];
		const [moved] = reordered.splice(from, 1);
		if (moved === undefined) {
			return;
		}
		reordered.splice(to, 0, moved);
		setOrder((prev) =>
			prev.map((b) => {
				const idx = reordered.indexOf(b.id);
				return idx === -1 ? b : { ...b, sortOrder: idx };
			})
		);
		startTransition(async () => {
			const r = await reorderBanners(reordered);
			if (r.ok) {
				notify.success("Ordem atualizada");
				router.refresh();
			} else {
				notify.error(r.error);
				setOrder(banners);
			}
		});
	}

	return (
		<div className="flex flex-col gap-8">
			<section>
				<h2 className="mb-3 flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
					No ar — ordem do carrossel
					<span
						className={cn(
							"rounded-md bg-muted px-2 py-0.5 text-xs",
							active.length >= MAX_ACTIVE_BANNERS && "text-amber-500"
						)}
					>
						{active.length} / {MAX_ACTIVE_BANNERS} ativos
					</span>
				</h2>
				<DndContext
					id="banner-sortable"
					onDragEnd={handleDragEnd}
					sensors={sensors}
				>
					<SortableContext
						items={active.map((b) => b.id)}
						strategy={rectSortingStrategy}
					>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
							{active.map((b, i) => (
								<BannerCard
									item={b}
									key={b.id}
									onDelete={handleDelete}
									onToggle={handleToggle}
									order={i + 1}
									sortable
								/>
							))}
						</div>
					</SortableContext>
				</DndContext>
				{active.length === 0 && (
					<p className="text-muted-foreground text-sm">
						Nenhum banner publicado. Ative um rascunho abaixo para exibi-lo no
						carrossel.
					</p>
				)}
			</section>

			<section>
				<h2 className="mb-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
					Rascunhos / despublicados
				</h2>
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{drafts.map((b) => (
						<BannerCard
							item={b}
							key={b.id}
							onDelete={handleDelete}
							onToggle={handleToggle}
							sortable={false}
						/>
					))}
					<Link
						className={cn(
							buttonVariants({ variant: "outline" }),
							"flex min-h-[200px] flex-col items-center justify-center gap-2 border-dashed text-muted-foreground"
						)}
						href="/dashboard/site/banners/new"
					>
						<Plus className="size-5" />
						Criar novo banner
					</Link>
				</div>
			</section>
		</div>
	);
}
