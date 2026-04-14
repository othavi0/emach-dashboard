"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { supabaseBrowser, TOOL_IMAGES_BUCKET } from "@/lib/supabase-client";

interface ToolImageUploadProps {
	onChange: (url: string) => void;
	value: string | null | undefined;
}

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ToolImageUpload({ value, onChange }: ToolImageUploadProps) {
	const fileInput = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);

	async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		if (!ALLOWED_TYPES.has(file.type)) {
			toast.error("Formato inválido. Use JPG, PNG ou WEBP.");
			event.target.value = "";
			return;
		}

		if (file.size > MAX_SIZE_BYTES) {
			toast.error("Imagem muito grande. Máximo 5MB.");
			event.target.value = "";
			return;
		}

		setUploading(true);
		try {
			const extension = file.name.split(".").pop() ?? "bin";
			const objectPath = `${crypto.randomUUID()}.${extension}`;

			const { error } = await supabaseBrowser.storage
				.from(TOOL_IMAGES_BUCKET)
				.upload(objectPath, file, { contentType: file.type, upsert: false });

			if (error) {
				throw error;
			}

			const { data: publicUrl } = supabaseBrowser.storage
				.from(TOOL_IMAGES_BUCKET)
				.getPublicUrl(objectPath);

			onChange(publicUrl.publicUrl);
			toast.success("Imagem enviada com sucesso");
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Erro desconhecido";
			toast.error(`Falha ao enviar imagem: ${message}`);
		} finally {
			setUploading(false);
			event.target.value = "";
		}
	}

	return (
		<div className="flex flex-col gap-3">
			{value ? (
				// biome-ignore lint/performance/noImgElement: Supabase public URL — Image remote config deferred to Phase 2
				// biome-ignore lint/correctness/useImageSize: preview constrained via Tailwind
				<img
					alt="Imagem da ferramenta"
					className="h-40 w-40 rounded border border-border object-cover"
					src={value}
				/>
			) : (
				<div className="flex h-40 w-40 items-center justify-center rounded border border-border border-dashed text-muted-foreground text-xs">
					Sem imagem
				</div>
			)}

			<input
				accept="image/jpeg,image/png,image/webp"
				className="hidden"
				onChange={handleChange}
				ref={fileInput}
				type="file"
			/>

			<Button
				disabled={uploading}
				onClick={() => fileInput.current?.click()}
				type="button"
				variant="secondary"
			>
				{uploading ? (
					<>
						<Spinner /> Enviando…
					</>
				) : (
					"Escolher imagem"
				)}
			</Button>
		</div>
	);
}
