"use client";

import {
	ExternalLinkIcon,
	FileIcon,
	NotepadTextIcon,
	PinIcon,
	PinOffIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	STATUS_ICONS,
	type StatusIconKey,
	TONE_TEXT,
	type Tone,
} from "@/components/status-visual";
import { togglePinNote } from "../../actions";
import type {
	OrderAttachmentItem,
	OrderDetail,
	OrderEventItem,
	OrderHistoryItem,
	OrderNoteItem,
	OrderRefundItem,
} from "../../data";
import { ORDER_STATUS_LABELS, ORDER_STATUS_META } from "../../status-meta";
import { AttachmentUploadForm } from "./attachment-upload-form";

// ─── Formatters ───────────────────────────────────────────────────────────────

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function formatDateTime(value: Date): string {
	return DATE_TIME_FORMATTER.format(value);
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

function formatCurrency(amount: number): string {
	return new Intl.NumberFormat("pt-BR", {
		currency: "BRL",
		style: "currency",
	}).format(amount);
}

// ─── Feed item type ───────────────────────────────────────────────────────────

type FeedCategory = "documents" | "financeiro" | "notes" | "status";

interface FeedItem {
	category: FeedCategory;
	createdAt: Date;
	detail?: string;
	iconKey: StatusIconKey;
	id: string;
	link?: { href: string; label: string };
	/** Só em notas: id da nota + estado de fixação, para o toggle de pin. */
	noteId?: string;
	pinned?: boolean;
	reason?: string;
	subtitle?: string;
	title: string;
	tone: Tone;
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeHistory(items: OrderHistoryItem[]): FeedItem[] {
	return items.map((h) => {
		const meta = ORDER_STATUS_META[h.toStatus];
		return {
			category: "status" as FeedCategory,
			createdAt: h.createdAt,
			iconKey: meta.iconKey,
			id: `status-${h.id}`,
			reason: h.reason ?? undefined,
			subtitle: h.actorLabel,
			title: `${ORDER_STATUS_LABELS[h.fromStatus]} → ${ORDER_STATUS_LABELS[h.toStatus]}`,
			tone: meta.tone,
		};
	});
}

function normalizeNotes(items: OrderNoteItem[]): FeedItem[] {
	return items.map((n) => {
		const statusLabel = n.statusAtCreation
			? ORDER_STATUS_LABELS[n.statusAtCreation]
			: null;
		return {
			category: "notes" as FeedCategory,
			createdAt: n.createdAt,
			detail: n.body,
			iconKey: "clock" as StatusIconKey,
			id: `notes-${n.id}`,
			noteId: n.id,
			pinned: n.pinned,
			subtitle: statusLabel ? `${n.authorName} · ${statusLabel}` : n.authorName,
			title: "Nota interna",
			tone: "info" as Tone,
		};
	});
}

function normalizeAttachments(items: OrderAttachmentItem[]): FeedItem[] {
	return items.map((a) => {
		const sizeLabel = formatBytes(a.fileSize);
		const subtitleParts = [a.uploaderName, sizeLabel].filter(Boolean);
		return {
			category: "documents" as FeedCategory,
			createdAt: a.createdAt,
			detail: a.description ?? undefined,
			iconKey: "package" as StatusIconKey,
			id: `documents-${a.id}`,
			link:
				a.url == null
					? undefined
					: { href: a.url, label: a.label ?? a.fileName },
			subtitle: subtitleParts.join(" · "),
			title: "Anexo adicionado",
			tone: "info" as Tone,
		};
	});
}

function normalizeEvents(items: OrderEventItem[]): FeedItem[] {
	return items.map((e) => {
		const m = e.metadata as {
			branchId?: string;
			branchName?: string;
			trackingCode?: string;
		} | null;

		if (e.eventType === "tracking_set") {
			const code = m?.trackingCode ?? "";
			return {
				category: "documents" as FeedCategory,
				createdAt: e.createdAt,
				iconKey: "truck" as StatusIconKey,
				id: `events-${e.id}`,
				subtitle: code ? `${e.actorLabel} · ${code}` : e.actorLabel,
				title: "Rastreio definido",
				tone: "info" as Tone,
			};
		}

		// branch_assigned (and any other future types)
		const branchLabel = m?.branchName ?? m?.branchId ?? "";
		return {
			category: "status" as FeedCategory,
			createdAt: e.createdAt,
			iconKey: "package" as StatusIconKey,
			id: `events-${e.id}`,
			subtitle: branchLabel ? `${e.actorLabel} · ${branchLabel}` : e.actorLabel,
			title: "Filial atribuída",
			tone: "info" as Tone,
		};
	});
}

const REFUND_STATUS_LABELS: Record<string, string> = {
	approved: "aprovado",
	rejected: "rejeitado",
	pending: "pendente",
};

function normalizeRefunds(items: OrderRefundItem[]): FeedItem[] {
	return items.map((r) => {
		const statusLabel = REFUND_STATUS_LABELS[r.status] ?? r.status;
		const subtitle = `${r.reasonCategory} · ${formatCurrency(r.amount)} · ${statusLabel}`;
		return {
			category: "financeiro" as FeedCategory,
			createdAt: r.requestedAt,
			detail: r.reasonText ?? undefined,
			iconKey: "rotate" as StatusIconKey,
			id: `financeiro-${r.id}`,
			subtitle,
			title: "Reembolso solicitado",
			tone: "destructive" as Tone,
		};
	});
}

// ─── Tone → bg color class ────────────────────────────────────────────────────

const TONE_DOT: Record<Tone, string> = {
	destructive: "bg-destructive",
	info: "bg-info",
	success: "bg-success",
	warning: "bg-warning",
};

// For notes (category="notes") we use a secondary neutral dot
const CATEGORY_DOT: Partial<Record<FeedCategory, string>> = {
	notes: "bg-secondary",
};

function dotClass(item: FeedItem): string {
	return CATEGORY_DOT[item.category] ?? TONE_DOT[item.tone];
}

// ─── Category icon fallback (when iconKey maps to an order-status icon we want
//     to replace with a more semantic icon for notes/documents) ─────────────────

function CategoryIcon({ item }: { item: FeedItem }) {
	// For notes, prefer a note icon over the generic clock
	if (item.category === "notes") {
		return (
			<NotepadTextIcon
				aria-hidden="true"
				className={`size-3.5 ${TONE_TEXT[item.tone]}`}
			/>
		);
	}
	if (item.category === "documents" && item.iconKey === "package") {
		return (
			<FileIcon
				aria-hidden="true"
				className={`size-3.5 ${TONE_TEXT[item.tone]}`}
			/>
		);
	}
	const Icon = STATUS_ICONS[item.iconKey];
	return (
		<Icon aria-hidden="true" className={`size-3.5 ${TONE_TEXT[item.tone]}`} />
	);
}

// ─── Filter chips ─────────────────────────────────────────────────────────────

type FilterKey = "all" | FeedCategory;

const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
	{ key: "all", label: "Tudo" },
	{ key: "status", label: "Status" },
	{ key: "notes", label: "Notas" },
	{ key: "documents", label: "Documentos" },
	{ key: "financeiro", label: "Financeiro" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function OrderHistoryFeed({ order }: { order: OrderDetail }) {
	const router = useRouter();
	const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
	const [isPending, startTransition] = useTransition();

	function handleTogglePin(noteId: string, pinned: boolean) {
		startTransition(async () => {
			const result = await togglePinNote({ noteId, pinned });
			if (result.ok) {
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	}

	// Normalize all sources
	const allItems: FeedItem[] = [
		...normalizeHistory(order.history),
		...normalizeNotes(order.notes),
		...normalizeAttachments(order.attachments),
		...normalizeEvents(order.events),
		...normalizeRefunds(order.refundRequests),
	].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

	// Notas fixadas vivem numa seção própria no topo, fora da cronologia.
	const pinnedNotes = allItems.filter(
		(item) => item.category === "notes" && item.pinned
	);

	const filtered = (
		activeFilter === "all"
			? allItems
			: allItems.filter((item) => item.category === activeFilter)
	).filter((item) => !(item.category === "notes" && item.pinned));

	return (
		<div className="flex flex-col gap-4">
			{/* Notas fixadas */}
			{pinnedNotes.length > 0 && (
				<div className="flex flex-col gap-2">
					<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-widest">
						Notas fixadas
					</p>
					{pinnedNotes.map((item) => (
						<div
							className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2"
							key={`pin-${item.id}`}
						>
							<NotepadTextIcon
								aria-hidden="true"
								className="mt-0.5 size-3.5 shrink-0 text-primary"
							/>
							<div className="min-w-0 flex-1">
								<p className="text-foreground text-sm">{item.detail}</p>
								<p className="mt-0.5 text-muted-foreground text-xs">
									{item.subtitle} · {formatDateTime(item.createdAt)}
								</p>
							</div>
							{item.noteId ? (
								<button
									aria-label="Desafixar nota"
									className="shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
									disabled={isPending}
									onClick={() => handleTogglePin(item.noteId as string, false)}
									type="button"
								>
									<PinOffIcon aria-hidden="true" className="size-3.5" />
								</button>
							) : null}
						</div>
					))}
				</div>
			)}

			{/* Filter chips */}
			<div className="flex flex-wrap gap-2">
				{FILTER_CHIPS.map((chip) => {
					const isActive = activeFilter === chip.key;
					return (
						<button
							className={
								isActive
									? "inline-flex items-center rounded-full bg-secondary px-3 py-1 font-medium text-secondary-foreground text-xs transition-colors"
									: "inline-flex items-center rounded-full border border-border px-3 py-1 font-medium text-muted-foreground text-xs transition-colors hover:bg-muted"
							}
							key={chip.key}
							onClick={() => setActiveFilter(chip.key)}
							type="button"
						>
							{chip.label}
						</button>
					);
				})}
			</div>

			{/* Timeline */}
			{filtered.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Nenhum evento nesta categoria.
				</p>
			) : (
				<div className="relative">
					{/* Left rail */}
					<div className="absolute top-0 left-[7px] h-full w-px bg-border" />

					<div className="space-y-4">
						{filtered.map((item) => (
							<div className="flex gap-3" key={item.id}>
								{/* Dot + icon stack */}
								<div className="relative z-10 mt-1 flex shrink-0 flex-col items-center">
									<div
										className={`flex size-4 items-center justify-center rounded-full ${dotClass(item)}`}
									>
										<CategoryIcon item={item} />
									</div>
								</div>

								{/* Content */}
								<div className="min-w-0 flex-1 border-border border-b pb-4 last:border-b-0 last:pb-0">
									<div className="flex items-start justify-between gap-3">
										<p className="font-medium text-sm">{item.title}</p>
										<div className="flex shrink-0 items-center gap-2">
											{item.noteId ? (
												<button
													aria-label="Fixar nota"
													className="text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
													disabled={isPending}
													onClick={() =>
														handleTogglePin(item.noteId as string, true)
													}
													type="button"
												>
													<PinIcon aria-hidden="true" className="size-3.5" />
												</button>
											) : null}
											<span className="font-mono text-muted-foreground text-xs tabular-nums">
												{formatDateTime(item.createdAt)}
											</span>
										</div>
									</div>

									{item.subtitle && (
										<p className="mt-0.5 text-muted-foreground text-sm">
											{item.subtitle}
										</p>
									)}

									{item.detail && (
										<p className="mt-1 text-muted-foreground text-sm">
											{item.detail}
										</p>
									)}

									{item.reason && (
										<div className="mt-2 rounded-md border-border border-l-2 bg-muted/50 px-3 py-2">
											<p className="text-muted-foreground text-xs leading-relaxed">
												{item.reason}
											</p>
										</div>
									)}

									{item.link && (
										<a
											className="mt-1.5 inline-flex items-center gap-1.5 text-primary text-sm hover:underline"
											href={item.link.href}
											rel="noopener noreferrer"
											target="_blank"
										>
											<ExternalLinkIcon aria-hidden="true" className="size-3" />
											{item.link.label}
										</a>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Anexar evidência — ação secundária, ao fim da sessão */}
			<div className="-mx-4 mt-2 border-border border-t px-4 pt-4">
				<p className="font-medium text-sm">Anexar evidência</p>
				<p className="mt-0.5 mb-3 text-muted-foreground text-xs">
					Suba comprovantes, fotos de defeito ou documentos do pedido (PDF ou
					imagem). O anexo passa a constar no histórico acima e fica disponível
					para a equipe.
				</p>
				<AttachmentUploadForm
					onSuccess={() => router.refresh()}
					orderId={order.id}
				/>
			</div>
		</div>
	);
}
