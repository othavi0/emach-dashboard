"use client";

import { useCallback, useState } from "react";
import type { ZodError } from "zod";
import {
	errorToastMessage,
	type FieldErrorMap,
	focusFirstError,
	zodIssuesToFieldErrors,
} from "@/lib/form-errors";
import { notify } from "@/lib/notify";

/**
 * Estado de erros por campo + report unificado (setErrors + toast + foco).
 * Encapsula a fiação repetida em cada form. `reportValidationError` recebe o
 * ZodError de um `safeParse` falho; `clearErrors` zera (use ao abrir/resetar).
 *
 * `transform` (opcional) remapeia os erros antes do setErrors/toast/foco — útil
 * quando um campo oculto/derivado precisa apontar para outro (ex: slug→Nome em
 * `category-form`). Mantém a tripla concentrada aqui, sem duplicar nos forms.
 */
export function useFormErrors<T = Record<string, string>>() {
	const [errors, setErrors] = useState<FieldErrorMap<T>>({});
	const reportValidationError = useCallback(
		(
			error: ZodError,
			transform?: (fieldErrors: FieldErrorMap<T>) => FieldErrorMap<T>
		) => {
			const base = zodIssuesToFieldErrors<T>(error);
			const fieldErrors = transform ? transform(base) : base;
			setErrors(fieldErrors);
			notify.error(errorToastMessage(fieldErrors));
			focusFirstError();
		},
		[]
	);
	const clearErrors = useCallback(() => setErrors({}), []);
	return { errors, setErrors, reportValidationError, clearErrors };
}
