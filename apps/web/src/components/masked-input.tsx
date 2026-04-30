"use client";

import { Input } from "@emach/ui/components/input";
import { useState } from "react";

import type { Mask } from "@/lib/masks";

type MaskedInputProps<T> = Omit<
	React.ComponentProps<typeof Input>,
	"onChange" | "type" | "value"
> & {
	mask: Mask<T>;
	onChange: (next: T | undefined) => void;
	value: T | undefined;
};

export function MaskedInput<T>({
	mask,
	value,
	onChange,
	inputMode,
	placeholder,
	maxLength,
	onBlur,
	...rest
}: MaskedInputProps<T>) {
	const [display, setDisplay] = useState(() => mask.format(value));

	function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
		const sanitized = mask.sanitize(event.target.value);
		setDisplay(sanitized);
		onChange(mask.parse(sanitized));
	}

	function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
		const formatted = mask.format(mask.parse(display));
		setDisplay(formatted);
		onBlur?.(event);
	}

	return (
		<Input
			{...rest}
			inputMode={inputMode ?? mask.inputMode}
			maxLength={maxLength ?? mask.maxLength}
			onBlur={handleBlur}
			onChange={handleChange}
			placeholder={placeholder ?? mask.placeholder}
			value={display}
		/>
	);
}
