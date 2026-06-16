import { ShieldCheck } from "lucide-react";

export function SuperAdminPermissionsNotice() {
	return (
		<div className="flex flex-col items-center gap-3 rounded-lg border border-border border-dashed px-6 py-10 text-center">
			<ShieldCheck aria-hidden className="size-6 text-muted-foreground" />
			<p className="font-medium text-sm">Acesso total irrestrito</p>
			<p className="max-w-sm text-muted-foreground text-xs">
				Super admin recebe todas as permissões pelo nível de acesso. Overrides
				não se aplicam — não há nada para ajustar aqui.
			</p>
		</div>
	);
}
