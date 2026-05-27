import { AlertTriangleIcon } from "lucide-react";

interface NfeCancelledBannerProps {
	nfeStatus: string | null;
}

const CANCELLED_VALUES = new Set(["cancelled", "canceled", "cancelada"]);

export function NfeCancelledBanner({ nfeStatus }: NfeCancelledBannerProps) {
	if (!(nfeStatus && CANCELLED_VALUES.has(nfeStatus.toLowerCase()))) {
		return null;
	}
	return (
		<div className="flex items-start gap-3 rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-destructive">
			<AlertTriangleIcon
				aria-hidden="true"
				className="mt-0.5 size-4 shrink-0"
			/>
			<div className="flex flex-col gap-0.5">
				<p className="font-medium text-sm">NF-e cancelada</p>
				<p className="text-xs leading-relaxed">
					O status da nota fiscal foi alterado para <strong>cancelled</strong>{" "}
					no Asaas. Confirme com o financeiro se precisa reemitir ou estornar o
					pedido.
				</p>
			</div>
		</div>
	);
}
