"use client";

import { Input } from "@emach/ui/components/input";

function pad(n: number): string {
	return String(n).padStart(2, "0");
}

function toLocalInput(d: Date): string {
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CountdownField({
	value,
	onChange,
	ariaInvalid,
}: {
	value: Date | null;
	onChange: (d: Date | null) => void;
	ariaInvalid?: boolean;
}) {
	return (
		<Input
			aria-invalid={ariaInvalid ? true : undefined}
			onChange={(e) => {
				const raw = e.target.value;
				onChange(raw ? new Date(raw) : null);
			}}
			type="datetime-local"
			value={value ? toLocalInput(value) : ""}
		/>
	);
}
