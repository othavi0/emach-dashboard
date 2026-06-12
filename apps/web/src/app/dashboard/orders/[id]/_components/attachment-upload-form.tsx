"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { UploadIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { addOrderAttachment } from "../../_components/attachment-actions";

export function AttachmentUploadForm({
	orderId,
	onSuccess,
}: {
	orderId: string;
	onSuccess?: () => void;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [label, setLabel] = useState("");
	const [description, setDescription] = useState("");
	const [fileName, setFileName] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const [errors, setErrors] = useState<string[]>([]);

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		setFileName(file?.name ?? null);
		setErrors([]);
	}

	function handleSubmit() {
		const file = fileRef.current?.files?.[0];
		if (!file) {
			setErrors(["Selecione um arquivo para enviar."]);
			return;
		}

		setErrors([]);
		const formData = new FormData();
		formData.set("orderId", orderId);
		formData.set("file", file);
		if (label.trim()) {
			formData.set("label", label.trim());
		}
		if (description.trim()) {
			formData.set("description", description.trim());
		}

		startTransition(async () => {
			const result = await addOrderAttachment(formData);
			if (!result.ok) {
				setErrors([result.error]);
				return;
			}
			notify.success("Anexo enviado");
			setLabel("");
			setDescription("");
			setFileName(null);
			if (fileRef.current) {
				fileRef.current.value = "";
			}
			onSuccess?.();
		});
	}

	return (
		<div className="flex flex-col gap-2">
			{errors.length > 0 && (
				<ul className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-xs">
					{errors.map((err) => (
						<li key={err}>{err}</li>
					))}
				</ul>
			)}

			{/* File input styled as a drop zone */}
			<label
				className="flex cursor-pointer flex-col items-center gap-1.5 rounded-md border border-input border-dashed bg-muted/30 px-4 py-4 text-center text-sm transition-colors hover:bg-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
				htmlFor="feed-attachment-file"
			>
				<UploadIcon
					aria-hidden="true"
					className="size-5 text-muted-foreground"
				/>
				<span className="text-muted-foreground">
					{fileName ?? "Clique para selecionar"}
				</span>
				<span className="text-[11px] text-muted-foreground/60">
					PDF, JPEG, PNG ou WEBP — máx 5 MB
				</span>
				<input
					accept=".pdf,.jpg,.jpeg,.png,.webp"
					className="sr-only"
					id="feed-attachment-file"
					name="file"
					onChange={handleFileChange}
					ref={fileRef}
					type="file"
				/>
			</label>

			<Input
				autoComplete="off"
				name="label"
				onChange={(e) => setLabel(e.target.value)}
				placeholder="Rótulo (ex: foto defeito, NF de devolução)"
				value={label}
			/>

			<Textarea
				name="description"
				onChange={(e) => setDescription(e.target.value)}
				placeholder="Observação (opcional) — ex: produto chegou quebrado; João da loja confirmou avaria na entrega"
				value={description}
			/>

			<Button
				className="self-start"
				disabled={isPending || !fileName}
				onClick={handleSubmit}
				size="sm"
				variant="secondary"
			>
				{isPending ? (
					<>
						<Spinner /> Enviando…
					</>
				) : (
					<>
						<UploadIcon aria-hidden="true" className="size-3.5" />
						Enviar evidência
					</>
				)}
			</Button>
		</div>
	);
}
