"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { notify } from "@/lib/notify";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { capturePosterFrame, readVideoDuration } from "@/lib/video-client";
import {
	MAX_VIDEO_DURATION_SECONDS,
	validateVideoFile,
} from "@/lib/video-validation";
import { uploadToolImage } from "./image-actions";
import {
	createToolVideoUploadUrl,
	deleteToolVideoObject,
} from "./video-actions";

export interface ToolVideoValue {
	videoPosterUrl: string | null;
	videoUrl: string | null;
}

interface ToolVideoFieldProps {
	disabled?: boolean;
	onChange: (value: ToolVideoValue) => void;
	value: ToolVideoValue;
}

export function ToolVideoField({
	value,
	onChange,
	disabled,
}: ToolVideoFieldProps) {
	const fileInput = useRef<HTMLInputElement>(null);
	const [status, setStatus] = useState<string | null>(null);
	const busy = status !== null;

	async function handleFile(file: File) {
		const valid = validateVideoFile(file);
		if (!valid.ok) {
			notify.error(valid.error);
			return;
		}
		setStatus("Lendo vídeo…");
		try {
			const duration = await readVideoDuration(file);
			if (duration > MAX_VIDEO_DURATION_SECONDS) {
				notify.error(`Vídeo excede ${MAX_VIDEO_DURATION_SECONDS}s.`);
				return;
			}

			setStatus("Gerando capa…");
			const poster = await capturePosterFrame(file);

			setStatus("Enviando vídeo…");
			const target = await createToolVideoUploadUrl({ contentType: file.type });
			if (!target.ok) {
				notify.error(target.error);
				return;
			}
			const upload = await supabaseBrowser.storage
				.from(target.data.bucket)
				.uploadToSignedUrl(target.data.path, target.data.token, file);
			if (upload.error) {
				notify.error("Falha ao enviar o vídeo.");
				return;
			}
			const videoUrl = supabaseBrowser.storage
				.from(target.data.bucket)
				.getPublicUrl(target.data.path).data.publicUrl;

			setStatus("Enviando capa…");
			try {
				const posterForm = new FormData();
				posterForm.append("file", poster);
				const { url: videoPosterUrl } = await uploadToolImage(posterForm);
				onChange({ videoUrl, videoPosterUrl });
				notify.success("Vídeo enviado");
			} catch {
				// poster falhou → não deixa vídeo órfão
				await deleteToolVideoObject(videoUrl).catch(() => undefined);
				notify.error("Falha ao gerar a capa. Tente novamente.");
			}
		} catch (err) {
			notify.error(err instanceof Error ? err.message : "Erro no vídeo.");
		} finally {
			setStatus(null);
		}
	}

	function handleRemove() {
		const url = value.videoUrl;
		const poster = value.videoPosterUrl;
		onChange({ videoUrl: null, videoPosterUrl: null });
		if (url) {
			deleteToolVideoObject(url).catch(() =>
				notify.error("Não foi possível remover o vídeo do storage.")
			);
		}
		if (poster) {
			// poster vive no bucket de imagens; reusa o delete de imagem
			import("./image-actions").then(({ deleteToolImage }) =>
				deleteToolImage(poster).catch(() => undefined)
			);
		}
	}

	if (value.videoUrl) {
		return (
			<div className="flex items-start gap-3">
				{/* biome-ignore lint/a11y/useMediaCaption: vídeo de produto sem legenda */}
				<video
					className="h-40 w-auto rounded-md border border-border"
					controls
					poster={value.videoPosterUrl ?? undefined}
					src={value.videoUrl}
				/>
				<Button
					disabled={disabled || busy}
					onClick={handleRemove}
					size="sm"
					type="button"
					variant="ghost"
				>
					<X className="size-3.5" /> Remover
				</Button>
			</div>
		);
	}

	return (
		<>
			<button
				className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-md border border-border border-dashed bg-muted/30 p-6 text-center transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-50"
				disabled={disabled || busy}
				onClick={() => fileInput.current?.click()}
				type="button"
			>
				{busy ? (
					<>
						<Spinner />
						<span className="text-muted-foreground text-xs">{status}</span>
					</>
				) : (
					<>
						<Upload className="size-6 text-muted-foreground" />
						<span className="text-xs">
							Arraste um vídeo ou clique para selecionar
						</span>
						<span className="text-[10px] text-muted-foreground">
							MP4/WebM · até 50MB, {MAX_VIDEO_DURATION_SECONDS}s
						</span>
					</>
				)}
			</button>
			<input
				accept="video/mp4,video/webm"
				className="hidden"
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) {
						handleFile(file).catch(() => undefined);
					}
					e.target.value = "";
				}}
				ref={fileInput}
				type="file"
			/>
		</>
	);
}
