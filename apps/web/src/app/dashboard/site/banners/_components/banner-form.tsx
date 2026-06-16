"use client";

import type { Banner } from "@emach/db/schema/banner";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Slider } from "@emach/ui/components/slider";
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
import { type BannerPreset, SLOT_FIELDS, type SlotKey } from "./banner-presets";
import { type BannerFormValues, bannerFormSchema } from "./banner-schema";
import { CountdownField } from "./countdown-field";
import { CtaVariantPicker } from "./cta-variant-picker";
import { ImageUploadTile } from "./image-upload-tile";
import { LayoutPicker } from "./layout-picker";
import { PresetCards } from "./preset-cards";
import { SlotSection } from "./slot-section";

const ALL_SLOTS: SlotKey[] = [
	"background",
	"product",
	"title",
	"badge",
	"countdown",
	"cta",
];

const EMPTY: BannerFormValues = {
	backgroundImageUrl: null,
	backgroundImageMobileUrl: null,
	productImageUrl: null,
	productImageMobileUrl: null,
	title: null,
	subtitle: null,
	altText: null,
	badgeText: null,
	ctaLabel: null,
	ctaHref: null,
	ctaVariant: "red",
	layout: "split",
	productScale: 100,
	ctaScale: 100,
	countdownTarget: null,
	isActive: false,
};

function initialValues(banner?: Banner): BannerFormValues {
	if (!banner) {
		return EMPTY;
	}
	return {
		backgroundImageUrl: banner.backgroundImageUrl,
		backgroundImageMobileUrl: banner.backgroundImageMobileUrl,
		productImageUrl: banner.productImageUrl,
		productImageMobileUrl: banner.productImageMobileUrl,
		title: banner.title,
		subtitle: banner.subtitle,
		altText: banner.altText,
		badgeText: banner.badgeText,
		ctaLabel: banner.ctaLabel,
		ctaHref: banner.ctaHref,
		ctaVariant: banner.ctaVariant,
		layout: banner.layout,
		productScale: banner.productScale,
		ctaScale: banner.ctaScale,
		countdownTarget: banner.countdownTarget,
		isActive: banner.isActive,
	};
}

function deriveSlots(v: BannerFormValues): Record<SlotKey, boolean> {
	return {
		background: v.backgroundImageUrl !== null,
		product: v.productImageUrl !== null,
		title: v.title !== null,
		badge: v.badgeText !== null,
		countdown: v.countdownTarget !== null,
		cta: v.ctaLabel !== null || v.ctaHref !== null,
	};
}

