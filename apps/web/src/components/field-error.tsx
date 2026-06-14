interface FieldErrorProps {
	children?: string;
}

/**
 * Mensagem de erro por campo padronizada. `data-error` marca o elemento para
 * o fallback de scroll de `focusFirstError`. Não renderiza nada quando vazio.
 */
export function FieldError({ children }: FieldErrorProps) {
	if (!children) {
		return null;
	}
	return (
		<p className="text-destructive text-xs" data-error="true">
			{children}
		</p>
	);
}
