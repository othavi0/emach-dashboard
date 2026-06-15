"use client";

import { Spinner } from "@emach/ui/components/spinner";
import { Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { notify } from "@/lib/notify";
import { deleteBannerImage, uploadBannerImage } from "./image-actions";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 3 * 1024 * 1024;

export function ImageUploadTile({
	label,
	help,
	required,
	value,
	onChange,
}: {
	label: string;
	help: string;
	required?: boolean;
	value: string | null;
	onChange: (url: string | null) => void;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);

	async function handleFile(file: File) {
		if (!ALLOWED.has(file.type)) {
			notify.error("Formato inválido (JPG/PNG/WEBP)");
			return;
		}
		if (file.size > MAX_BYTES) {
			notify.error("Arquivo excede 3MB");
			return;
		}
		setBusy(true);
		try {
			const fd = new FormData();
			fd.append("file", file);
			const { url } = await uploadBannerImage(fd);
			onChange(url);
			notify.success("Imagem enviada");
		} catch (err) {
			notify.error(err instanceof Error ? err.message : "Falha no upload");
		} finally {
			setBusy(false);
		}
	}

	async function handleRemove() {
		const current = value;
		onChange(null);
		if (current) {
			await deleteBannerImage(current).catch(() => undefined);
		}
	}

	return (
		<div className="flex flex-col gap-1.5">
			<span className="font-medium text-xs">
				{label}
				{required && <span className="text-destructive"> *</span>}
			</span>
			{value ? (
				<div className="relative aspect-video overflow-hidden rounded-md border border-border bg-black">
					{/* biome-ignore lint/performance/noImgElement: Supabase public URL */}
					{/* biome-ignore lint/correctness/useImageSize: dimensão via CSS */}
					<img alt={label} className="size-full object-contain" src={value} />
					<button
						aria-label="Remover imagem"
						className="absolute top-1.5 right-1.5 rounded-md bg-black/60 p-1 text-white"
						onClick={() => {
							handleRemove().catch(() => undefined);
						}}
						type="button"
					>
						<X className="size-3.5" />
					</button>
				</div>
			) : (
				<button
					className="flex aspect-video flex-col items-center justify-center gap-1 rounded-md border border-border border-dashed bg-muted/30 p-3 text-center transition-colors hover:border-foreground/40 disabled:opacity-50"
					disabled={busy}
					onClick={() => inputRef.current?.click()}
					type="button"
				>
					{busy ? (
						<Spinner />
					) : (
						<Upload className="size-5 text-muted-foreground" />
					)}
					<span className="text-muted-foreground text-xs">Enviar imagem</span>
				</button>
			)}
			<span className="text-[10px] text-muted-foreground leading-tight">
				{help}
			</span>
			<input
				accept="image/jpeg,image/png,image/webp"
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) {
						handleFile(f).catch(() => undefined);
					}
					e.target.value = "";
				}}
				ref={inputRef}
				type="file"
			/>
		</div>
	);
}
