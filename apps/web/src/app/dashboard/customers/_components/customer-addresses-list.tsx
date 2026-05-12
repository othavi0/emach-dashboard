import { Badge } from "@emach/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Empty, EmptyHeader, EmptyTitle } from "@emach/ui/components/empty";

import type { CustomerAddressRow } from "../data";

interface CustomerAddressesListProps {
	addresses: CustomerAddressRow[];
}

export function CustomerAddressesList({
	addresses,
}: CustomerAddressesListProps) {
	if (addresses.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Nenhum endereço cadastrado</EmptyTitle>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{addresses.map((addr) => (
				<Card key={addr.id}>
					<CardHeader className="pb-2">
						<CardTitle className="flex items-center gap-2 text-sm">
							{addr.label ?? "Endereço"}
							{addr.isDefault && (
								<Badge className="text-[10px]" variant="secondary">
									Principal
								</Badge>
							)}
						</CardTitle>
					</CardHeader>
					<CardContent className="text-muted-foreground text-sm">
						<p className="font-medium text-foreground">{addr.recipient}</p>
						<p>
							{addr.street}, {addr.number}
							{addr.complement ? `, ${addr.complement}` : ""}
						</p>
						<p>
							{addr.neighborhood} — {addr.city}/{addr.state}
						</p>
						<p>CEP {addr.zipCode}</p>
						{addr.country !== "BR" && <p>{addr.country}</p>}
					</CardContent>
				</Card>
			))}
		</div>
	);
}
