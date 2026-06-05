"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { FormErrorPanel, type FormIssue } from "@/components/form-error-panel";
import { FiscalFields } from "./fields/fiscal-fields";
import { IdentityFields } from "./fields/identity-fields";
import { LogisticsFields } from "./fields/logistics-fields";
import { PublishFields } from "./fields/publish-fields";
import { SpecFields } from "./fields/spec-fields";
import type { ToolFieldGroupProps } from "./fields/types";
import { VariantFields } from "./fields/variant-fields";
import { useToolFormContext } from "./tool-form-context";
import { type ToolFormState, useToolFormState } from "./tool-form-state";
import { TOOL_STEPS, type ToolStepId } from "./tool-form-steps";
import { parseToolForm, persistTool } from "./tool-submit";

const SECTION: Record<ToolStepId, React.ComponentType<ToolFieldGroupProps>> = {
	identity: IdentityFields,
	variants: VariantFields,
	specs: SpecFields,
	logistics: LogisticsFields,
	fiscal: FiscalFields,
	publish: PublishFields,
};

export function ToolEditView({
	defaultValues,
}: {
	defaultValues?: Partial<ToolFormState>;
}) {
	const router = useRouter();
	const { toolId } = useToolFormContext();
	const { values, patch, errors, setErrors } = useToolFormState(
		defaultValues ?? {}
	);
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [isPending, startTransition] = useTransition();
	const errorRef = useRef<HTMLDivElement | null>(null);

	function submit() {
		const parsed = parseToolForm(values);
		setErrors(parsed.fieldErrors);
		setIssues(parsed.issues);
		if (!(parsed.ok && parsed.data)) {
			requestAnimationFrame(() =>
				errorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
			);
			return;
		}
		const data = parsed.data;
		startTransition(async () => {
			const res = await persistTool("edit", data, toolId);
			if (res.ok) {
				toast.success("Ferramenta atualizada com sucesso");
				router.push("/dashboard/tools");
				router.refresh();
			} else {
				toast.error(res.error || "Falha ao salvar");
			}
		});
	}

	return (
		<div className="flex flex-col gap-6 lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
			<nav className="hidden lg:sticky lg:top-6 lg:flex lg:h-fit lg:flex-col lg:gap-1">
				{TOOL_STEPS.map((s) => (
					<a
						className="rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:bg-muted hover:text-foreground"
						href={`#sec-${s.id}`}
						key={s.id}
					>
						{s.label}
					</a>
				))}
			</nav>
			<div className="flex flex-col gap-6">
				<FormErrorPanel issues={issues} ref={errorRef} />
				{TOOL_STEPS.map((s) => {
					const Fields = SECTION[s.id];
					return (
						<section
							className="flex scroll-mt-6 flex-col gap-2 rounded-md border border-border bg-card p-6"
							id={`sec-${s.id}`}
							key={s.id}
						>
							<div className="flex flex-col gap-1">
								<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
									{s.label}
								</h2>
								<p className="text-muted-foreground text-xs">{s.description}</p>
							</div>
							<div className="pt-4">
								<Fields
									disabled={isPending}
									errors={errors}
									onPatch={patch}
									values={values}
								/>
							</div>
						</section>
					);
				})}
				<div className="flex gap-3">
					<Button disabled={isPending} onClick={submit} type="button">
						{isPending ? (
							<>
								<Spinner /> Salvando…
							</>
						) : (
							"Salvar alterações"
						)}
					</Button>
					<Button
						onClick={() => router.push("/dashboard/tools")}
						type="button"
						variant="ghost"
					>
						Cancelar
					</Button>
				</div>
			</div>
		</div>
	);
}
