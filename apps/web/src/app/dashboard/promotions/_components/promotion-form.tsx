"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ZodError } from "zod";
import {
	FormErrorPanel,
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { notify } from "@/lib/notify";

import { createPromotion, updatePromotion } from "../actions";
import { PromotionFormFields } from "./promotion-form-fields";
import {
	createPromotionSchema,
	type PromotionFormValues,
	promotionSchema,
} from "./promotion-schema";

export const FIELD_LABELS: Record<string, string> = {
	title: "Título",
	description: "Descrição",
	type: "Tipo",
	code: "Código",
	discountType: "Tipo de desconto",
	discountValue: "Desconto",
	appliesToAll: "Ferramentas",
	maxRedemptions: "Limite de resgates",
	minOrderAmount: "Valor mínimo do pedido",
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
	initialValues?: PromotionFormValues;
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

const CREATE_DEFAULTS: PromotionFormValues = {
	type: "promotion",
	title: "",
	description: null,
	discountType: "percent",
	discountValue: 0,
	appliesToAll: false,
	active: true,
	featured: false,
	startsAt: null,
	endsAt: null,
	code: null,
	toolIds: [],
};

// ---------------------------------------------------------------------------
// SubmitLabel
// ---------------------------------------------------------------------------

function SubmitLabel({
	isPending,
	mode,
	type,
}: {
	isPending: boolean;
	mode: "create" | "edit";
	type: "promotion" | "promocode";
}) {
	if (isPending) {
		return (
			<>
				<Spinner /> Salvando…
			</>
		);
	}
	if (mode === "edit") {
		return <>Salvar alterações</>;
	}
	return <>{type === "promocode" ? "Criar cupom" : "Criar promoção"}</>;
}

// ---------------------------------------------------------------------------
// PromotionForm — usado na página /new (e /edit como fallback)
// ---------------------------------------------------------------------------

export function PromotionForm({
	availableTools,
	initialValues,
	mode,
	promotionId,
}: PromotionFormProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [values, setValues] = useState<PromotionFormValues>(
		initialValues ?? CREATE_DEFAULTS
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
			notify.error(
				`${issues.length} ${issues.length === 1 ? "erro" : "erros"} no formulário — veja detalhes acima`
			);
			return;
		}

		startTransition(async () => {
			if (mode === "create") {
				const result = await createPromotion(parsed.data);
				if (result.ok) {
					notify.success("Promoção criada com sucesso");
					setSubmitted(true);
					router.push(`/dashboard/promotions/${result.data.id}`);
				} else {
					const msg = result.error || "Não foi possível criar a promoção";
					setServerError(msg);
					notify.error(msg);
				}
			} else {
				if (!promotionId) {
					setServerError("ID da promoção não fornecido");
					return;
				}
				const result = await updatePromotion(promotionId, parsed.data);
				if (result.ok) {
					notify.success("Promoção atualizada com sucesso");
					setSubmitted(true);
					router.push(`/dashboard/promotions/${promotionId}`);
				} else {
					const msg = result.error || "Não foi possível salvar a promoção";
					setServerError(msg);
					notify.error(msg);
				}
			}
		});
	}

	return (
		<form className="flex w-full flex-col gap-8" onSubmit={handleSubmit}>
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

			<PromotionFormFields
				availableTools={availableTools}
				disabled={isPending}
				errors={errors}
				excludePromotionId={mode === "edit" ? promotionId : undefined}
				mode={mode}
				onPatch={onPatch}
				values={values}
			/>

			{/* Botões */}
			<div className="flex items-center justify-end gap-3 border-border border-t pt-6">
				<Button
					disabled={isPending}
					onClick={() => router.push("/dashboard/promotions")}
					type="button"
					variant="ghost"
				>
					Cancelar
				</Button>
				<Button disabled={isPending || submitted} type="submit">
					<SubmitLabel isPending={isPending} mode={mode} type={values.type} />
				</Button>
			</div>
		</form>
	);
}
