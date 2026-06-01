"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MaskedInput } from "@/components/masked-input";
import { logger } from "@/lib/logger";
import { cepMask } from "@/lib/masks";

interface ViaCepResponse {
	bairro?: string;
	cep?: string;
	erro?: boolean;
	localidade?: string;
	logradouro?: string;
	uf?: string;
}

export interface CepResolved {
	city: string;
	neighborhood: string;
	state: string;
	street: string;
}

interface Props {
	disabled?: boolean;
	id?: string;
	onChange: (next: string | undefined) => void;
	onResolve: (resolved: CepResolved) => void;
	value: string | undefined;
}

const DEBOUNCE_MS = 300;
const TIMEOUT_MS = 5000;

export function CepInput({ id, value, onChange, onResolve, disabled }: Props) {
	const [isFetching, setIsFetching] = useState(false);
	// Inicia com o CEP já preenchido para não re-resolver (e mostrar toast) ao abrir
	// o form de edição. O auto-resolve só dispara quando o usuário muda o CEP.
	const lastFetchedRef = useRef<string | null>(
		value && value.length === 8 ? value : null
	);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!value || value.length !== 8) {
			return;
		}
		if (lastFetchedRef.current === value) {
			return;
		}
		if (timerRef.current) {
			clearTimeout(timerRef.current);
		}
		const cep = value;
		timerRef.current = setTimeout(() => {
			lastFetchedRef.current = cep;
			setIsFetching(true);
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
			fetch(`https://viacep.com.br/ws/${cep}/json/`, {
				signal: controller.signal,
			})
				.then((r) => r.json() as Promise<ViaCepResponse>)
				.then((data) => {
					clearTimeout(timeout);
					if (data.erro) {
						toast.error("CEP não encontrado");
						return;
					}
					onResolve({
						street: data.logradouro ?? "",
						neighborhood: data.bairro ?? "",
						city: data.localidade ?? "",
						state: (data.uf ?? "").toUpperCase(),
					});
					toast.success("Endereço encontrado");
				})
				.catch((err) => {
					clearTimeout(timeout);
					logger.error("ViaCEP lookup failed", { err, cep });
					toast.message("Não foi possível buscar endereço — preencha manual");
				})
				.finally(() => setIsFetching(false));
		}, DEBOUNCE_MS);

		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
		};
	}, [value, onResolve]);

	return (
		<div className="relative">
			<MaskedInput
				disabled={disabled}
				id={id}
				mask={cepMask}
				onChange={(v) => onChange(v)}
				value={value}
			/>
			{isFetching && (
				<Loader2
					aria-hidden
					className="absolute top-1/2 right-2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
				/>
			)}
		</div>
	);
}
