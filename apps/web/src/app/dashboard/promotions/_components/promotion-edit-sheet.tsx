"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import {
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";

import { type PromotionDetail, updatePromotion } from "../actions";
import { PromotionFormFields } from "./promotion-form-fields";
import { type PromotionFormValues, promotionSchema } from "./promotion-schema";

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

function toFormValues(p: PromotionDetail): PromotionFormValues {
	return {
		type: p.type as "promotion" | "promocode",
		title: p.title,
		description: p.description,
		discountPct: Number(p.discountPct),
		active: p.active,
		startsAt: p.startsAt,
		endsAt: p.endsAt,
		code: p.code,
		toolIds: p.toolIds,
	} as PromotionFormValues;
}

interface Props {
	availableTools: { id: string; name: string }[];
	promotion: PromotionDetail | null;
}

export function PromotionEditSheet({ availableTools, promotion }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = Boolean(params.get("edit")) && promotion !== null;

	const [values, setValues] = useState<PromotionFormValues | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open && promotion) {
			setValues(toFormValues(promotion));
			setErrors({});
			setIssues([]);
		}
	}, [open, promotion]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!(values && promotion)) {
			return;
		}
		setErrors({});
		setIssues([]);
		const parsed = promotionSchema.safeParse(values);
		if (!parsed.success) {
			setIssues(zodIssuesToFormIssues(parsed.error, FIELD_LABELS));
			return;
		}
		startTransition(async () => {
			const res = await updatePromotion(promotion.id, parsed.data);
			if (res.ok) {
				toast.success("Promoção atualizada");
				close();
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize os dados da promoção"
			issues={issues}
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={promotion ? `Editar ${promotion.title}` : "Editar promoção"}
		>
			{values ? (
				<PromotionFormFields
					availableTools={availableTools}
					disabled={submitting}
					errors={errors}
					mode="edit"
					onPatch={(p) =>
						setValues((prev) =>
							prev ? ({ ...prev, ...p } as PromotionFormValues) : prev
						)
					}
					values={values}
				/>
			) : null}
		</EntityEditSheet>
	);
}
