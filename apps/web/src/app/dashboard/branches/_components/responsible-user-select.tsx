"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import {
	listResponsibleCandidates,
	type ResponsibleCandidate,
} from "../actions";

interface Props {
	branchId: string;
	disabled?: boolean;
	onChange: (next: string | undefined) => void;
	value: string | undefined;
}

const ROLE_LABEL: Record<ResponsibleCandidate["role"], string> = {
	super_admin: "Super admin",
	admin: "Admin",
	user: "Membro",
};

export function ResponsibleUserSelect({
	branchId,
	value,
	onChange,
	disabled,
}: Props) {
	const [candidates, setCandidates] = useState<ResponsibleCandidate[]>([]);
	const [isPending, startTransition] = useTransition();
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		startTransition(async () => {
			const rows = await listResponsibleCandidates(branchId);
			setCandidates(rows);
			setLoaded(true);
		});
	}, [branchId]);

	if (loaded && candidates.length === 0) {
		return (
			<div className="flex items-center justify-between rounded-md border border-border border-dashed px-3 py-2.5 text-sm">
				<span className="text-muted-foreground">Nenhum membro vinculado.</span>
				<Link
					className="inline-flex items-center gap-1.5 font-medium text-foreground text-xs hover:underline"
					href={`/dashboard/branches/${branchId}?tab=team`}
				>
					<UserPlus aria-hidden className="size-3.5" />
					Vincular na aba Equipe
				</Link>
			</div>
		);
	}

	return (
		<Select
			disabled={disabled || isPending}
			onValueChange={(v) =>
				onChange(v == null || v === "__none__" ? undefined : v)
			}
			value={value ?? "__none__"}
		>
			<SelectTrigger>
				<SelectValue placeholder={isPending ? "Carregando…" : "Selecione"} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="__none__">
					<span className="text-muted-foreground">Sem responsável</span>
				</SelectItem>
				{candidates.map((c) => (
					<SelectItem key={c.id} value={c.id}>
						<div className="flex items-center gap-2">
							<span className="font-medium">{c.name}</span>
							<span className="text-muted-foreground text-xs">
								· {ROLE_LABEL[c.role]}
							</span>
						</div>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
