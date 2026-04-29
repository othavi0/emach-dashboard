"use client";

import type { AttributeDefinition } from "@emach/db/schema/attributes";
import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import { Checkbox } from "@emach/ui/components/checkbox";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { XIcon } from "lucide-react";
import { useMemo } from "react";

interface AttributeAssignmentsEditorProps {
	allDefinitions: AttributeDefinition[];
	onChange: (slugs: string[]) => void;
	suggested: AttributeDefinition[];
	value: string[];
}

interface Row {
	def: AttributeDefinition;
	isAssigned: boolean;
	source: "suggested" | "extra";
}

export function AttributeAssignmentsEditor({
	allDefinitions,
	onChange,
	suggested,
	value,
}: AttributeAssignmentsEditorProps) {
	const assignedSet = useMemo(() => new Set(value), [value]);
	const suggestedSlugs = useMemo(
		() => new Set(suggested.map((d) => d.slug)),
		[suggested]
	);

	const rows = useMemo<Row[]>(() => {
		const out: Row[] = suggested.map((def) => ({
			def,
			isAssigned: assignedSet.has(def.slug),
			source: "suggested",
		}));
		// extras: assigned mas não estão no pool sugerido
		for (const def of allDefinitions) {
			if (assignedSet.has(def.slug) && !suggestedSlugs.has(def.slug)) {
				out.push({ def, isAssigned: true, source: "extra" });
			}
		}
		return out;
	}, [suggested, allDefinitions, assignedSet, suggestedSlugs]);

	const availableExtras = useMemo(
		() =>
			allDefinitions.filter(
				(d) => !(assignedSet.has(d.slug) || suggestedSlugs.has(d.slug))
			),
		[allDefinitions, assignedSet, suggestedSlugs]
	);

	function toggle(slug: string, checked: boolean) {
		if (checked) {
			if (!assignedSet.has(slug)) {
				onChange([...value, slug]);
			}
		} else {
			onChange(value.filter((s) => s !== slug));
		}
	}

	function addExtra(slug: string) {
		if (!slug) {
			return;
		}
		if (!assignedSet.has(slug)) {
			onChange([...value, slug]);
		}
	}

	if (rows.length === 0 && availableExtras.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Nenhum atributo cadastrado. Cadastre atributos editando uma categoria.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<p className="text-muted-foreground text-xs">
				Marque quais especificações esta ferramenta exibe. Sugeridos vêm da
				categoria principal; extras podem ser anexados do catálogo.
			</p>
			<div className="flex flex-col divide-y divide-border rounded-md border border-border">
				{rows.length === 0 && (
					<p className="px-3 py-3 text-muted-foreground text-xs">
						Nenhuma sugestão para a categoria principal selecionada. Use o
						seletor abaixo para anexar atributos avulsos.
					</p>
				)}
				{rows.map((row) => (
					<div
						className="flex items-center justify-between gap-3 px-3 py-2"
						key={row.def.id}
					>
						<div className="flex items-center gap-3">
							<Checkbox
								checked={row.isAssigned}
								id={`assign-${row.def.slug}`}
								onCheckedChange={(checked) =>
									toggle(row.def.slug, checked === true)
								}
							/>
							<label
								className="cursor-pointer text-sm"
								htmlFor={`assign-${row.def.slug}`}
							>
								{row.def.label}
								{row.def.unit ? (
									<span className="ml-1 text-muted-foreground text-xs">
										({row.def.unit})
									</span>
								) : null}
								{row.def.isRequired && (
									<span className="text-destructive"> *</span>
								)}
							</label>
						</div>
						<div className="flex items-center gap-2">
							<Badge variant={row.source === "extra" ? "outline" : "secondary"}>
								{row.source === "extra" ? "extra · não herdado" : "sugerido"}
							</Badge>
							{row.source === "extra" && row.isAssigned && (
								<Button
									aria-label={`Remover ${row.def.label}`}
									className="text-muted-foreground hover:text-destructive"
									onClick={() => toggle(row.def.slug, false)}
									size="icon-xs"
									type="button"
									variant="ghost"
								>
									<XIcon className="size-3" />
								</Button>
							)}
						</div>
					</div>
				))}
			</div>

			{availableExtras.length > 0 && (
				<div className="flex flex-col gap-1">
					<Select onValueChange={(v) => addExtra((v ?? "") as string)} value="">
						<SelectTrigger className="w-full md:w-72">
							<SelectValue placeholder="+ Adicionar atributo extra…" />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{availableExtras.map((def) => (
									<SelectItem key={def.id} value={def.slug}>
										{def.label}
										{def.unit ? ` (${def.unit})` : ""}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			)}
		</div>
	);
}
