import { Badge } from "@emach/ui/components/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Empty, EmptyHeader, EmptyTitle } from "@emach/ui/components/empty";

import { formatDateTime } from "@/lib/format/datetime";
import type { CustomerConsentByKind } from "../data";

const KIND_LABELS: Record<string, string> = {
	tos: "Termos de Uso",
	privacy: "Privacidade",
	marketing_email: "Email Marketing",
	cookies: "Cookies",
};

const KIND_ORDER = ["tos", "privacy", "marketing_email", "cookies"] as const;

interface CustomerConsentListProps {
	consentByKind: CustomerConsentByKind;
}

export function CustomerConsentList({
	consentByKind,
}: CustomerConsentListProps) {
	const hasAnyKind = KIND_ORDER.some(
		(kind) => (consentByKind[kind] ?? []).length > 0
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-sm">Consentimento</CardTitle>
			</CardHeader>
			<CardContent>
				{hasAnyKind ? (
					<div className="grid gap-4 md:grid-cols-2">
						{KIND_ORDER.map((kind) => {
							const entries = consentByKind[kind] ?? [];
							return (
								<div className="rounded-lg border border-border p-4" key={kind}>
									<h3 className="mb-2 font-medium text-sm">
										{KIND_LABELS[kind] ?? kind}
									</h3>
									{entries.length === 0 ? (
										<p className="text-muted-foreground text-xs">
											Nenhum registro para este tipo.
										</p>
									) : (
										<div className="flex flex-col gap-2">
											{entries.map((entry) => (
												<div
													className="flex flex-col gap-0.5 border-border border-l-2 pl-3 text-xs"
													key={entry.id}
												>
													<div className="flex items-center gap-2">
														<Badge
															className="text-[10px]"
															variant={entry.granted ? "success" : "secondary"}
														>
															{entry.granted ? "Concedido" : "Revogado"}
														</Badge>
														<code className="font-mono text-muted-foreground">
															v{entry.version}
														</code>
													</div>
													<p className="text-muted-foreground">
														{formatDateTime(entry.grantedAt)}
													</p>
													{entry.revokedAt && (
														<p className="text-muted-foreground">
															Revogado em {formatDateTime(entry.revokedAt)}
														</p>
													)}
												</div>
											))}
										</div>
									)}
								</div>
							);
						})}
					</div>
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyTitle>Nenhum consentimento registrado</EmptyTitle>
						</EmptyHeader>
					</Empty>
				)}
			</CardContent>
		</Card>
	);
}
