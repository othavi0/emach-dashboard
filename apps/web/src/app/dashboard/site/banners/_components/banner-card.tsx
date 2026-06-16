"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Banner } from "@emach/db/schema/banner";
import { buttonVariants } from "@emach/ui/components/button";
import { Switch } from "@emach/ui/components/switch";
import { cn } from "@emach/ui/lib/utils";
import { GripVertical, Monitor, Pencil, Smartphone } from "lucide-react";
import Link from "next/link";
import { DeleteBannerDialog } from "./delete-banner-dialog";

function SlotChip({ label }: { label: string }) {
	return (
		<span className="rounded-sm bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground uppercase">
			{label}
		</span>
	);
}

export function BannerCard({
	item,
	order,
	sortable,
	onToggle,
}: {
	item: Banner;
	order?: number;
	sortable: boolean;
	onToggle: (id: string, active: boolean) => void;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.id, disabled: !sortable });

	const hasBackground = Boolean(item.backgroundImageUrl);

	return (
		<div
			className={cn(
				"group overflow-hidden rounded-[10px] border border-border bg-card transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm",
				!item.isActive && "opacity-70"
			)}
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.5 : undefined,
			}}
		>
			<div className="relative aspect-video bg-black">
				{hasBackground ? (
					<>
						{/* biome-ignore lint/performance/noImgElement: Supabase public URL */}
						{/* biome-ignore lint/correctness/useImageSize: dimensões via CSS (inset-0 size-full) */}
						<img
							alt={item.altText ?? ""}
							className="absolute inset-0 size-full object-cover"
							src={item.backgroundImageUrl as string}
						/>
					</>
				) : (
					<>
						<div className="absolute inset-0 bg-black" />
						<div className="absolute inset-0 flex items-center justify-center">
							<div className="size-24 rounded-full bg-red-600/20 blur-2xl" />
						</div>
					</>
				)}
				{item.productImageUrl && (
					// biome-ignore lint/performance/noImgElement: Supabase public URL
					// biome-ignore lint/correctness/useImageSize: dimensões via CSS (size-3/5)
					<img
						alt=""
						className="absolute inset-0 m-auto size-3/5 object-contain drop-shadow-[0_20px_24px_rgba(0,0,0,0.55)]"
						src={item.productImageUrl}
						style={{ scale: String(item.productScale / 100) }}
					/>
				)}
				{typeof order === "number" && (
					<span className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 font-bold text-white text-xs backdrop-blur">
						#{order}
					</span>
				)}
				<span className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 text-xs backdrop-blur">
					<Monitor
						className={cn(
							"size-3.5",
							hasBackground ? "text-emerald-400" : "text-muted-foreground"
						)}
					/>
					<Smartphone
						className={cn(
							"size-3.5",
							item.backgroundImageMobileUrl
								? "text-emerald-400"
								: "text-muted-foreground"
						)}
					/>
				</span>
				{sortable && (
					<button
						aria-label={`Reordenar ${item.title ?? "banner"}`}
						className="absolute top-2 left-1/2 -translate-x-1/2 cursor-grab rounded-md bg-black/45 px-2 py-1 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
						type="button"
						{...attributes}
						{...listeners}
					>
						<GripVertical className="size-4" />
					</button>
				)}
			</div>

			<div className="px-3 pt-3">
				{item.title ? (
					<h3 className="truncate font-semibold text-sm">{item.title}</h3>
				) : (
					<h3 className="truncate font-semibold text-muted-foreground/60 text-sm italic">
						(sem título)
					</h3>
				)}

				<div className="mt-1 flex flex-wrap gap-1">
					<SlotChip key="layout" label={item.layout} />
					{item.badgeText && <SlotChip key="badge" label="badge" />}
					{item.countdownTarget && (
						<SlotChip key="countdown" label="countdown" />
					)}
				</div>

				{item.ctaLabel ? (
					<p className="mt-1 truncate text-muted-foreground text-xs">
						{item.ctaLabel} → {item.ctaHref ?? ""}
					</p>
				) : (
					<p className="mt-1 truncate text-muted-foreground/50 text-xs italic">
						sem CTA
					</p>
				)}
			</div>

			<div className="mt-3 flex items-center justify-between border-border border-t px-3 py-2">
				<div className="flex items-center gap-1">
					<Link
						aria-label={`Editar ${item.title ?? "banner"}`}
						className={buttonVariants({
							size: "icon-sm",
							variant: "secondary",
						})}
						href={`/dashboard/site/banners/${item.id}/edit`}
					>
						<Pencil className="size-3.5" />
					</Link>
					<DeleteBannerDialog
						bannerId={item.id}
						bannerTitle={item.title ?? "banner"}
					/>
				</div>
				<Switch
					aria-label={item.isActive ? "Despublicar" : "Publicar"}
					checked={item.isActive}
					onCheckedChange={(c) => onToggle(item.id, c)}
				/>
			</div>
		</div>
	);
}
