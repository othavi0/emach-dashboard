"use client";

import { useRouter } from "next/navigation";
import { type Dispatch, type SetStateAction, useTransition } from "react";
import { errorToastMessage, focusFirstError } from "@/lib/form-errors";
import { notify } from "@/lib/notify";
import { useToolFormContext } from "./tool-form-context";
import type { ToolFormState } from "./tool-form-state";
import type { ToolFormValues } from "./tool-schema";
import { parseToolForm, persistTool } from "./tool-submit";

const SUCCESS_MESSAGE: Record<"create" | "edit", string> = {
	create: "Ferramenta criada com sucesso",
	edit: "Ferramenta atualizada com sucesso",
};

interface UseToolSubmitArgs {
	mode: "create" | "edit";
	/** Chamado uma vez quando a persistência retorna ok (ex: limpar rascunho). */
	onSuccess?: () => void;
	/** Wizard injeta para navegar até o passo com erro antes de focar. */
	onValidationFail?: (errorKeys: string[]) => void;
	setErrors: Dispatch<
		SetStateAction<Partial<Record<keyof ToolFormValues, string>>>
	>;
	values: ToolFormState;
}

export function useToolSubmit({
	mode,
	values,
	setErrors,
	onValidationFail,
	onSuccess,
}: UseToolSubmitArgs) {
	const router = useRouter();
	const { toolId } = useToolFormContext();
	const [isPending, startTransition] = useTransition();

	function submit() {
		const parsed = parseToolForm(values);
		setErrors(parsed.fieldErrors);
		if (!(parsed.ok && parsed.data)) {
			notify.error(errorToastMessage(parsed.fieldErrors));
			if (onValidationFail) {
				onValidationFail(Object.keys(parsed.fieldErrors));
			} else {
				focusFirstError();
			}
			return;
		}
		const data = parsed.data;
		startTransition(async () => {
			const res = await persistTool(mode, data, toolId);
			if (res.ok) {
				notify.success(SUCCESS_MESSAGE[mode]);
				onSuccess?.();
				router.push("/dashboard/tools");
				router.refresh();
			} else {
				notify.error(res.error || "Falha ao salvar");
			}
		});
	}

	return { submit, isPending };
}
