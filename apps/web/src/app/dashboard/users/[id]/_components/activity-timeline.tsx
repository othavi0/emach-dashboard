"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { cn } from "@emach/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { formatRelative } from "@/lib/format/relative";
import { ACTION_ICONS, FALLBACK_ACTION_ICON } from "./activity-icons";

export interface TimelineEntry {
	action: string;
	createdAt: Date | string;
	id: string;
	metadata?: Record<string, unknown> | null;
	/** Conteúdo da coluna de origem (ex.: ator ou alvo da ação). */
	subtitle?: ReactNode;
	/** Texto/markup principal já resolvido pelo caller (label + voz própria). */
	title: ReactNode;
}

interface Props {
	emptyMessage: string;
	entries: TimelineEntry[];
	error: string | null;
	hasMore: boolean;
	onLoadMore: () => void;
	pending: boolean;
	/** Cabeçalho da coluna de origem. Padrão: "Por quem". */
	subjectHeader?: string;
}

function formatMetadataValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "—";
	}
	if (typeof value === "object") {
		return JSON.stringify(value);
	}
	return String(value);
}

export function ActivityTimeline({
	entries,
	emptyMessage,
	error,
	hasMore,
	onLoadMore,
	pending,
	subjectHeader = "Por quem",
}: Props) {
	const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

	const toggle = (id: string) => {
		setOpenIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	if (entries.length === 0) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				{emptyMessage}
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="overflow-hidden rounded-lg border border-border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Ação</TableHead>
							<TableHead>{subjectHeader}</TableHead>
							<TableHead className="text-right">Quando</TableHead>
							<TableHead className="w-10" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{entries.map((entry) => {
							const Icon = ACTION_ICONS[entry.action] ?? FALLBACK_ACTION_ICON;
							const hasMetadata =
								entry.metadata !== null &&
								entry.metadata !== undefined &&
								Object.keys(entry.metadata).length > 0;
							const isOpen = openIds.has(entry.id);

							return (
								<Fragment key={entry.id}>
									<TableRow
										className={cn(hasMetadata && "cursor-pointer")}
										onClick={hasMetadata ? () => toggle(entry.id) : undefined}
									>
										<TableCell>
											<div className="flex items-center gap-2">
												<Icon
													aria-hidden
													className="size-4 shrink-0 text-muted-foreground"
												/>
												<span className="text-sm">{entry.title}</span>
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{entry.subtitle ?? "—"}
										</TableCell>
										<TableCell className="text-right text-muted-foreground text-sm">
											{formatRelative(new Date(entry.createdAt))}
										</TableCell>
										<TableCell className="text-right">
											{hasMetadata ? (
												<button
													aria-expanded={isOpen}
													aria-label={
														isOpen ? "Ocultar detalhes" : "Ver detalhes"
													}
													className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
													onClick={(e) => {
														e.stopPropagation();
														toggle(entry.id);
													}}
													type="button"
												>
													<ChevronRight
														className={cn(
															"size-4 transition-transform",
															isOpen && "rotate-90"
														)}
													/>
												</button>
											) : null}
										</TableCell>
									</TableRow>
									{hasMetadata && isOpen ? (
										<TableRow className="hover:bg-transparent">
											<TableCell
												className="whitespace-normal bg-surface-deep/60 p-0"
												colSpan={4}
											>
												<dl className="grid gap-x-6 gap-y-2 px-4 py-3 sm:grid-cols-[auto_1fr] sm:px-6">
													{Object.entries(
														entry.metadata as Record<string, unknown>
													).map(([key, value]) => (
														<div
															className="grid grid-cols-subgrid sm:col-span-2"
															key={key}
														>
															<dt className="text-[10px] text-muted-foreground uppercase tracking-wider sm:self-center">
																{key}
															</dt>
															<dd className="break-all font-mono text-info text-xs">
																{formatMetadataValue(value)}
															</dd>
														</div>
													))}
												</dl>
											</TableCell>
										</TableRow>
									) : null}
								</Fragment>
							);
						})}
					</TableBody>
				</Table>
			</div>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={onLoadMore}
				pending={pending}
			/>
		</div>
	);
}
