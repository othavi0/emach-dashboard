"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Spinner } from "@emach/ui/components/spinner";
import { Switch } from "@emach/ui/components/switch";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
	FormErrorPanel,
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";
import { updateSocialSettings } from "../actions";
import { SocialIcon } from "./social-icons";
import {
	isPublishableUrl,
	SOCIAL_NETWORKS,
	type SocialNetworkKey,
	type SocialSettingsFormValues,
	type SocialState,
	socialSettingsSchema,
} from "./social-schema";

const FIELD_LABELS: Record<string, string> = Object.fromEntries(
	SOCIAL_NETWORKS.map((n) => [`${n.key}Url`, `${n.label} (link)`])
);

interface SocialSettingsFormProps {
	settings: SocialState;
}

export function SocialSettingsForm({ settings }: SocialSettingsFormProps) {
	const [isPending, startTransition] = useTransition();
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [state, setState] = useState<SocialState>(settings);

	function setUrl(key: SocialNetworkKey, url: string) {
		setState((prev) => ({
			...prev,
			// Só um link publicável (http/https) pode permanecer visível no site.
			[key]: {
				url,
				visible: isPublishableUrl(url) ? prev[key].visible : false,
			},
		}));
	}

	function setVisible(key: SocialNetworkKey, visible: boolean) {
		setState((prev) => ({ ...prev, [key]: { ...prev[key], visible } }));
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIssues([]);

		const raw: Record<string, unknown> = {};
		for (const n of SOCIAL_NETWORKS) {
			raw[`${n.key}Url`] = state[n.key].url;
			raw[`${n.key}Visible`] = state[n.key].visible;
		}

		const parsed = socialSettingsSchema.safeParse(raw);
		if (!parsed.success) {
			const next = zodIssuesToFormIssues(parsed.error, FIELD_LABELS);
			setIssues(next);
			toast.error(
				`${next.length} ${next.length === 1 ? "erro" : "erros"} no formulário — veja detalhes acima`
			);
			return;
		}

		const values: SocialSettingsFormValues = parsed.data;
		startTransition(async () => {
			const result = await updateSocialSettings(values);
			if (result.ok) {
				toast.success("Redes sociais salvas");
			} else {
				toast.error(result.error || "Não foi possível salvar");
			}
		});
	}

	return (
		<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
			<FormErrorPanel issues={issues} />

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-medium text-sm">Redes sociais</h2>
					<p className="text-muted-foreground text-sm">
						Cole o link completo de cada perfil. O botão à direita controla se a
						rede aparece no site — só dá para ativar quando há um link
						preenchido.
					</p>
				</div>

				<div className="flex flex-col gap-5">
					{SOCIAL_NETWORKS.map((n) => {
						const value = state[n.key];
						const canPublish = isPublishableUrl(value.url);
						const invalidUrl = Boolean(value.url.trim()) && !canPublish;
						return (
							<div className="flex flex-col gap-2" key={n.key}>
								<div className="flex items-center justify-between gap-3">
									<Label
										className="flex items-center gap-2"
										htmlFor={`${n.key}Url`}
									>
										<SocialIcon
											className="size-4 text-muted-foreground"
											network={n.key}
										/>
										{n.label}
									</Label>
									<div className="flex items-center gap-2">
										<span className="text-muted-foreground text-xs">
											{value.visible ? "No site" : "Oculto"}
										</span>
										<Switch
											aria-label={`Exibir ${n.label} no site`}
											checked={value.visible}
											disabled={!canPublish}
											onCheckedChange={(checked) => setVisible(n.key, checked)}
										/>
									</div>
								</div>
								<Input
									aria-invalid={invalidUrl}
									id={`${n.key}Url`}
									inputMode="url"
									onChange={(e) => setUrl(n.key, e.target.value)}
									placeholder={n.placeholder}
									type="url"
									value={value.url}
								/>
								{invalidUrl ? (
									<p className="text-destructive text-xs">
										Link inválido — comece com https:// para poder exibir no
										site.
									</p>
								) : null}
							</div>
						);
					})}
				</div>
			</section>

			<div className="flex items-center gap-3">
				<Button disabled={isPending} type="submit">
					{isPending ? (
						<>
							<Spinner /> Salvando…
						</>
					) : (
						"Salvar alterações"
					)}
				</Button>
			</div>
		</form>
	);
}
