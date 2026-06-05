"use client";

import { Button } from "@emach/ui/components/button";
import { RotateCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import type { PendingRow } from "@/components/pending-panel";

import { resendInvite, revokeInvite } from "../actions";

interface Props {
	initial: PendingRow[];
}

export function InvitePendingList({ initial }: Props) {
	const router = useRouter();
	const [submitting, startTransition] = useTransition();

	function handleResend(id: string) {
		startTransition(async () => {
			const res = await resendInvite({ userId: id });
			if (res.ok) {
				toast.success("Convite reenviado");
			} else {
				toast.error(res.error);
			}
		});
	}

	function handleRevoke(id: string) {
		startTransition(async () => {
			const res = await revokeInvite({ userId: id });
			if (res.ok) {
				toast.success("Convite revogado");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	}

	if (initial.length === 0) {
		return (
			<p className="px-3 py-6 text-center text-muted-foreground text-sm">
				Nenhum convite pendente.
			</p>
		);
	}

	return (
		<ul className="flex flex-col gap-1">
			{initial.map((r) => (
				<li
					className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
					key={r.id}
				>
					<Link className="flex min-w-0 flex-1 flex-col" href={r.href}>
						<span className="truncate font-medium text-sm">{r.primary}</span>
						<span className="truncate text-muted-foreground text-xs">
							{r.secondary}
						</span>
					</Link>
					<Button
						aria-label="Reenviar convite"
						disabled={submitting}
						onClick={() => handleResend(r.id)}
						size="icon-sm"
						variant="ghost"
					>
						<RotateCw aria-hidden className="size-3.5" />
					</Button>
					<Button
						aria-label="Revogar convite"
						disabled={submitting}
						onClick={() => handleRevoke(r.id)}
						size="icon-sm"
						variant="ghost"
					>
						<Trash2 aria-hidden className="size-3.5" />
					</Button>
				</li>
			))}
		</ul>
	);
}
