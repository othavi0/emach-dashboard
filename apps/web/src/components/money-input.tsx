"use client";

import { useEffect, useState } from "react";

import { AffixInput } from "@/components/affix-input";
import { formatMoney, parseMoney } from "@/lib/discount-format";

interface MoneyInputProps {
	disabled?: boolean;
	id?: string;
	onChange: (value: number | null) => void;
	value: number | null | undefined;
}

/** Campo de valor em R$ — prefixo fixo, sem símbolo no texto editável. */
export function MoneyInput({ disabled, id, onChange, value }: MoneyInputProps) {
	const [display, setDisplay] = useState(() => formatMoney(value ?? 0));

	// re-sincroniza se o valor mudar por fora (ex.: reset do form)
	useEffect(() => {
		setDisplay(formatMoney(value ?? 0));
	}, [value]);

	function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const n = parseMoney(e.target.value);
		setDisplay(formatMoney(n));
		onChange(n === 0 ? null : n);
	}

	return (
		<AffixInput
			disabled={disabled}
			id={id}
			inputMode="numeric"
			onChange={handleChange}
			placeholder="0,00"
			prefix={<span className="flex items-center px-2.5">R$</span>}
			value={display}
		/>
	);
}
