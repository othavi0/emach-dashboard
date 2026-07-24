"use client";

import { Input } from "@emach/ui/components/input";
import { BarcodeIcon } from "lucide-react";
import { useRef, useState } from "react";

interface ScanInputProps {
	disabled?: boolean;
	onScan: (code: string) => void;
}

/** Trim do código lido (Enter ou paste). Exportado para teste unitário. */
export function normalizeScanCode(raw: string): string {
	return raw.trim();
}

export function ScanInput({ disabled, onScan }: ScanInputProps) {
	const [value, setValue] = useState("");
	const ref = useRef<HTMLInputElement>(null);

	function submit(raw: string) {
		const code = normalizeScanCode(raw);
		if (!code) {
			return;
		}
		setValue("");
		onScan(code);
		requestAnimationFrame(() => ref.current?.focus());
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key !== "Enter") {
			return;
		}
		submit(value);
	}

	function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
		e.preventDefault();
		const raw = e.clipboardData.getData("text");
		submit(raw);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-3 rounded-lg border border-input bg-background px-4 py-3.5 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
				<BarcodeIcon
					aria-hidden
					className="size-[22px] shrink-0 text-primary"
				/>
				<Input
					aria-label="Escanear código de barras"
					autoFocus
					className="flex-1 border-0 bg-transparent text-[16px] text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
					disabled={disabled}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={handleKeyDown}
					onPaste={handlePaste}
					placeholder="Bipe o código de barras…"
					ref={ref}
					type="text"
					value={value}
				/>
			</div>
			<p className="pl-0.5 text-[12px] text-muted-foreground">
				Foco automático · leitor dá Enter sozinho · colar também valida na hora
			</p>
		</div>
	);
}
