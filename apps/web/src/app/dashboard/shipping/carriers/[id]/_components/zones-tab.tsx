import type { ZoneWithRates } from "../../../data";
import { ZoneEditor } from "./zone-editor";

interface Props {
	canManage: boolean;
	carrierId: string;
	zones: ZoneWithRates[];
}

export function ZonesTab({ carrierId, canManage, zones }: Props) {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-4">
				{zones.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Nenhuma zona configurada. Adicione uma zona para definir as faixas
						de entrega.
					</p>
				) : (
					zones.map((zone) => (
						<ZoneEditor
							canManage={canManage}
							carrierId={carrierId}
							key={zone.id}
							zone={zone}
						/>
					))
				)}
			</div>
			{canManage && (
				<ZoneEditor canManage={canManage} carrierId={carrierId} zone={null} />
			)}
		</div>
	);
}
