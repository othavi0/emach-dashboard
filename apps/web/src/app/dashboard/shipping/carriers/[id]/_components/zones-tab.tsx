import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { getCarrierZones } from "../../../data";
import { ZoneEditor } from "./zone-editor";

interface Props {
	carrierId: string;
}

export async function ZonesTab({ carrierId }: Props) {
	const session = await requireCapabilityOrRedirect("shipping.read");
	const canManage = await can(session, "shipping.manage");
	const zones = await getCarrierZones(carrierId);

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
