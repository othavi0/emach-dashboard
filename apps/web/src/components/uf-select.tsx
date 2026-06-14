"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";

const BR_UFS = [
	"AC",
	"AL",
	"AP",
	"AM",
	"BA",
	"CE",
	"DF",
	"ES",
	"GO",
	"MA",
	"MT",
	"MS",
	"MG",
	"PA",
	"PB",
	"PR",
	"PE",
	"PI",
	"RJ",
	"RN",
	"RS",
	"RO",
	"RR",
	"SC",
	"SP",
	"SE",
	"TO",
] as const;

interface Props {
	"aria-invalid"?: boolean;
	disabled?: boolean;
	id?: string;
	onChange: (uf: string | undefined) => void;
	value: string | undefined;
}

export function UfSelect({
	id,
	value,
	onChange,
	disabled,
	"aria-invalid": ariaInvalid,
}: Props) {
	return (
		<Select
			disabled={disabled}
			onValueChange={(v) => onChange(v || undefined)}
			value={value ?? ""}
		>
			<SelectTrigger aria-invalid={ariaInvalid} id={id}>
				<SelectValue placeholder="UF" />
			</SelectTrigger>
			<SelectContent>
				{BR_UFS.map((uf) => (
					<SelectItem key={uf} value={uf}>
						{uf}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
