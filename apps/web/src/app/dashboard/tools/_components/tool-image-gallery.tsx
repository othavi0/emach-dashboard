"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { ArrowDown, ArrowUp, Star, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { compressImageForUpload } from "@/lib/image-compression";
import { notify } from "@/lib/notify";

import { deleteToolImage, uploadToolImage } from "./image-actions";

export interface ToolImage {
	id?: string;
	sortOrder: number;
	url: string;
}

interface ToolImageGalleryProps {
	max?: number;
	min?: number;
	onChange: (images: ToolImage[]) => void;
	value: ToolImage[];
}

const MAX_RAW_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function reindex(images: ToolImage[]): ToolImage[] {
	return images.map((img, idx) => ({ ...img, sortOrder: idx }));
}

export function ToolImageGallery({
	value,
	onChange,
	min = 3,
	max = 8,
}: ToolImageGalleryProps) {
	const fileInput = useRef<HTMLInputElement>(null);
	const [statusLabel, setStatusLabel] = useState<string | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const uploading = statusLabel !== null;

	const sorted = [...value].sort((a, b) => a.sortOrder - b.sortOrder);
	const remaining = max - sorted.length;

	const uploadFiles = useCallback(
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: upload com validação e fallback parcial; refactor em docs/plano-melhorias.md
		async (files: FileList | File[]) => {
			const fileArray = Array.from(files);
			const slotsLeft = max - sorted.length;

			if (slotsLeft <= 0) {
				notify.error(`Máximo de ${max} imagens atingido`);
				return;
			}

			const selected = fileArray.slice(0, slotsLeft);
			if (fileArray.length > slotsLeft) {
				notify.info(
					`Apenas ${slotsLeft} de ${fileArray.length} arquivos serão enviados (limite ${max})`
				);
			}

			const total = selected.length;
			setStatusLabel(total > 0 ? `Preparando 0 de ${total}…` : "Processando…");
			try {
				const uploaded: ToolImage[] = [];
				let index = 0;
				for (const file of selected) {
					index += 1;
					if (!ALLOWED_TYPES.has(file.type)) {
						notify.error(`${file.name}: formato inválido (JPG/PNG/WEBP)`);
						continue;
					}
					if (file.size > MAX_RAW_INPUT_BYTES) {
						notify.error(`${file.name}: arquivo bruto excede 15MB`);
						continue;
					}

					setStatusLabel(`Comprimindo ${index} de ${total}…`);
					let compressed: File;
					try {
						compressed = await compressImageForUpload(file);
					} catch {
						notify.error(`${file.name}: falha ao processar imagem`);
						continue;
					}

					if (compressed.size > MAX_COMPRESSED_BYTES) {
						notify.error(`${file.name}: imagem ainda grande após compressão`);
						continue;
					}

					setStatusLabel(`Enviando ${index} de ${total}…`);
					try {
						const formData = new FormData();
						formData.append("file", compressed);
						const { url } = await uploadToolImage(formData);
						uploaded.push({ url, sortOrder: 0 });
					} catch (err) {
						const message =
							err instanceof Error ? err.message : "erro desconhecido";
						notify.error(`${file.name}: ${message}`);
					}
				}

				if (uploaded.length > 0) {
					const merged = reindex([...sorted, ...uploaded]);
					onChange(merged);
					notify.success(
						uploaded.length === 1
							? "Imagem enviada"
							: `${uploaded.length} imagens enviadas`
					);
				}
			} finally {
				setStatusLabel(null);
			}
		},
		[sorted, max, onChange]
	);

	function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
		const files = event.target.files;
		if (!files || files.length === 0) {
			return;
		}
		uploadFiles(files).catch(() => undefined);
		event.target.value = "";
	}

	function handleDrop(event: React.DragEvent<HTMLButtonElement>) {
		event.preventDefault();
		setIsDragging(false);
		const files = event.dataTransfer.files;
		if (files.length > 0) {
			uploadFiles(files).catch(() => undefined);
		}
	}

	function moveUp(index: number) {
		if (index === 0) {
			return;
		}
		const next = [...sorted];
		const prev = next[index - 1];
		const current = next[index];
		if (!(prev && current)) {
			return;
		}
		next[index - 1] = current;
		next[index] = prev;
		onChange(reindex(next));
	}

	function moveDown(index: number) {
		if (index === sorted.length - 1) {
			return;
		}
		const next = [...sorted];
		const current = next[index];
		const following = next[index + 1];
		if (!(current && following)) {
			return;
		}
		next[index] = following;
		next[index + 1] = current;
		onChange(reindex(next));
	}

	function promoteToPrimary(index: number) {
		if (index === 0) {
			return;
		}
		const next = [...sorted];
		const [item] = next.splice(index, 1);
		if (item === undefined) {
			return;
		}
		next.unshift(item);
		onChange(reindex(next));
	}

	async function removeAt(index: number) {
		const target = sorted[index];
		if (!target) {
			return;
		}
		const next = sorted.filter((_, i) => i !== index);
		onChange(reindex(next));
		try {
			await deleteToolImage(target.url);
		} catch {
			notify.error("Não foi possível remover a imagem do storage.");
		}
	}

	return (
		<div className="grid gap-4 md:grid-cols-2">
			<div className="flex flex-col gap-2">
				<div className="flex items-center justify-between">
					<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Imagens ({sorted.length} de {max})
					</span>
					<span
						className={
							sorted.length < min
								? "text-destructive text-xs"
								: "text-muted-foreground text-xs"
						}
					>
						mínimo {min}
					</span>
				</div>

				{sorted.length === 0 ? (
					<div className="flex min-h-40 items-center justify-center rounded-md border border-border border-dashed p-4 text-center text-muted-foreground text-xs">
						Nenhuma imagem ainda
					</div>
				) : (
					<ul className="flex flex-col gap-2">
						{sorted.map((img, index) => {
							const isPrimary = index === 0;
							return (
								<li
									className={
										isPrimary
											? "flex items-center gap-2 rounded-md border border-primary bg-primary/5 p-2"
											: "flex items-center gap-2 rounded-md border border-border bg-card p-2"
									}
									key={img.id ?? img.url}
								>
									{/** biome-ignore lint/performance/noImgElement: Supabase public URL, no Next Image remote config */}
									{/** biome-ignore lint/correctness/useImageSize: fixed thumbnail via Tailwind */}
									<img
										alt={`Imagem ${index + 1}`}
										className="h-12 w-12 shrink-0 rounded-md border border-border object-cover"
										src={img.url}
									/>
									<div className="flex min-w-0 flex-1 flex-col">
										<span className="truncate text-xs">Imagem {index + 1}</span>
										{isPrimary && (
											<span className="font-medium text-[10px] text-primary uppercase tracking-wide">
												● Principal
											</span>
										)}
									</div>
									<div className="flex shrink-0 items-center gap-1">
										<Button
											aria-label="Mover para cima"
											disabled={index === 0}
											onClick={() => moveUp(index)}
											size="sm"
											type="button"
											variant="ghost"
										>
											<ArrowUp className="size-3.5" />
										</Button>
										<Button
											aria-label="Mover para baixo"
											disabled={index === sorted.length - 1}
											onClick={() => moveDown(index)}
											size="sm"
											type="button"
											variant="ghost"
										>
											<ArrowDown className="size-3.5" />
										</Button>
										<Button
											aria-label="Definir como principal"
											disabled={isPrimary}
											onClick={() => promoteToPrimary(index)}
											size="sm"
											type="button"
											variant="ghost"
										>
											<Star
												className={
													isPrimary
														? "size-3.5 fill-primary text-primary"
														: "size-3.5"
												}
											/>
										</Button>
										<Button
											aria-label="Remover imagem"
											onClick={() => {
												removeAt(index).catch(() => undefined);
											}}
											size="sm"
											type="button"
											variant="ghost"
										>
											<X className="size-3.5" />
										</Button>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<button
				className={
					isDragging
						? "flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-primary border-dashed bg-primary/10 p-6 text-center transition-colors"
						: "flex min-h-40 flex-col items-center justify-center gap-2 rounded-md border border-border border-dashed bg-muted/30 p-6 text-center transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-50"
				}
				disabled={uploading || remaining <= 0}
				onClick={() => fileInput.current?.click()}
				onDragLeave={() => setIsDragging(false)}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDragging(true);
				}}
				onDrop={handleDrop}
				type="button"
			>
				{uploading ? (
					<>
						<Spinner />
						<span className="text-muted-foreground text-xs">
							{statusLabel ?? "Enviando…"}
						</span>
					</>
				) : (
					<>
						<Upload className="size-6 text-muted-foreground" />
						<span className="text-xs">
							{remaining > 0
								? "Arraste arquivos ou clique para selecionar"
								: `Limite de ${max} imagens atingido`}
						</span>
						<span className="text-[10px] text-muted-foreground">
							JPG/PNG/WEBP · até 15MB (compressão automática)
						</span>
					</>
				)}
			</button>

			<input
				accept="image/jpeg,image/png,image/webp"
				className="hidden"
				multiple
				onChange={handleInputChange}
				ref={fileInput}
				type="file"
			/>
		</div>
	);
}
