import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";

import type { UserDetail } from "../../data";
import { DangerZone } from "./danger-zone";

const DATE = new Intl.DateTimeFormat("pt-BR", {
	dateStyle: "long",
	timeStyle: "short",
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div>
			<dt className="text-muted-foreground text-xs uppercase tracking-wide">
				{label}
			</dt>
			<dd className="font-medium text-sm">{value}</dd>
		</div>
	);
}

interface Props {
	canDelete: boolean;
	user: UserDetail;
}

export function ProfileTab({ user, canDelete }: Props) {
	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Perfil</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<Field label="Nome" value={user.name} />
						<Field label="Email" value={user.email} />
						<Field
							label="Email verificado"
							value={user.emailVerified ? "Sim" : "Não"}
						/>
						<Field label="Cadastrado em" value={DATE.format(user.createdAt)} />
						<Field
							label="Último login"
							value={user.lastLoginAt ? DATE.format(user.lastLoginAt) : "Nunca"}
						/>
						<Field
							label="Filiais"
							value={
								user.branchNames.length > 0
									? user.branchNames.join(" · ")
									: "Sem filial vinculada"
							}
						/>
					</dl>
				</CardContent>
			</Card>
			<DangerZone
				canDelete={canDelete}
				user={{ id: user.id, name: user.name }}
			/>
		</div>
	);
}
