"use client";

import type { Ref } from "react";
import type { ZodError } from "zod";

export interface FormIssue {
	message: string;
	path: string;
}

export function zodIssuesToFormIssues(
	error: ZodError,
	labels: Record<string, string>
): FormIssue[] {
	return error.issues.map((issue) => {
		if (issue.path.length === 0) {
			return { path: "Formulário", message: issue.message };
		}
		const head = String(issue.path[0]);
		const headLabel = labels[head] ?? head;
		const rest = issue.path
			.slice(1)
			.map((p) => (typeof p === "number" ? `#${p + 1}` : String(p)))
			.join(" › ");
		return {
			path: rest ? `${headLabel} · ${rest}` : headLabel,
			message: issue.message,
		};
	});
}

interface FormErrorPanelProps {
	issues: FormIssue[];
	ref?: Ref<HTMLDivElement>;
}

export function FormErrorPanel({ issues, ref }: FormErrorPanelProps) {
	if (issues.length === 0) {
		return null;
	}
	return (
		<div
			className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4"
			ref={ref}
			role="alert"
		>
			<h2 className="font-semibold text-destructive text-sm">
				{issues.length} erro{issues.length === 1 ? "" : "s"} no formulário
			</h2>
			<ul className="flex list-disc flex-col gap-1 pl-5 text-destructive text-xs">
				{issues.map((issue, i) => (
					<li key={`${issue.path}-${i}`}>
						<span className="font-medium">{issue.path}</span>
						{": "}
						{issue.message}
					</li>
				))}
			</ul>
		</div>
	);
}
