"use client";

import { useRouter } from "next/navigation";
import {
	type Dispatch,
	type SetStateAction,
	useRef,
	useState,
	useTransition,
} from "react";
import { toast } from "sonner";

import type { FormIssue } from "@/components/form-error-panel";
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
	setErrors: Dispatch<
		SetStateAction<Partial<Record<keyof ToolFormValues, string>>>
	>;
	values: ToolFormState;
}

export function useToolSubmit({ mode, values, setErrors }: UseToolSubmitArgs) {
	const router = useRouter();
	const { toolId } = useToolFormContext();
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [isPending, startTransition] = useTransition();
	const errorRef = useRef<HTMLDivElement | null>(null);

	function submit() {
		const parsed = parseToolForm(values);
		setErrors(parsed.fieldErrors);
		setIssues(parsed.issues);
		if (!(parsed.ok && parsed.data)) {
			toast.error(
				`${parsed.issues.length} erro${parsed.issues.length === 1 ? "" : "s"} — veja detalhes acima`
			);
			requestAnimationFrame(() =>
				errorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
			);
			return;
		}
		const data = parsed.data;
		startTransition(async () => {
			const res = await persistTool(mode, data, toolId);
			if (res.ok) {
				toast.success(SUCCESS_MESSAGE[mode]);
				router.push("/dashboard/tools");
				router.refresh();
			} else {
				toast.error(res.error || "Falha ao salvar");
			}
		});
	}

	return { submit, isPending, issues, setIssues, errorRef };
}
