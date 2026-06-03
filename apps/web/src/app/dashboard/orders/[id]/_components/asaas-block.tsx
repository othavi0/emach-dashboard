import { Badge } from "@emach/ui/components/badge";
import {
	ExternalLinkIcon,
	FileIcon,
	FileTextIcon,
	ReceiptIcon,
} from "lucide-react";

// ─── NF-e status maps ─────────────────────────────────────────────────────────

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

const NFE_STATUS_LABELS: Record<string, string> = {
	authorized: "Autorizada",
	autorizada: "Autorizada",
	canceled: "Cancelada",
	cancelada: "Cancelada",
	rejected: "Rejeitada",
	rejeitada: "Rejeitada",
	pending: "Pendente",
	pendente: "Pendente",
	processing: "Processando",
	processando: "Processando",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function NfeStatusBadge({ status }: { status: string }) {
	const key = status.toLowerCase();
	const variant = NFE_STATUS_VARIANT[key] ?? "secondary";
	const label = NFE_STATUS_LABELS[key] ?? status;
	return <Badge variant={variant}>{label}</Badge>;
}

function EmptyChip({ label }: { label: string }) {
	return (
		<span className="inline-flex items-center rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground italic">
			{label}
		</span>
	);
}

// ─── AsaasBlock ───────────────────────────────────────────────────────────────

interface AsaasBlockProps {
	nfeNumber: string | null;
	nfeStatus: string | null;
	nfeUrl: string | null;
	nfeXmlUrl: string | null;
	paymentReceiptUrl: string | null;
}

export function AsaasBlock({
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
