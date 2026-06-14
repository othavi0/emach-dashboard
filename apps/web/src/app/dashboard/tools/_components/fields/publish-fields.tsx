"use client";

import { Label } from "@emach/ui/components/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Switch } from "@emach/ui/components/switch";

import { FieldError } from "@/components/field-error";
import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import { ToolImageGallery } from "../tool-image-gallery";
import {
	MAX_IMAGES,
	MIN_IMAGES_ACTIVE,
	TOOL_STATUS_LABELS,
	TOOL_STATUS_OPTIONS,
	type ToolFormValues,
} from "../tool-schema";
import type { ToolFieldGroupProps } from "./types";

export function PublishFields({
	values,
	onPatch,
	errors,
	disabled,
}: ToolFieldGroupProps) {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<p className="text-muted-foreground text-xs">
					{values.images.length} de {MAX_IMAGES} imagens. Primeira é a capa.
					Status "Ativo" exige no mínimo {MIN_IMAGES_ACTIVE}.
				</p>
				<ToolImageGallery
					max={MAX_IMAGES}
					min={values.status === "active" ? MIN_IMAGES_ACTIVE : 0}
					onChange={(images) => onPatch({ images })}
					value={values.images}
				/>
				<FieldError>{errors.images}</FieldError>
			</div>
			<div className="grid gap-4 md:grid-cols-2">
				<LabeledField
					help={
						<HelpTooltip
							text={`Rascunho fica oculto. "Ativo" exige ${MIN_IMAGES_ACTIVE} imagens e publica na loja. Descontinuado some de novas vendas.`}
						/>
					}
					id="status"
					label="Status"
					required
				>
					{(field) => (
						<Select
							disabled={disabled}
							onValueChange={(v) =>
								onPatch({ status: v as ToolFormValues["status"] })
							}
							value={values.status}
						>
							<SelectTrigger {...field}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{TOOL_STATUS_OPTIONS.map((s) => (
										<SelectItem key={s} value={s}>
											{TOOL_STATUS_LABELS[s]}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					)}
				</LabeledField>
				<div className="flex items-center justify-between">
					<Label className="flex items-center gap-1.5" htmlFor="visibleOnSite">
						Visível no site
						<HelpTooltip text="Desligado, a ferramenta existe no catálogo interno mas não aparece pra clientes na loja, mesmo se 'Ativo'." />
					</Label>
					<Switch
						checked={values.visibleOnSite}
						disabled={disabled}
						id="visibleOnSite"
						onCheckedChange={(checked) => onPatch({ visibleOnSite: checked })}
					/>
				</div>
			</div>
		</div>
	);
}
