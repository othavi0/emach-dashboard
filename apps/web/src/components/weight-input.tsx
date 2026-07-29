"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
} from "@emach/ui/components/input-group";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { MaskedInput } from "@/components/masked-input";
import { decimalMask, integerMask } from "@/lib/masks";
import {
	conversionHint,
	displayToKg,
	initialUnit,
	kgToDisplay,
	type WeightUnit,
} from "@/lib/weight-unit";

const UNIT_LABEL: Record<WeightUnit, string> = {
	kg: "Quilograma (kg)",
	g: "Grama (g)",
};

interface WeightInputProps {
	"aria-invalid"?: true;
	/** Unidade de abertura quando o campo está vazio, zerado ou ≥ 1 kg. */
	defaultUnit: WeightUnit;
	disabled?: boolean;
	/** Hint estático do campo, concatenado após o hint de conversão. */
	hint?: string;
	id: string;
	onChange: (kg: number | undefined) => void;
	required?: boolean;
	/** Valor canônico em kg — o que o form state e o banco enxergam. */
	value: number | undefined;
}

/**
 * Campo de peso com seletor de unidade kg/g. A unidade é estado interno de
 * exibição; o contrato externo é sempre kg (3 casas — resolução do banco).
 * O `key={unit}` remonta o MaskedInput na troca de unidade: o display interno
 * dele é inicializado uma única vez no mount, então sem remount o número
 * exibido não seria convertido.
 */
export function WeightInput({
	id,
	value,
	onChange,
	defaultUnit,
	disabled,
	required,
	hint,
	"aria-invalid": ariaInvalid,
}: WeightInputProps) {
	const [unit, setUnit] = useState<WeightUnit>(() =>
		initialUnit(value, defaultUnit)
	);
	const conversion = conversionHint(value, unit);
	const hintText = [conversion, hint].filter(Boolean).join(" · ");
	return (
		<div className="flex flex-col gap-1">
			<InputGroup>
				<MaskedInput
					aria-invalid={ariaInvalid}
					aria-required={required ? "true" : undefined}
					className="border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
					data-slot="input-group-control"
					disabled={disabled}
					id={id}
					key={unit}
					mask={unit === "kg" ? decimalMask : integerMask}
					onChange={(n) => onChange(displayToKg(n, unit))}
					placeholder={unit === "kg" ? "Ex: 2,5" : "Ex: 350"}
					value={kgToDisplay(value, unit)}
				/>
				<InputGroupAddon align="inline-end">
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<InputGroupButton
									aria-label="Unidade de peso"
									disabled={disabled}
								>
									{unit}
									<ChevronDown />
								</InputGroupButton>
							}
						/>
						<DropdownMenuContent align="end">
							{(["kg", "g"] as const).map((u) => (
								<DropdownMenuItem key={u} onClick={() => setUnit(u)}>
									{UNIT_LABEL[u]}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</InputGroupAddon>
			</InputGroup>
			{hintText && <p className="text-muted-foreground text-xs">{hintText}</p>}
		</div>
	);
}
