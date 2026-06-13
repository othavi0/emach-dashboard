import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@emach/ui/components/avatar";
import { cn } from "@emach/ui/lib/utils";
import type { ReactNode } from "react";

interface Props {
	actions?: ReactNode;
	/** Classes extras no Avatar — ex.: avatar quadrado para entidades não-pessoa. */
	avatarClassName?: string;
	avatarFallback: ReactNode;
	avatarUrl?: string | null;
	badges?: ReactNode;
	className?: string;
	subtitle?: ReactNode;
	title: ReactNode;
}

export function EntityIdentityHeader({
	avatarUrl,
	avatarClassName,
	avatarFallback,
	title,
	subtitle,
	badges,
	actions,
	className,
}: Props) {
	return (
		<div
			className={cn(
				"flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
				className
			)}
		>
			<div className="flex min-w-0 items-center gap-3">
				<Avatar className={cn("size-12 shrink-0", avatarClassName)}>
					{avatarUrl ? <AvatarImage alt="" src={avatarUrl} /> : null}
					<AvatarFallback className="rounded-[inherit] bg-muted text-base">
						{avatarFallback}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0">
					<p className="truncate font-medium text-xl leading-tight">{title}</p>
					{subtitle ? (
						<p className="truncate text-muted-foreground text-sm">{subtitle}</p>
					) : null}
					{badges ? (
						<div className="mt-1.5 flex flex-wrap gap-1.5">{badges}</div>
					) : null}
				</div>
			</div>
			{actions ? (
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{actions}
				</div>
			) : null}
		</div>
	);
}