export function BannerForm({ banner }: { banner?: Banner }) {
	const router = useRouter();
	const [values, setValues] = useState<BannerFormValues>(() =>
		initialValues(banner)
	);
	const [slots, setSlots] = useState<Record<SlotKey, boolean>>(() =>
		deriveSlots(initialValues(banner))
	);
	const [presetKey, setPresetKey] = useState<string | null>(null);
	const [pending, startTransition] = useTransition();
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<BannerFormValues>();

	function set<K extends keyof BannerFormValues>(
		key: K,
		v: BannerFormValues[K]
	) {
		setValues((prev) => ({ ...prev, [key]: v }));
	}

	function toggleSlot(key: SlotKey, on: boolean) {
		setSlots((prev) => ({ ...prev, [key]: on }));
		if (!on) {
			setValues((prev) => {
				const next = { ...prev };
				for (const f of SLOT_FIELDS[key]) {
					Reflect.set(next, f, null);
				}
				return next;
			});
		}
		setPresetKey(null);
	}

	function applyPreset(preset: BannerPreset) {
		const enabled = new Set(preset.slots);
		setSlots(() => {
			const next = {} as Record<SlotKey, boolean>;
			for (const k of ALL_SLOTS) {
				next[k] = enabled.has(k);
			}
			return next;
		});
		setValues((prev) => {
			const next = { ...prev, layout: preset.layout };
			for (const k of ALL_SLOTS) {
				if (!enabled.has(k)) {
					for (const f of SLOT_FIELDS[k]) {
						Reflect.set(next, f, null);
					}
				}
			}
			return next;
		});
		setPresetKey(preset.key);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		clearErrors();
		const clean = { ...values };
		for (const key of ALL_SLOTS) {
			if (!slots[key]) {
				for (const f of SLOT_FIELDS[key]) {
					Reflect.set(clean, f, null);
				}
			}
		}
		const parsed = bannerFormSchema.safeParse(clean);
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
			<div className="flex flex-col gap-4">
				<div>
					<p className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Começar de um preset
					</p>
					<PresetCards onSelect={applyPreset} selectedKey={presetKey} />
				</div>

				<fieldset className="rounded-xl border border-border bg-card p-4">
					<legend className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wider">
						Disposição
					</legend>
					<LayoutPicker
						onChange={(l) => set("layout", l)}
						value={values.layout}
					/>
				</fieldset>

				<SlotSection
					enabled={slots.background}
					id="slot-background"
					onToggle={(on) => toggleSlot("background", on)}
					title="Fundo"
				>
					<div className="grid grid-cols-2 gap-3">
						<ImageUploadTile
							help="2560×1440 · 16:9 · WebP/JPG · ≤4MB"
							label="Fundo · desktop"
							maxBytes={4_194_304}
							onChange={(u) => set("backgroundImageUrl", u)}
							value={values.backgroundImageUrl}
						/>
						<ImageUploadTile
							help="1080×1920 · 9:16 · ≤2MB · cai pro desktop se vazio"
							label="Fundo · mobile"
							maxBytes={2_097_152}
							onChange={(u) => set("backgroundImageMobileUrl", u)}
							value={values.backgroundImageMobileUrl}
						/>
					</div>
					<div className="mt-3">
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
									onChange={(e) => set("altText", e.target.value || null)}
									placeholder="Ex: EMACH — Potência redefinida"
									value={values.altText ?? ""}
								/>
							)}
						</LabeledField>
					</div>
				</SlotSection>

				<SlotSection
					enabled={slots.product}
					id="slot-product"
					onToggle={(on) => toggleSlot("product", on)}
					title="Produto central"
				>
					<div className="grid grid-cols-2 gap-3">
						<ImageUploadTile
							help="~2400px · PNG transparente · ≤4MB"
							label="Produto · desktop"
							maxBytes={4_194_304}
							onChange={(u) => set("productImageUrl", u)}
							value={values.productImageUrl}
						/>
						<ImageUploadTile
							help="~1400px · PNG · ≤2MB · cai pro produto desktop se vazio"
							label="Produto · mobile"
							maxBytes={2_097_152}
							onChange={(u) => set("productImageMobileUrl", u)}
							value={values.productImageMobileUrl}
						/>
					</div>
					<div className="mt-3">
						<div className="mb-1.5 flex items-center justify-between text-muted-foreground text-xs">
							<span>Tamanho da ferramenta</span>
							<span className="text-foreground tabular-nums">
								{values.productScale}%
							</span>
						</div>
						<Slider
							max={160}
							min={50}
							onValueChange={(val) =>
								set("productScale", Array.isArray(val) ? val[0] : val)
							}
							step={5}
							value={[values.productScale]}
						/>
					</div>
				</SlotSection>

				<SlotSection
					enabled={slots.title}
					id="slot-title"
					onToggle={(on) => toggleSlot("title", on)}
					title="Título + descrição"
				>
					<div className="flex flex-col gap-3">
						<LabeledField
							error={errors.title}
							id="banner-title"
							label={`Título (${(values.title ?? "").length}/80)`}
						>
							{(f) => (
								<Input
									{...f}
									maxLength={80}
									onBlur={() => {
										if (values.backgroundImageUrl && !values.altText) {
											set("altText", values.title);
										}
									}}
									onChange={(e) => set("title", e.target.value || null)}
									placeholder="Ex: Potência redefinida"
									value={values.title ?? ""}
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
									placeholder="Ex: A nova linha que redefine o canteiro"
									value={values.subtitle ?? ""}
								/>
							)}
						</LabeledField>
					</div>
				</SlotSection>

				<SlotSection
					enabled={slots.badge}
					id="slot-badge"
					onToggle={(on) => toggleSlot("badge", on)}
					title="Badge / selo"
				>
					<LabeledField
						error={errors.badgeText}
						id="banner-badge"
						label={`Texto do selo (${(values.badgeText ?? "").length}/16)`}
					>
						{(f) => (
							<Input
								{...f}
								maxLength={16}
								onChange={(e) => set("badgeText", e.target.value || null)}
								placeholder="LANÇAMENTO"
								value={values.badgeText ?? ""}
							/>
						)}
					</LabeledField>
				</SlotSection>

				<SlotSection
					enabled={slots.countdown}
					id="slot-countdown"
					onToggle={(on) => toggleSlot("countdown", on)}
					title="Countdown"
				>
					<LabeledField
						error={errors.countdownTarget}
						help={
							<HelpTooltip text="Contador regressivo até esta data/hora no storefront." />
						}
						id="banner-countdown"
						label="Data/hora alvo"
					>
						{() => (
							<CountdownField
								ariaInvalid={Boolean(errors.countdownTarget)}
								onChange={(d) => set("countdownTarget", d)}
								value={values.countdownTarget}
							/>
						)}
					</LabeledField>
				</SlotSection>

				<SlotSection
					enabled={slots.cta}
					id="slot-cta"
					onToggle={(on) => toggleSlot("cta", on)}
					title="Botão (CTA)"
				>
					<div className="flex flex-col gap-3">
						<LabeledField
							error={errors.ctaLabel}
							id="banner-cta-label"
							label={`Rótulo (${(values.ctaLabel ?? "").length}/30)`}
						>
							{(f) => (
								<Input
									{...f}
									maxLength={30}
									onChange={(e) => set("ctaLabel", e.target.value || null)}
									placeholder="Ex: Ver Catálogo"
									value={values.ctaLabel ?? ""}
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
						>
							{(f) => (
								<Input
									{...f}
									onChange={(e) => set("ctaHref", e.target.value || null)}
									placeholder="/catalog"
									value={values.ctaHref ?? ""}
								/>
							)}
						</LabeledField>
						<div>
							<p className="mb-1.5 text-muted-foreground text-xs">
								Variante de cor
							</p>
							<CtaVariantPicker
								onChange={(v) => set("ctaVariant", v)}
								value={values.ctaVariant}
							/>
						</div>
					</div>
					<div className="mt-3">
						<div className="mb-1.5 flex items-center justify-between text-muted-foreground text-xs">
							<span>Tamanho do botão</span>
							<span className="text-foreground tabular-nums">
								{values.ctaScale}%
							</span>
						</div>
						<Slider
							max={140}
							min={80}
							onValueChange={(val) =>
								set("ctaScale", Array.isArray(val) ? val[0] : val)
							}
							step={5}
							value={[values.ctaScale]}
						/>
					</div>
				</SlotSection>

				<FieldError>{errors._form}</FieldError>

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

			<BannerLivePreview slots={slots} values={values} />
		</form>
	);
}
