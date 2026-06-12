"use client";

import {
	DndContext,
	type DragEndEvent,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import { ChevronDown, ChevronRight, GripVertical, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { notify } from "@/lib/notify";

import {
	buildCategoryTree,
	type CategoryTreeNode,
	type FlatCategory,
} from "../_lib/category-tree";
import { reorderCategories } from "../actions";
import { DeleteCategoryDialog } from "./delete-category-dialog";

interface CategoriesTreeProps {
	canMutate: boolean;
	categories: FlatCategory[];
}

export function CategoriesTree({ canMutate, categories }: CategoriesTreeProps) {
	const router = useRouter();
	const [, startTransition] = useTransition();
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	const [order, setOrder] = useState(categories);
	const tree = useMemo(() => buildCategoryTree(order), [order]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
	);

	function toggle(id: string) {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	}

	function handleDragEnd(event: DragEndEvent, siblings: CategoryTreeNode[]) {
		const { active, over } = event;
		if (!over || active.id === over.id) {
			return;
		}
		const ids = siblings.map((s) => s.id);
		const from = ids.indexOf(String(active.id));
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
			prev.map((c) => {
				const idx = reordered.indexOf(c.id);
				return idx === -1 ? c : { ...c, sortOrder: idx };
			})
		);

		const parentId = siblings[0]?.parentId ?? null;
		startTransition(async () => {
			const result = await reorderCategories({
				parentId,
				orderedIds: reordered,
			});
			if (result.ok) {
				notify.success("Ordem atualizada");
				router.refresh();
			} else {
				notify.error(result.error);
				setOrder(categories);
			}
		});
	}

	return (
		<div className="rounded-md border border-border bg-card">
			<SiblingGroup
				canMutate={canMutate}
				expanded={expanded}
				nodes={tree}
				onDragEnd={handleDragEnd}
				onToggle={toggle}
				sensors={sensors}
			/>
		</div>
	);
}

interface SiblingGroupProps {
	canMutate: boolean;
	expanded: Set<string>;
	nodes: CategoryTreeNode[];
	onDragEnd: (event: DragEndEvent, siblings: CategoryTreeNode[]) => void;
	onToggle: (id: string) => void;
	sensors: ReturnType<typeof useSensors>;
}

function SiblingGroup({
	canMutate,
	expanded,
	nodes,
	onDragEnd,
	onToggle,
	sensors,
}: SiblingGroupProps) {
	if (nodes.length === 0) {
		return null;
	}
	return (
		<DndContext
			onDragEnd={(event) => onDragEnd(event, nodes)}
			sensors={sensors}
		>
			<SortableContext
				items={nodes.map((n) => n.id)}
				strategy={verticalListSortingStrategy}
			>
				{nodes.map((node) => (
					<TreeRow
						canMutate={canMutate}
						expanded={expanded}
						key={node.id}
						node={node}
						onDragEnd={onDragEnd}
						onToggle={onToggle}
						sensors={sensors}
					/>
				))}
			</SortableContext>
		</DndContext>
	);
}

interface TreeRowProps {
	canMutate: boolean;
	expanded: Set<string>;
	node: CategoryTreeNode;
	onDragEnd: (event: DragEndEvent, siblings: CategoryTreeNode[]) => void;
	onToggle: (id: string) => void;
	sensors: ReturnType<typeof useSensors>;
}

function TreeRow({
	canMutate,
	expanded,
	node,
	onDragEnd,
	onToggle,
	sensors,
}: TreeRowProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: node.id });
	const hasChildren = node.children.length > 0;
	const isOpen = expanded.has(node.id);
	let toggleIcon: React.ReactNode = <span className="inline-block size-4" />;
	if (hasChildren) {
		toggleIcon = isOpen ? (
			<ChevronDown aria-hidden className="size-4" />
		) : (
			<ChevronRight aria-hidden className="size-4" />
		);
	}

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : 1,
			}}
		>
			<div
				className="flex items-center gap-2 border-border border-b px-3 py-2 last:border-b-0 hover:bg-muted/40"
				style={{ paddingLeft: `${0.75 + node.depth * 1.5}rem` }}
			>
				{canMutate && (
					<button
						aria-label={`Reordenar ${node.name}`}
						className="cursor-grab text-muted-foreground"
						type="button"
						{...attributes}
						{...listeners}
					>
						<GripVertical aria-hidden className="size-4" />
					</button>
				)}
				<button
					aria-label={isOpen ? "Recolher" : "Expandir"}
					className="text-muted-foreground"
					disabled={!hasChildren}
					onClick={() => onToggle(node.id)}
					type="button"
				>
					{toggleIcon}
				</button>
				<Link
					className="font-medium text-sm hover:underline"
					href={`/dashboard/categories/${node.id}`}
				>
					{node.name}
				</Link>
				<span className="text-muted-foreground text-xs tabular-nums">
					{node.productCount} produto{node.productCount === 1 ? "" : "s"}
				</span>
				<span className="flex-1" />
				<Badge variant={node.isActive ? "success" : "outline"}>
					{node.isActive ? "Ativa" : "Inativa"}
				</Badge>
				{canMutate && (
					<>
						<Link
							aria-label={`Editar categoria ${node.name}`}
							className={buttonVariants({
								size: "icon-sm",
								variant: "secondary",
							})}
							href={`/dashboard/categories/${node.id}/edit`}
						>
							<Pencil aria-hidden className="size-3.5" />
						</Link>
						<DeleteCategoryDialog
							categoryId={node.id}
							categoryName={node.name}
							variant="icon"
						/>
					</>
				)}
			</div>
			{isOpen && hasChildren && (
				<SiblingGroup
					canMutate={canMutate}
					expanded={expanded}
					nodes={node.children}
					onDragEnd={onDragEnd}
					onToggle={onToggle}
					sensors={sensors}
				/>
			)}
		</div>
	);
}
