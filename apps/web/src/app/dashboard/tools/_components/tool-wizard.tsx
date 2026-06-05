"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { Check } from "lucide-react";
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
import { getStepIssues, TOOL_STEPS, type ToolStepId } from "./tool-form-steps";
import { parseToolForm, persistTool } from "./tool-submit";

const STEP_COMPONENT: Record<
	ToolStepId,
	React.ComponentType<ToolFieldGroupProps>
> = {
	identity: IdentityFields,
	variants: VariantFields,
	specs: SpecFields,
	logistics: LogisticsFields,
	fiscal: FiscalFields,
	publish: PublishFields,
};

export function ToolWizard({
	defaultValues,
}: {
	defaultValues?: Partial<ToolFormState>;
}) {
	const router = useRouter();
	const { toolId } = useToolFormContext();
	const { values, patch, errors, setErrors } = useToolFormState(
		defaultValues ?? {}
	);
	const [active, setActive] = useState(0);
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [isPending, startTransition] = useTransition();
	const errorRef = useRef<HTMLDivElement | null>(null);

	// active é controlado por setActive com clamp — nunca sai dos bounds
	// biome-ignore lint/style/noNonNullAssertion: array constante não-vazio, índice clamped
	const step = TOOL_STEPS[Math.min(active, TOOL_STEPS.length - 1)]!;
	const Fields = STEP_COMPONENT[step.id];

	function stepDone(stepId: ToolStepId): boolean {
		return getStepIssues(values, stepId).length === 0;
	}

	function next() {
		const stepIssues = getStepIssues(values, step.id);
		setIssues(stepIssues);
		if (stepIssues.length > 0 && !step.optional) {
			return;
		}
		setActive((i) => Math.min(i + 1, TOOL_STEPS.length - 1));
	}

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
			const res = await persistTool("create", data, toolId);
			if (res.ok) {
				toast.success("Ferramenta criada com sucesso");
				router.push("/dashboard/tools");
				router.refresh();
			} else {
				toast.error(res.error || "Falha ao salvar");
			}
		});
	}

	return (
		<div className="flex flex-col gap-6">
			<ol className="flex flex-wrap gap-1 rounded-md bg-muted p-1 ring-1 ring-border/60">
				{TOOL_STEPS.map((s, i) => {
					const done = i !== active && stepDone(s.id);
					const isActive = i === active;
					return (
						<li key={s.id}>
							<button
								aria-current={isActive ? "step" : undefined}
								className={
									isActive
										? "flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs"
										: "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground text-xs hover:text-foreground"
								}
								onClick={() => setActive(i)}
								type="button"
							>
								{done ? (
									<Check aria-hidden className="size-3.5 text-success" />
								) : (
									<span>{i + 1}</span>
								)}
								{s.label}
								{s.optional && (
									<span className="text-[10px] opacity-70">(opcional)</span>
								)}
							</button>
						</li>
					);
				})}
			</ol>

			<FormErrorPanel issues={issues} ref={errorRef} />

			<section className="flex flex-col gap-2 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-semibold text-primary text-sm uppercase tracking-wide">
						{step.label}
					</h2>
					<p className="text-muted-foreground text-xs">{step.description}</p>
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

			<div className="flex items-center justify-between">
				<Button
					disabled={active === 0}
					onClick={() => setActive((i) => Math.max(i - 1, 0))}
					type="button"
					variant="ghost"
				>
					‹ Voltar
				</Button>
				{active < TOOL_STEPS.length - 1 ? (
					<Button onClick={next} type="button">
						Próximo ›
					</Button>
				) : (
					<Button disabled={isPending} onClick={submit} type="button">
						{isPending ? (
							<>
								<Spinner /> Salvando…
							</>
						) : (
							"Criar ferramenta"
						)}
					</Button>
				)}
			</div>
		</div>
	);
}
