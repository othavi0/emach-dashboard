import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@emach/ui/components/avatar";
import { cn } from "@emach/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
	avatarFallback: ReactNode;
	avatarUrl?: string | null;
	badges?: ReactNode;
	className?: string;
	footer?: ReactNode;
	href?: string;
	meta?: ReactNode;
	subtitle?: ReactNode;
	title: ReactNode;
}

export function EntityCard({
	avatarUrl,
	avatarFallback,
	title,
	subtitle,
	badges,
	meta,
	footer,
	href,
	className,
}: Props) {
	const body = (
		<>
			<div className="flex min-w-0 items-start gap-3">
				<Avatar className="size-12 shrink-0">
					{avatarUrl ? <AvatarImage alt="" src={avatarUrl} /> : null}
					<AvatarFallback className="bg-muted text-base">
						{avatarFallback}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0 flex-1">
					<p className="truncate font-medium text-base leading-tight">
						{title}
					</p>
					{subtitle ? (
						<p className="truncate text-muted-foreground text-sm">{subtitle}</p>
					) : null}
				</div>
			</div>
			{badges ? <div className="flex flex-wrap gap-1.5">{badges}</div> : null}
			{meta ? (
				<div className="text-muted-foreground text-xs">{meta}</div>
			) : null}
		</>
	);

	const card = (
		<div
			className={cn(
				"flex h-full flex-col gap-3 rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-colors hover:border-border/80",
				className
			)}
		>
			{href ? (
				<Link
					className="flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
					href={href}
				>
					{body}
				</Link>
			) : (
				body
			)}
			{footer ? (
				<div className="mt-auto flex items-center justify-between gap-2 border-border border-t pt-3">
					{footer}
				</div>
			) : null}
		</div>
	);

	return card;
}

export function EntityCardGrid({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
				className
			)}
		>
			{children}
		</div>
	);
}
