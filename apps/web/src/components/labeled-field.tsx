import { Label } from "@emach/ui/components/label";
import type { ReactNode } from "react";

import { FieldError } from "@/components/field-error";

interface LabeledFieldProps {
	children: (field: {
		id: string;
		"aria-invalid": true | undefined;
	}) => ReactNode;
	error?: string;
	/** Tooltip/HelpTooltip ao lado do label. */
	help?: ReactNode;
	/** Texto auxiliar abaixo do erro (ex: "Markdown suportado"). */
	hint?: ReactNode;
	id: string;
	label: ReactNode;
	required?: boolean;
}

/**
 * Encapsula Label + controle + FieldError numa unidade. O render-prop garante
 * que `id` e `aria-invalid` cheguem ao controle (children faz o spread de
 * `field`), e que o `<FieldError>` (âncora `data-error` do focusFirstError)
 * exista sempre. Convenção documentada em apps/web/CLAUDE.md.
 */
export function LabeledField({
	id,
	label,
	required,
	error,
	help,
	hint,
	children,
}: LabeledFieldProps) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label
				className={help ? "flex items-center gap-1.5" : undefined}
				htmlFor={id}
			>
				{label}
				{required && <span className="text-destructive"> *</span>}
				{help}
			</Label>
			{children({ id, "aria-invalid": error ? true : undefined })}
			<FieldError>{error}</FieldError>
			{hint && <p className="text-muted-foreground text-xs">{hint}</p>}
		</div>
	);
}
