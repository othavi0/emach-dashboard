"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { notify } from "@/lib/notify";

interface CopyCodeButtonProps {
	code: string;
}

export function CopyCodeButton({ code }: CopyCodeButtonProps) {
	const [copied, setCopied] = useState(false);

	async function handleCopy(event: React.MouseEvent<HTMLButtonElement>) {
		event.stopPropagation();
		event.preventDefault();
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			notify.success("Código copiado");
			setTimeout(() => setCopied(false), 1500);
		} catch {
			notify.error("Não foi possível copiar");
		}
	}

	return (
		<button
			aria-label={`Copiar código ${code}`}
			className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
			onClick={handleCopy}
			type="button"
		>
			{copied ? (
				<Check aria-hidden className="size-3.5" />
			) : (
				<Copy aria-hidden className="size-3.5" />
			)}
		</button>
	);
}
