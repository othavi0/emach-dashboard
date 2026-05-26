"use client";

import { Button } from "@emach/ui/components/button";
import { Checkbox } from "@emach/ui/components/checkbox";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { PendingRow } from "@/components/pending-panel";

import { bulkRejectUsers } from "../actions";

interface Props {
	initial: PendingRow[];
}

export function BulkPendingSelection({ initial }: Props) {
	const router = useRouter();
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [submitting, startTransition] = useTransition();

	const toggle = (id: string, on: boolean) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (on) {
				next.add(id);
			} else {
				next.delete(id);
			}
			return next;
		});
	};

	const allOn = selected.size === initial.length && initial.length > 0;
	const toggleAll = (on: boolean) => {
		setSelected(on ? new Set(initial.map((r) => r.id)) : new Set());
	};

	const onBulkReject = () => {
		const ids = Array.from(selected);
		if (ids.length === 0) {
			return;
		}
		startTransition(async () => {
			const res = await bulkRejectUsers({ userIds: ids });
			if (res.ok) {
				toast.success(
					`${res.data.rejected} rejeitado(s); ${res.data.skipped} ignorado(s)`
				);
				setSelected(new Set());
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	if (initial.length === 0) {
		return (
			<p className="px-3 py-6 text-center text-muted-foreground text-sm">
				Nenhum usuário aguardando aprovação.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2 px-2">
				<label className="flex items-center gap-2 text-xs">
					<Checkbox
						checked={allOn}
						onCheckedChange={(v) => toggleAll(Boolean(v))}
					/>
					Selecionar todos
				</label>
				<Button
					disabled={selected.size === 0 || submitting}
					onClick={onBulkReject}
					size="sm"
					variant="destructive"
				>
					<Trash2 aria-hidden className="mr-1.5 size-3.5" />
					Rejeitar selecionados ({selected.size})
				</Button>
			</div>
			<ul className="flex flex-col gap-1">
				{initial.map((r) => (
					<li
						className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
						key={r.id}
					>
						<Checkbox
							checked={selected.has(r.id)}
							onCheckedChange={(v) => toggle(r.id, Boolean(v))}
						/>
						<Link className="flex min-w-0 flex-1 flex-col" href={r.href}>
							<span className="truncate font-medium text-sm">{r.primary}</span>
							<span className="truncate text-muted-foreground text-xs">
								{r.secondary}
							</span>
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
