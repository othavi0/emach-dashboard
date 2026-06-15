"use client";

import type { Banner } from "@emach/db/schema/banner";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Switch } from "@emach/ui/components/switch";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FieldError } from "@/components/field-error";
import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { createBanner, updateBanner } from "../actions";
import { BannerLivePreview } from "./banner-live-preview";
import { type BannerFormValues, bannerFormSchema } from "./banner-schema";
import { ImageUploadTile } from "./image-upload-tile";

function initial(banner?: Banner): BannerFormValues {
	return {
		backgroundImageUrl: banner?.backgroundImageUrl ?? "",
		backgroundImageMobileUrl: banner?.backgroundImageMobileUrl ?? null,
		productImageUrl: banner?.productImageUrl ?? null,
		productImageMobileUrl: banner?.productImageMobileUrl ?? null,
		title: banner?.title ?? "",
		subtitle: banner?.subtitle ?? null,
		altText: banner?.altText ?? "",
		ctaLabel: banner?.ctaLabel ?? "",
		ctaHref: banner?.ctaHref ?? "",
		isActive: banner?.isActive ?? false,
	};
}

export function BannerForm({ banner }: { banner?: Banner }) {
	const router = useRouter();
	const [values, setValues] = useState<BannerFormValues>(() => initial(banner));
	const [pending, startTransition] = useTransition();
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<BannerFormValues>();

	function set<K extends keyof BannerFormValues>(
		key: K,
		v: BannerFormValues[K]
	) {
		setValues((prev) => ({ ...prev, [key]: v }));
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		clearErrors();
		const parsed = bannerFormSchema.safeParse(values);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const r = banner
				? await updateBanner(banner.id, parsed.data)
				: await createBanner(parsed.data);
			if (r.ok) {
				notify.success(banner ? "Banner atualizado" : "Banner criado");
				router.push("/dashboard/site/banners");
				router.refresh();
			} else {
				notify.error(r.error);
			}
		});
	}

	return (
		<form
			className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]"
			onSubmit={handleSubmit}
		>
			<div className="flex flex-col gap-5">
				<fieldset className="rounded-xl border border-border bg-card p-4">
					<legend className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Imagens
					</legend>
					<div className="grid grid-cols-2 gap-3">
						<ImageUploadTile
							help="2560×1440 · 16:9 · WebP/JPG · ≤500KB"
							label="Fundo · desktop"
							onChange={(u) => {
								set("backgroundImageUrl", u ?? "");
							}}
							required
							value={values.backgroundImageUrl || null}
						/>
						<ImageUploadTile
							help="1080×1920 · 9:16 · ≤350KB · cai pro desktop se vazio"
							label="Fundo · mobile"
							onChange={(u) => set("backgroundImageMobileUrl", u)}
							value={values.backgroundImageMobileUrl}
						/>
						<ImageUploadTile
							help="~2400px · PNG transparente · ≤800KB"
							label="Produto · desktop"
							onChange={(u) => set("productImageUrl", u)}
							value={values.productImageUrl}
						/>
						<ImageUploadTile
							help="~1400px · PNG · ≤500KB · cai pro produto desktop se vazio"
							label="Produto · mobile"
							onChange={(u) => set("productImageMobileUrl", u)}
							value={values.productImageMobileUrl}
						/>
					</div>
					<FieldError>{errors.backgroundImageUrl}</FieldError>
				</fieldset>

				<fieldset className="rounded-xl border border-border bg-card p-4">
					<legend className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Conteúdo
					</legend>
					<div className="flex flex-col gap-3">
						<LabeledField
							error={errors.title}
							id="banner-title"
							label={`Título (${values.title.length}/80)`}
							required
						>
							{(f) => (
								<Input
									{...f}
									maxLength={80}
									onBlur={() => {
										if (!values.altText) {
											set("altText", values.title);
										}
									}}
									onChange={(e) => set("title", e.target.value)}
									value={values.title}
								/>
							)}
						</LabeledField>
						<LabeledField
							error={errors.subtitle}
							id="banner-subtitle"
							label={`Subtítulo (${(values.subtitle ?? "").length}/140)`}
						>
							{(f) => (
								<Input
									{...f}
									maxLength={140}
									onChange={(e) => set("subtitle", e.target.value || null)}
									value={values.subtitle ?? ""}
								/>
							)}
						</LabeledField>
						<LabeledField
							error={errors.altText}
							help={
								<HelpTooltip text="Descreve a imagem de fundo para leitores de tela." />
							}
							id="banner-alt-text"
							label="Texto alternativo (alt)"
							required
						>
							{(f) => (
								<Input
									{...f}
									onChange={(e) => set("altText", e.target.value)}
									value={values.altText}
								/>
							)}
						</LabeledField>
					</div>
				</fieldset>

				<fieldset className="rounded-xl border border-border bg-card p-4">
					<legend className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Botão (CTA)
					</legend>
					<div className="flex flex-col gap-3">
						<LabeledField
							error={errors.ctaLabel}
							id="banner-cta-label"
							label={`Rótulo (${values.ctaLabel.length}/30)`}
							required
						>
							{(f) => (
								<Input
									{...f}
									maxLength={30}
									onChange={(e) => set("ctaLabel", e.target.value)}
									value={values.ctaLabel}
								/>
							)}
						</LabeledField>
						<LabeledField
							error={errors.ctaHref}
							help={
								<HelpTooltip text="Rota interna (/catalog) ou URL externa (https://...)." />
							}
							id="banner-cta-href"
							label="Link"
							required
						>
							{(f) => (
								<Input
									{...f}
									onChange={(e) => set("ctaHref", e.target.value)}
									placeholder="/catalog"
									value={values.ctaHref}
								/>
							)}
						</LabeledField>
					</div>
				</fieldset>

				<fieldset className="rounded-xl border border-border bg-card p-4">
					<legend className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Publicação
					</legend>
					<label
						className="flex items-center gap-2 text-sm"
						htmlFor="banner-is-active"
					>
						<Switch
							checked={values.isActive}
							id="banner-is-active"
							onCheckedChange={(c) => set("isActive", c)}
						/>
						Publicar (exibir no carrossel)
					</label>
				</fieldset>

				<div className="flex justify-end gap-2">
					<Button onClick={() => router.back()} type="button" variant="ghost">
						Cancelar
					</Button>
					<Button disabled={pending} type="submit">
						{banner ? "Salvar" : "Criar banner"}
					</Button>
				</div>
			</div>

			<BannerLivePreview values={values} />
		</form>
	);
}
