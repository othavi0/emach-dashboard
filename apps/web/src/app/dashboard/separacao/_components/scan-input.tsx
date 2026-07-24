"use client";

import { Input } from "@emach/ui/components/input";
import { BarcodeIcon } from "lucide-react";
import { useRef, useState } from "react";

/** Resultado que o pai devolve após processar o bip. */
export type ScanInputOutcome = "clear" | "keep";

interface ScanInputProps {
	disabled?: boolean;
	/**
	 * Processa um código. Retorne `"keep"` para manter o texto selecionado
	 * (erro / fora do pedido); `"clear"` ou undefined limpa o campo.
	 */
	onScan: (
		code: string
	) => ScanInputOutcome | undefined | Promise<ScanInputOutcome | undefined>;
}

/** Trim do código lido (Enter ou paste). Exportado para teste unitário. */
export function normalizeScanCode(raw: string): string {
	return raw.trim();
}

/**
 * Mapeia o kind do scanItem para o outcome do input.
 * `accepted` e `already_complete` limpam; `not_in_order` mantém.
 */
export function scanInputOutcomeFromKind(
	kind: "accepted" | "already_complete" | "not_in_order"
): ScanInputOutcome {
	if (kind === "not_in_order") {
		return "keep";
	}
	return "clear";
}

export function ScanInput({ disabled, onScan }: ScanInputProps) {
	const [value, setValue] = useState("");
	const ref = useRef<HTMLInputElement>(null);
	const pendingRef = useRef<string[]>([]);
	const drainingRef = useRef(false);

	function applyOutcome(code: string, outcome: ScanInputOutcome | undefined) {
		if (outcome === "keep") {
			setValue(code);
			requestAnimationFrame(() => {
				ref.current?.focus();
				ref.current?.select();
			});
			return;
		}
		setValue("");
		requestAnimationFrame(() => ref.current?.focus());
	}

	async function drain() {
		if (drainingRef.current) {
			return;
		}
		drainingRef.current = true;
		try {
			while (pendingRef.current.length > 0) {
				const code = pendingRef.current.shift();
				if (code === undefined) {
					break;
				}
				const outcome = await Promise.resolve(onScan(code));
				applyOutcome(code, outcome);
			}
		} finally {
			drainingRef.current = false;
		}
	}

	function submit(raw: string) {
		const code = normalizeScanCode(raw);
		if (!code) {
			return;
		}
		// Mostra o código enquanto o server processa (paste com preventDefault
		// não grava no state sozinho).
		setValue(code);
		pendingRef.current.push(code);
		// Fire-and-forget serial drain (biome noVoid — named call).
		async function run() {
			await drain();
		}
		run();
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
				· em erro o código fica selecionado
			</p>
		</div>
	);
}
