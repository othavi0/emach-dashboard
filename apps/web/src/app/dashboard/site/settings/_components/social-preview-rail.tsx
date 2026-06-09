import { SocialIcon } from "./social-icons";
import { SOCIAL_NETWORKS, type SocialState } from "./social-schema";

interface SocialPreviewRailProps {
	state: SocialState;
}

export function SocialPreviewRail({ state }: SocialPreviewRailProps) {
	const visible = SOCIAL_NETWORKS.filter(
		(n) => state[n.key].visible && state[n.key].url.trim()
	);

	return (
		<aside className="flex flex-col gap-3 self-start rounded-md border border-border bg-card p-4">
			<div className="flex flex-col gap-1">
				<h2 className="font-medium text-sm">Como aparece no site</h2>
				<p className="text-muted-foreground text-xs">
					As redes ativas aparecem no rodapé da loja. Atualiza ao salvar.
				</p>
			</div>

			{visible.length > 0 ? (
				<div className="flex flex-wrap items-center gap-4 rounded-md border border-border border-dashed bg-muted/40 p-4">
					{visible.map((n) => (
						<SocialIcon
							className="size-5 text-foreground"
							key={n.key}
							network={n.key}
						/>
					))}
				</div>
			) : (
				<p className="rounded-md border border-border border-dashed bg-muted/40 p-4 text-muted-foreground text-xs">
					Nenhuma rede ativa. Adicione um link e ligue o botão para exibir no
					site.
				</p>
			)}

			<dl className="flex flex-col">
				{SOCIAL_NETWORKS.map((n) => {
					const s = state[n.key];
					let status: string;
					if (!s.url.trim()) {
						status = "Não cadastrado";
					} else if (s.visible) {
						status = "No site";
					} else {
						status = "Oculto";
					}
					return (
						<div
							className="-mx-4 flex items-center justify-between gap-2 border-border border-b px-4 py-2.5 last:border-b-0"
							key={n.key}
						>
							<dt className="flex items-center gap-2 text-muted-foreground text-xs">
								<SocialIcon className="size-3.5" network={n.key} />
								{n.label}
							</dt>
							<dd className="text-foreground text-sm">{status}</dd>
						</div>
					);
				})}
			</dl>
		</aside>
	);
}
