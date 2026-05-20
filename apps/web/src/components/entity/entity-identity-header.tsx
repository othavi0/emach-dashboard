import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@emach/ui/components/avatar";
import { Card, CardContent } from "@emach/ui/components/card";
import { cn } from "@emach/ui/lib/utils";
import type { ReactNode } from "react";

interface Props {
	actions?: ReactNode;
	avatarFallback: ReactNode;
	avatarUrl?: string | null;
	badges?: ReactNode;
	className?: string;
	subtitle?: ReactNode;
	title: ReactNode;
}

export function EntityIdentityHeader({
	avatarUrl,
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
				"grid gap-3",
				actions ? "lg:grid-cols-[1fr_auto]" : undefined,
				className
			)}
		>
			<Card>
				<CardContent className="flex min-w-0 items-center gap-4 p-4">
					<Avatar className="size-14 shrink-0">
						{avatarUrl ? <AvatarImage alt="" src={avatarUrl} /> : null}
						<AvatarFallback className="bg-muted text-base">
							{avatarFallback}
						</AvatarFallback>
					</Avatar>
					<div className="min-w-0 flex-1">
						<p className="truncate font-medium text-xl leading-tight">
							{title}
						</p>
						{subtitle ? (
							<p className="truncate text-muted-foreground text-sm">
								{subtitle}
							</p>
						) : null}
						{badges ? (
							<div className="mt-2 flex flex-wrap gap-1.5">{badges}</div>
						) : null}
					</div>
				</CardContent>
			</Card>
			{actions ? (
				<Card>
					<CardContent className="flex h-full flex-wrap items-center gap-2 p-4 lg:flex-nowrap">
						{actions}
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
