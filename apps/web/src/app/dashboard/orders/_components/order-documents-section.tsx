"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Input } from "@emach/ui/components/input";
import { Spinner } from "@emach/ui/components/spinner";
import {
	ExternalLinkIcon,
	FileIcon,
	FileTextIcon,
	ReceiptIcon,
	Trash2Icon,
	UploadIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import type { OrderAttachmentItem, OrderDetail } from "../data";
import {
	addOrderAttachment,
	deleteOrderAttachment,
} from "./attachment-actions";

// ─── Formatters ───────────────────────────────────────────────────────────────

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function formatDate(value: Date): string {
	return DATE_FORMATTER.format(value);
}

function formatBytes(bytes: number | null): string {
	if (bytes === null) {
		return "";
	}
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeIcon(mimeType: string | null) {
	if (mimeType === "application/pdf") {
		return FileTextIcon;
	}
	return FileIcon;
}

// ─── NF-e status badge ────────────────────────────────────────────────────────

const NFE_STATUS_VARIANT: Record<
	string,
	"success" | "destructive" | "warning" | "info" | "secondary"
> = {
	authorized: "success",
	autorizada: "success",
	canceled: "destructive",
	cancelada: "destructive",
	rejected: "destructive",
	rejeitada: "destructive",
	pending: "warning",
	pendente: "warning",
	processing: "info",
	processando: "info",
};

function NfeStatusBadge({ status }: { status: string }) {
	const variant = NFE_STATUS_VARIANT[status.toLowerCase()] ?? "secondary";
	return <Badge variant={variant}>{status}</Badge>;
}

// ─── Empty state chip ─────────────────────────────────────────────────────────

function EmptyChip({ label }: { label: string }) {
	return (
		<span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground italic">
			{label}
		</span>
	);
}

// ─── Asaas / Fiscal sub-section ───────────────────────────────────────────────

interface AsaasBlockProps {
	nfeNumber: string | null;
	nfeStatus: string | null;
	nfeUrl: string | null;
	nfeXmlUrl: string | null;
	paymentReceiptUrl: string | null;
}

function AsaasBlock({
	nfeNumber,
	nfeStatus,
	nfeUrl,
	nfeXmlUrl,
	paymentReceiptUrl,
}: AsaasBlockProps) {
	return (
		<div className="flex flex-col gap-4">
			<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest">
				Asaas / Fiscal
			</p>

			{/* Payment receipt */}
			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">
					Comprovante de pagamento
				</span>
				{paymentReceiptUrl ? (
					<a
						className="inline-flex items-center gap-1.5 font-medium text-primary text-sm hover:underline"
						href={paymentReceiptUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						<ReceiptIcon aria-hidden="true" className="size-3.5" />
						Ver comprovante
						<ExternalLinkIcon aria-hidden="true" className="size-3" />
					</a>
				) : (
					<EmptyChip label="não emitido" />
				)}
			</div>

			{/* NF-e block */}
			<div className="flex flex-col gap-2">
				<div className="flex flex-col gap-1">
					<span className="text-muted-foreground text-xs">NF-e</span>
					{nfeNumber ? (
						<span className="font-mono text-sm">{nfeNumber}</span>
					) : (
						<EmptyChip label="não emitida" />
					)}
				</div>

				{nfeStatus && (
					<div className="flex flex-col gap-1">
						<span className="text-muted-foreground text-xs">Status</span>
						<NfeStatusBadge status={nfeStatus} />
					</div>
				)}

				<div className="flex flex-wrap gap-2">
					{nfeUrl ? (
						<a
							className="inline-flex items-center gap-1.5 font-medium text-primary text-sm hover:underline"
							href={nfeUrl}
							rel="noopener noreferrer"
							target="_blank"
						>
							<FileTextIcon aria-hidden="true" className="size-3.5" />
							DANFE / PDF
							<ExternalLinkIcon aria-hidden="true" className="size-3" />
						</a>
					) : (
						nfeNumber && <EmptyChip label="PDF indisponível" />
					)}

					{nfeXmlUrl ? (
						<a
							className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-sm hover:text-foreground hover:underline"
							href={nfeXmlUrl}
							rel="noopener noreferrer"
							target="_blank"
						>
							<FileIcon aria-hidden="true" className="size-3.5" />
							XML
							<ExternalLinkIcon aria-hidden="true" className="size-3" />
						</a>
					) : (
						nfeNumber && <EmptyChip label="XML indisponível" />
					)}
				</div>
			</div>
		</div>
	);
}

// ─── Attachment list item ────────────────────────────────────────────────────

function AttachmentItem({
	attachment,
	onDelete,
	isDeleting,
}: {
	attachment: OrderAttachmentItem;
	onDelete: (id: string) => void;
	isDeleting: boolean;
}) {
	const Icon = mimeIcon(attachment.mimeType);

	return (
		<div className="flex items-start gap-3 rounded-md border border-border bg-muted/40 px-3 py-2.5">
			<Icon
				aria-hidden="true"
				className="mt-0.5 size-4 shrink-0 text-muted-foreground"
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						{attachment.url ? (
							<a
								className="truncate font-medium text-sm hover:underline"
								href={attachment.url}
								rel="noopener noreferrer"
								target="_blank"
							>
								{attachment.label ?? attachment.fileName}
							</a>
						) : (
							<span className="truncate font-medium text-muted-foreground text-sm">
								{attachment.label ?? attachment.fileName}
							</span>
						)}
						{attachment.label && (
							<p className="truncate font-mono text-[11px] text-muted-foreground">
								{attachment.fileName}
							</p>
						)}
					</div>

					<Button
						aria-label={`Remover ${attachment.label ?? attachment.fileName}`}
						disabled={isDeleting}
						onClick={() => onDelete(attachment.id)}
						size="icon-sm"
						variant="ghost"
					>
						{isDeleting ? (
							<Spinner />
						) : (
							<Trash2Icon
								aria-hidden="true"
								className="size-3.5 text-destructive"
							/>
						)}
					</Button>
				</div>

				<p className="mt-0.5 text-[11px] text-muted-foreground">
					{[
						formatBytes(attachment.fileSize),
						`${attachment.uploaderName} • ${formatDate(attachment.createdAt)}`,
					]
						.filter(Boolean)
						.join(" • ")}
				</p>
			</div>
		</div>
	);
}

// ─── Upload form ─────────────────────────────────────────────────────────────

function AttachmentUploadForm({
	orderId,
	onSuccess,
}: {
	orderId: string;
	onSuccess: () => void;
}) {
	const fileRef = useRef<HTMLInputElement>(null);
	const [label, setLabel] = useState("");
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

		startTransition(async () => {
			const result = await addOrderAttachment(formData);
			if (!result.ok) {
				setErrors([result.error]);
				return;
			}
			toast.success("Anexo enviado");
			setLabel("");
			setFileName(null);
			if (fileRef.current) {
				fileRef.current.value = "";
			}
			onSuccess();
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

			{/* File input styled as a zone */}
			<label
				className="flex cursor-pointer flex-col items-center gap-1.5 rounded-md border border-input border-dashed bg-muted/30 px-4 py-4 text-center text-sm transition-colors hover:bg-muted/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
				htmlFor="attachment-file"
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
					id="attachment-file"
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
				placeholder="Rótulo opcional (ex: NF fornecedor, boleto)"
				value={label}
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
						Enviar anexo
					</>
				)}
			</Button>
		</div>
	);
}

// ─── Staff attachments sub-section ───────────────────────────────────────────

function StaffAttachmentsBlock({
	attachments,
	orderId,
	onRefresh,
}: {
	attachments: OrderAttachmentItem[];
	orderId: string;
	onRefresh: () => void;
}) {
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [, startTransition] = useTransition();

	function handleDelete(attachmentId: string) {
		setDeletingId(attachmentId);
		startTransition(async () => {
			const result = await deleteOrderAttachment(attachmentId);
			if (result.ok) {
				toast.success("Anexo removido");
				onRefresh();
			} else {
				toast.error(result.error);
			}
			setDeletingId(null);
		});
	}

	return (
		<div className="flex flex-col gap-4">
			<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest">
				Anexos da equipe
			</p>

			{attachments.length === 0 ? (
				<p className="text-muted-foreground text-sm">Nenhum anexo ainda.</p>
			) : (
				<div className="flex flex-col gap-2">
					{attachments.map((att) => (
						<AttachmentItem
							attachment={att}
							isDeleting={deletingId === att.id}
							key={att.id}
							onDelete={handleDelete}
						/>
					))}
				</div>
			)}

			<AttachmentUploadForm onSuccess={onRefresh} orderId={orderId} />
		</div>
	);
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface OrderDocumentsSectionProps {
	order: Pick<
		OrderDetail,
		| "attachments"
		| "id"
		| "nfeNumber"
		| "nfeStatus"
		| "nfeUrl"
		| "nfeXmlUrl"
		| "paymentReceiptUrl"
	>;
}

export function OrderDocumentsSection({ order }: OrderDocumentsSectionProps) {
	const router = useRouter();

	return (
		<Card>
			<CardHeader>
				<CardTitle>Documentos</CardTitle>
				<CardDescription>
					Comprovante Asaas, NF-e (somente leitura) e anexos da equipe.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-6 xl:grid-cols-2">
					<AsaasBlock
						nfeNumber={order.nfeNumber}
						nfeStatus={order.nfeStatus}
						nfeUrl={order.nfeUrl}
						nfeXmlUrl={order.nfeXmlUrl}
						paymentReceiptUrl={order.paymentReceiptUrl}
					/>

					<div className="border-border border-t pt-4 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6">
						<StaffAttachmentsBlock
							attachments={order.attachments}
							onRefresh={router.refresh}
							orderId={order.id}
						/>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
