"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { LogOut, MonitorOff } from "lucide-react";
import { useTransition } from "react";
import { formatDateTime } from "@/lib/format/datetime";
import { notify } from "@/lib/notify";
import { revokeUserSession } from "../../actions";

interface SessionRow {
	createdAt: Date;
	expiresAt: Date;
	id: string;
	ipAddress: string | null;
	userAgent: string | null;
}

export function SessionsList({
	sessions,
	userId: _userId,
}: {
	sessions: SessionRow[];
	userId: string;
}) {
	const [pending, startTransition] = useTransition();

	const revoke = (sessionId: string) => {
		startTransition(async () => {
			const res = await revokeUserSession({ sessionId });
			if (res.ok) {
				notify.success("Sessão revogada");
			} else {
				notify.error(res.error);
			}
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					Sessões ativas ({sessions.length})
				</CardTitle>
			</CardHeader>
			<CardContent>
				{sessions.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-8 text-center">
						<MonitorOff
							aria-hidden
							className="size-12 text-muted-foreground opacity-40"
						/>
						<p className="font-medium text-sm">Sem sessões ativas</p>
						<p className="text-muted-foreground text-xs">
							O usuário não está logado em nenhum dispositivo.
						</p>
					</div>
				) : (
					<ul className="flex flex-col gap-2">
						{sessions.map((s) => (
							<li
								className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
								key={s.id}
							>
								<div className="min-w-0">
									<p className="truncate font-medium text-sm">
										{s.ipAddress ?? "IP desconhecido"}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{s.userAgent ?? "—"} · expira {formatDateTime(s.expiresAt)}
									</p>
								</div>
								<Button
									disabled={pending}
									onClick={() => revoke(s.id)}
									size="sm"
									variant="outline"
								>
									<LogOut aria-hidden className="size-3.5" />
									Revogar
								</Button>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
