"use client";

import { HelpTooltip } from "@/components/help-tooltip";
import type { ToolVariantInput } from "../tool-schema";
import { VariantsEditor } from "../variants-editor";
import type { ToolFieldGroupProps } from "./types";

export function VariantFields({
	values,
	onPatch,
	errors,
}: ToolFieldGroupProps) {
	return (
		<div className="flex flex-col gap-4">
			<p className="flex items-center gap-1.5 text-muted-foreground text-xs">
				Cada variante tem SKU, código de barras e preço próprios. Use voltagens
				distintas (127V/220V) como linhas separadas.
				<HelpTooltip text="A variante padrão é a SKU pré-selecionada na loja quando o cliente abre a ferramenta. Exatamente uma por produto." />
			</p>
			<VariantsEditor
				error={errors.variants}
				onChange={(next: ToolVariantInput[]) => onPatch({ variants: next })}
				value={values.variants}
			/>
		</div>
	);
}
