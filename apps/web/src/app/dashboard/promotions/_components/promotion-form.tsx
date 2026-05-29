"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import type { ZodError } from "zod";

import {
	FormErrorPanel,
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";

import { createPromotion, updatePromotion } from "../actions";
import { PromotionFormFields } from "./promotion-form-fields";
import {
	createPromotionSchema,
	type PromotionFormValues,
	promotionSchema,
} from "./promotion-schema";

const FIELD_LABELS: Record<string, string> = {
	title: "Título",
	description: "Descrição",
	type: "Tipo",
	code: "Código",
	discountPct: "Desconto",
	startsAt: "Início",
	endsAt: "Fim",
	toolIds: "Ferramentas",
	active: "Ativa",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ToolOption {
	id: string;
	name: string;
}

export interface PromotionFormProps {
	availableTools: ToolOption[];
	defaultValues?: Partial<PromotionFormValues>;
	mode: "create" | "edit";
	promotionId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function zodErrorsToFieldMap(
	error: ZodError<PromotionFormValues>
): Record<string, string> {
	const map: Record<string, string> = {};
	for (const issue of error.issues) {
		const key = issue.path[0];
		if (key !== undefined && typeof key !== "symbol" && !map[String(key)]) {
			map[String(key)] = issue.message;
		}
	}
	return map;
}

function buildInitialValues(
	defaultValues?: Partial<PromotionFormValues>
): PromotionFormValues {
	const type =
		(defaultValues?.type as "promotion" | "promocode") ?? "promotion";
	const base = {
		title: defaultValues?.title ?? "",
		description: defaultValues?.description ?? null,
		discountPct: defaultValues?.discountPct ?? 0,
		active: defaultValues?.active ?? true,
		startsAt: defaultValues?.startsAt ?? null,
		endsAt: defaultValues?.endsAt ?? null,
		toolIds: defaultValues?.toolIds ?? [],
	};
	if (type === "promocode") {
		return { type: "promocode", code: defaultValues?.code ?? "", ...base };
	}
	return { type: "promotion", code: null, ...base };
}

// ---------------------------------------------------------------------------
// SubmitLabel
// ---------------------------------------------------------------------------

function SubmitLabel({
	isPending,
	mode,
}: {
	isPending: boolean;
	mode: "create" | "edit";
}) {
	if (isPending) {
		return (
			<>
				<Spinner /> Salvando…
			</>
		);
	}
	return <>{mode === "create" ? "Criar promoção" : "Salvar alterações"}</>;
}

// ---------------------------------------------------------------------------
// PromotionForm — usado na página /new (e /edit como fallback)
// ---------------------------------------------------------------------------

export function PromotionForm({
	availableTools,
	defaultValues,
	mode,
	promotionId,
}: PromotionFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [values, setValues] = useState<PromotionFormValues>(() =>
		buildInitialValues(defaultValues)
	);

	const [errors, setErrors] = useState<Record<string, string>>({});
	const [formIssues, setFormIssues] = useState<FormIssue[]>([]);
	const [serverError, setServerError] = useState<string | null>(null);
	const [submitted, setSubmitted] = useState(false);

	const onPatch = (p: Partial<PromotionFormValues>) =>
		setValues((prev) => ({ ...prev, ...p }) as PromotionFormValues);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setErrors({});
		setFormIssues([]);
		setServerError(null);

		const schema = mode === "create" ? createPromotionSchema : promotionSchema;
		const parsed = schema.safeParse(values);

		if (!parsed.success) {
			setErrors(
				zodErrorsToFieldMap(parsed.error as ZodError<PromotionFormValues>)
			);
			const issues = zodIssuesToFormIssues(parsed.error, FIELD_LABELS);
			setFormIssues(issues);
			toast.error(
				`${issues.length} ${issues.length === 1 ? "erro" : "erros"} no formulário — veja detalhes acima`
			);
			return;
		}

		startTransition(async () => {
			let result: { ok: boolean; error?: string };

			if (mode === "create") {
				result = await createPromotion(parsed.data);
			} else {
				if (!promotionId) {
					setServerError("ID da promoção não fornecido");
					return;
				}
				result = await updatePromotion(promotionId, parsed.data);
			}

			if (result.ok) {
				toast.success(
					mode === "create"
						? "Promoção criada com sucesso"
						: "Promoção atualizada com sucesso"
				);
				setSubmitted(true);
				router.push("/dashboard/promotions");
				router.refresh();
			} else {
				setServerError(
					(result as { ok: false; error: string }).error ||
						"Não foi possível salvar a promoção"
				);
			}
		});
	}

	return (
		<form
			className="flex w-full max-w-3xl flex-col gap-6"
			onSubmit={handleSubmit}
		>
			<FormErrorPanel issues={formIssues} />
			{/* Server-side error banner */}
			{serverError && (
				<div
					className="rounded-[8px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive text-sm"
					role="alert"
				>
					{serverError}
				</div>
			)}

			<section className="flex flex-col gap-6 rounded-md border border-border bg-card p-6">
				<PromotionFormFields
					availableTools={availableTools}
					disabled={isPending}
					errors={errors}
					mode={mode}
					onPatch={onPatch}
					values={values}
				/>
			</section>

			{/* Botões */}
			<div className="flex items-center gap-3">
				<Button disabled={isPending || submitted} type="submit">
					<SubmitLabel isPending={isPending} mode={mode} />
				</Button>
				<Button
					disabled={isPending}
					onClick={() => router.push("/dashboard/promotions")}
					type="button"
					variant="ghost"
				>
					Cancelar
				</Button>
			</div>
		</form>
	);
}
