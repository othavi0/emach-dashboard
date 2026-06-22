"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Plus, X } from "lucide-react";

export const MAX_SPECS = 6;
export const MAX_SPEC_LEN = 24;

export function SpecsEditor({
	value,
	onChange,
}: {
	value: string[] | null;
	onChange: (next: string[]) => void;
}) {
	const items = value ?? [];
	return (
		<div className="flex flex-col gap-2">
			{items.map((item, i) => (
				// key por índice ok: lista curta (≤6) de strings sem ID estável, inputs controlados, sem reordenação
				<div className="flex items-center gap-2" key={i}>
					<Input
						maxLength={MAX_SPEC_LEN}
						onChange={(e) => {
							const next = [...items];
							next[i] = e.target.value;
							onChange(next);
						}}
						placeholder="Ex: 1200W"
						value={item}
					/>
					<Button
						aria-label="Remover spec"
						onClick={() => onChange(items.filter((_, j) => j !== i))}
						size="icon"
						type="button"
						variant="ghost"
					>
						<X className="size-4" />
					</Button>
				</div>
			))}
			{items.length < MAX_SPECS && (
				<Button
					className="self-start"
					onClick={() => onChange([...items, ""])}
					size="sm"
					type="button"
					variant="outline"
				>
					<Plus className="size-4" /> Adicionar spec
				</Button>
			)}
			<p className="text-[11px] text-muted-foreground">
				{items.length}/{MAX_SPECS} · cada item até {MAX_SPEC_LEN} caracteres
			</p>
		</div>
	);
}
