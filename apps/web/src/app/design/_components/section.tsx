import type * as React from "react";

export function Section({
	id,
	title,
	description,
	children,
}: {
	id: string;
	title: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="border-border border-t py-12" id={id}>
			<header className="mb-6">
				<h2 className="font-medium font-sans text-2xl leading-tight tracking-tight">
					{title}
				</h2>
				{description ? (
					<p className="mt-2 text-muted-foreground text-sm">{description}</p>
				) : null}
			</header>
			<div className="space-y-6">{children}</div>
		</section>
	);
}

export function Showcase({
	label,
	children,
	className,
}: {
	label: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div className="ring-1 ring-foreground/10">
			<div className="border-border border-b bg-muted/30 px-3 py-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
				{label}
			</div>
			<div
				className={`flex min-h-24 flex-wrap items-start gap-3 bg-card p-6 ${className ?? ""}`}
			>
				{children}
			</div>
		</div>
	);
}

export function Swatch({
	name,
	hex,
	className,
}: {
	name: string;
	hex: string;
	className: string;
}) {
	return (
		<div className="flex flex-col gap-2">
			<div
				aria-hidden
				className={`h-20 w-full ring-1 ring-foreground/10 ${className}`}
			/>
			<div className="flex flex-col">
				<span className="font-medium text-xs">{name}</span>
				<span className="font-mono text-[10px] text-muted-foreground">
					{hex}
				</span>
			</div>
		</div>
	);
}
