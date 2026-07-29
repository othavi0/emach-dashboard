"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Slider } from "@emach/ui/components/slider";
import { cn } from "@emach/ui/lib/utils";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { FieldError } from "@/components/field-error";
import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import type { BannerBgMobileMode, BannerFormValues } from "../banner-schema";
import {
	type BackgroundConfig,
	type ElementKey,
	type ElementPlacement,
	type MobileOverride,
	SCALE_BOUNDS,
	TEXT_KEYS,
} from "../composition/composition-schema";
import { CountdownField } from "../countdown-field";
import { CtaVariantPicker } from "../cta-variant-picker";
import { ImageUploadTile } from "../image-upload-tile";
import { SpecsEditor } from "../specs-editor";
import { AnchorPicker } from "./anchor-picker";
import {
	type EditorAction,
	type EditorState,
	FALLBACK_PLACEMENT,
} from "./editor-reducer";
import { ELEMENT_LABELS } from "./element-rail";

const TEXT_KEY_SET = new Set<ElementKey>(TEXT_KEYS);

const BG_MOBILE_MODE_OPTIONS: {
	value: BannerBgMobileMode;
	label: string;
	hint: string;
}[] = [
	{
		value: "inherit",
		label: "Herdar desktop",
		hint: "Usa a imagem de fundo do desktop também no mobile.",
	},
	{
		value: "custom",
		label: "Imagem própria",
		hint: "Envie uma imagem 9:16 dedicada ao mobile.",
	},
	{
		value: "none",
		label: "Sem fundo",
		hint: "Mobile sem imagem — só o gradiente da marca.",
	},
];

function sliderValue(val: number | readonly number[]): number {
	return Array.isArray(val) ? (val[0] ?? 0) : (val as number);
}

function SectionHeading({ children }: { children: ReactNode }) {
	return (
		<h3 className="font-semibold text-sm uppercase tracking-wider">
			{children}
		</h3>
	);
}

function SliderField({
	label,
	min,
	max,
	step,
	value,
	onChange,
	suffix = "",
}: {
	label: string;
	min: number;
	max: number;
	step: number;
	value: number;
	onChange: (v: number) => void;
	suffix?: string;
}) {
	return (
		<div>
			<div className="mb-1.5 flex items-center justify-between text-muted-foreground text-xs">
				<span>{label}</span>
				<span className="text-foreground tabular-nums">
					{value}
					{suffix}
				</span>
			</div>
			<Slider
				max={max}
				min={min}
				onValueChange={(val) => onChange(sliderValue(val))}
				step={step}
				value={[value]}
			/>
		</div>
	);
}

function PlacementControls({
	elementKey,
	placement,
	onChange,
}: {
	elementKey: ElementKey;
	placement: ElementPlacement;
	onChange: (next: ElementPlacement) => void;
}) {
	const bounds = SCALE_BOUNDS[elementKey];
	const isText = TEXT_KEY_SET.has(elementKey);
	return (
		<div className="flex flex-col gap-4">
			<div>
				<p className="mb-1.5 text-muted-foreground text-xs">Posição</p>
				<AnchorPicker
					onChange={(anchor) => onChange({ ...placement, anchor })}
					value={placement.anchor}
				/>
			</div>
			<SliderField
				label="Deslocamento horizontal"
				max={20}
				min={-20}
				onChange={(v) => onChange({ ...placement, offsetX: v })}
				step={1}
				value={placement.offsetX}
			/>
			<SliderField
				label="Deslocamento vertical"
				max={20}
				min={-20}
				onChange={(v) => onChange({ ...placement, offsetY: v })}
				step={1}
				value={placement.offsetY}
			/>
			<SliderField
				label="Escala"
				max={bounds[1]}
				min={bounds[0]}
				onChange={(v) => onChange({ ...placement, scale: v })}
				step={5}
				suffix="%"
				value={placement.scale}
			/>
			{isText && (
				<SliderField
					label="Largura máxima"
					max={80}
					min={12}
					onChange={(v) => onChange({ ...placement, maxWidth: v })}
					step={1}
					suffix="ch"
					value={placement.maxWidth ?? 44}
				/>
			)}
		</div>
	);
}

function ContentFields({
	elementKey,
	state,
	dispatch,
	errors,
}: {
	elementKey: ElementKey;
	state: EditorState;
	dispatch: (a: EditorAction) => void;
	errors: Record<string, string>;
}) {
	const { content } = state;
	function setContent(patch: Partial<BannerFormValues>) {
		dispatch({ type: "setContent", patch });
	}

	switch (elementKey) {
		case "badge":
			return (
				<LabeledField
					error={errors.badgeText}
					id="inspector-badge-text"
					label={`Texto do selo (${(content.badgeText ?? "").length}/16)`}
				>
					{(f) => (
						<Input
							{...f}
							maxLength={16}
							onChange={(e) =>
								setContent({ badgeText: e.target.value || null })
							}
							placeholder="LANÇAMENTO"
							value={content.badgeText ?? ""}
						/>
					)}
				</LabeledField>
			);
		case "title":
			return (
				<LabeledField
					error={errors.title}
					id="inspector-title"
					label={`Título (${(content.title ?? "").length}/80)`}
				>
					{(f) => (
						<Input
							{...f}
							maxLength={80}
							onBlur={() => {
								if (content.backgroundImageUrl && !content.altText) {
									setContent({ altText: content.title });
								}
							}}
							onChange={(e) => setContent({ title: e.target.value || null })}
							placeholder="Ex: Potência redefinida"
							value={content.title ?? ""}
						/>
					)}
				</LabeledField>
			);
		case "subtitle":
			return (
				<LabeledField
					error={errors.subtitle}
					id="inspector-subtitle"
					label={`Descrição (${(content.subtitle ?? "").length}/140)`}
				>
					{(f) => (
						<Input
							{...f}
							maxLength={140}
							onChange={(e) => setContent({ subtitle: e.target.value || null })}
							placeholder="Ex: A nova linha que redefine o canteiro"
							value={content.subtitle ?? ""}
						/>
					)}
				</LabeledField>
			);
		case "specs":
			return (
				<div className="flex flex-col gap-1.5">
					<p className="font-medium text-xs">Ficha técnica</p>
					<SpecsEditor
						onChange={(next) => setContent({ specs: next })}
						value={content.specs}
					/>
					<FieldError>{errors.specs}</FieldError>
				</div>
			);
		case "countdown":
			return (
				<LabeledField
					error={errors.countdownTarget}
					help={
						<HelpTooltip text="Contador regressivo até esta data/hora no storefront." />
					}
					id="inspector-countdown"
					label="Data/hora alvo"
				>
					{() => (
						<CountdownField
							ariaInvalid={Boolean(errors.countdownTarget)}
							onChange={(d) => setContent({ countdownTarget: d })}
							value={content.countdownTarget}
						/>
					)}
				</LabeledField>
			);
		case "product":
			return (
				<div className="grid grid-cols-2 gap-3">
					<ImageUploadTile
						help="~2400px · PNG transparente · ≤4MB"
						label="Produto · desktop"
						maxBytes={4_194_304}
						onChange={(u) => setContent({ productImageUrl: u })}
						value={content.productImageUrl}
					/>
					<ImageUploadTile
						help="~1400px · PNG · ≤2MB · cai pro produto desktop se vazio"
						label="Produto · mobile"
						maxBytes={2_097_152}
						onChange={(u) => setContent({ productImageMobileUrl: u })}
						value={content.productImageMobileUrl}
					/>
				</div>
			);
		case "cta":
			return (
				<div className="flex flex-col gap-3">
					<LabeledField
						error={errors.ctaLabel}
						id="inspector-cta-label"
						label={`Rótulo (${(content.ctaLabel ?? "").length}/30)`}
					>
						{(f) => (
							<Input
								{...f}
								maxLength={30}
								onChange={(e) =>
									setContent({ ctaLabel: e.target.value || null })
								}
								placeholder="Ex: Ver Catálogo"
								value={content.ctaLabel ?? ""}
							/>
						)}
					</LabeledField>
					<LabeledField
						error={errors.ctaHref}
						help={
							<HelpTooltip text="Rota interna (/catalog) ou URL externa (https://...)." />
						}
						id="inspector-cta-href"
						label="Link"
					>
						{(f) => (
							<Input
								{...f}
								onChange={(e) =>
									setContent({ ctaHref: e.target.value || null })
								}
								placeholder="/catalog"
								value={content.ctaHref ?? ""}
							/>
						)}
					</LabeledField>
					<div>
						<p className="mb-1.5 text-muted-foreground text-xs">
							Variante de cor
						</p>
						<CtaVariantPicker
							onChange={(v) => setContent({ ctaVariant: v })}
							value={content.ctaVariant}
						/>
					</div>
				</div>
			);
		default:
			return null;
	}
}

// Recorta o override mobile pra ElementPlacement quando não é `{hidden:true}`
// — narrowing isolado numa função pra evitar checagem redundante nos callers.
function asPlacementOverride(
	entry: MobileOverride | undefined
): ElementPlacement | null {
	if (entry === undefined || "hidden" in entry) {
		return null;
	}
	return entry;
}

function ElementInspector({
	elementKey,
	state,
	dispatch,
	errors,
}: {
	elementKey: ElementKey;
	state: EditorState;
	dispatch: (a: EditorAction) => void;
	errors: Record<string, string>;
}) {
	const label = ELEMENT_LABELS[elementKey];
	const desktopPlacement = Reflect.get(
		state.composition.desktop.elements,
		elementKey
	) as ElementPlacement | undefined;

	// Elemento desligado (sem placement no desktop): não renderiza os
	// controles de posição/conteúdo — mexer num slider não pode habilitar o
	// elemento por efeito colateral. Ligar é sempre explícito, mesma action
	// do Switch do rail.
	if (desktopPlacement === undefined) {
		return (
			<div className="flex flex-col gap-3">
				<SectionHeading>{label}</SectionHeading>
				<div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
					<p className="flex items-start gap-1.5 text-muted-foreground text-xs">
						<TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
						Elemento desligado.
					</p>
					<Button
						className="self-start"
						onClick={() =>
							dispatch({
								type: "toggleElement",
								enabled: true,
								key: elementKey,
							})
						}
						size="sm"
						type="button"
						variant="outline"
					>
						Ligar elemento
					</Button>
				</div>
			</div>
		);
	}

	if (state.viewport === "desktop") {
		return (
			<div className="flex flex-col gap-5">
				<SectionHeading>{label}</SectionHeading>
				<PlacementControls
					elementKey={elementKey}
					onChange={(next) =>
						dispatch({ type: "setPlacement", key: elementKey, placement: next })
					}
					placement={desktopPlacement}
				/>
				<ContentFields
					dispatch={dispatch}
					elementKey={elementKey}
					errors={errors}
					state={state}
				/>
			</div>
		);
	}

	const mobileEntry = Reflect.get(
		state.composition.mobile.elements,
		elementKey
	) as MobileOverride | undefined;
	const override = asPlacementOverride(mobileEntry);
	const hidden = mobileEntry !== undefined && override === null;

	return (
		<div className="flex flex-col gap-5">
			<SectionHeading>{label}</SectionHeading>
			{override === null && (
				<div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
					<p className="flex items-start gap-1.5 text-muted-foreground text-xs">
						<TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
						{hidden
							? "Este elemento está oculto no mobile."
							: "Herdando a pilha segura — arraste no canvas ou clique em Personalizar."}
					</p>
					<div className="flex gap-2">
						{hidden ? (
							<Button
								onClick={() =>
									dispatch({
										type: "setMobileOverride",
										key: elementKey,
										override: null,
									})
								}
								size="sm"
								type="button"
								variant="outline"
							>
								Restaurar herança
							</Button>
						) : (
							<>
								<Button
									onClick={() =>
										dispatch({
											type: "setMobileOverride",
											key: elementKey,
											override: FALLBACK_PLACEMENT,
										})
									}
									size="sm"
									type="button"
									variant="outline"
								>
									Personalizar
								</Button>
								<Button
									onClick={() =>
										dispatch({
											type: "setMobileOverride",
											key: elementKey,
											override: { hidden: true },
										})
									}
									size="sm"
									type="button"
									variant="ghost"
								>
									Ocultar no mobile
								</Button>
							</>
						)}
					</div>
				</div>
			)}
			{override !== null && (
				<PlacementControls
					elementKey={elementKey}
					onChange={(next) =>
						dispatch({ type: "setPlacement", key: elementKey, placement: next })
					}
					placement={override}
				/>
			)}
			<ContentFields
				dispatch={dispatch}
				elementKey={elementKey}
				errors={errors}
				state={state}
			/>
		</div>
	);
}

function BackgroundInspector({
	state,
	dispatch,
	errors,
}: {
	state: EditorState;
	dispatch: (a: EditorAction) => void;
	errors: Record<string, string>;
}) {
	const { content, composition, viewport } = state;
	const bgConfig =
		viewport === "mobile"
			? (composition.mobile.background ?? composition.desktop.background)
			: composition.desktop.background;

	function setContent(patch: Partial<BannerFormValues>) {
		dispatch({ type: "setContent", patch });
	}

	function setBackground(patch: Partial<BackgroundConfig>) {
		dispatch({ type: "setBackground", config: { ...bgConfig, ...patch } });
	}

	return (
		<div className="flex flex-col gap-4">
			<SectionHeading>Fundo</SectionHeading>
			<div className="grid grid-cols-2 gap-3">
				<ImageUploadTile
					help="2560×1440 · 16:9 · WebP/JPG · ≤4MB"
					label="Fundo · desktop"
					maxBytes={4_194_304}
					onChange={(u) => setContent({ backgroundImageUrl: u })}
					value={content.backgroundImageUrl}
				/>
				{content.backgroundMobileMode === "custom" && (
					<ImageUploadTile
						help="1080×1920 · 9:16 · ≤2MB · cai pro desktop se vazio"
						label="Fundo · mobile"
						maxBytes={2_097_152}
						onChange={(u) => setContent({ backgroundImageMobileUrl: u })}
						value={content.backgroundImageMobileUrl}
					/>
				)}
			</div>
			<FieldError>{errors.backgroundImageMobileUrl}</FieldError>

			<div>
				<p className="mb-1.5 text-muted-foreground text-xs">Fundo no mobile</p>
				<div className="grid grid-cols-3 gap-2">
					{BG_MOBILE_MODE_OPTIONS.map((opt) => (
						<button
							className={cn(
								"rounded-lg border p-2 text-center text-xs transition-colors",
								content.backgroundMobileMode === opt.value
									? "border-primary bg-primary/5 text-foreground"
									: "border-border bg-card text-muted-foreground hover:border-border/60"
							)}
							key={opt.value}
							onClick={() =>
								setContent({
									backgroundMobileMode: opt.value,
									backgroundImageMobileUrl:
										opt.value === "custom"
											? content.backgroundImageMobileUrl
											: null,
								})
							}
							type="button"
						>
							{opt.label}
						</button>
					))}
				</div>
				<p className="mt-1.5 text-[11px] text-muted-foreground">
					{
						BG_MOBILE_MODE_OPTIONS.find(
							(o) => o.value === content.backgroundMobileMode
						)?.hint
					}
				</p>
				{content.backgroundMobileMode === "inherit" && (
					<p className="mt-1.5 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-500">
						<TriangleAlert className="mt-0.5 size-3 shrink-0" />
						Artes widescreen são cortadas no mobile — prefira "Sem fundo" ou
						"Imagem própria".
					</p>
				)}
			</div>

			<SliderField
				label="Zoom"
				max={200}
				min={100}
				onChange={(v) => setBackground({ zoom: v })}
				step={5}
				suffix="%"
				value={bgConfig.zoom}
			/>

			<div>
				<p className="mb-1.5 text-muted-foreground text-xs">Ponto focal</p>
				<AnchorPicker
					onChange={(focal) => setBackground({ focal })}
					value={bgConfig.focal}
				/>
			</div>

			<LabeledField
				error={errors.altText}
				help={
					<HelpTooltip text="Descreve a imagem de fundo para leitores de tela." />
				}
				id="inspector-alt-text"
				label="Texto alternativo (alt)"
				required
			>
				{(f) => (
					<Input
						{...f}
						onChange={(e) => setContent({ altText: e.target.value || null })}
						placeholder="Ex: EMACH — Potência redefinida"
						value={content.altText ?? ""}
					/>
				)}
			</LabeledField>
		</div>
	);
}

export function Inspector({
	state,
	dispatch,
	errors,
}: {
	state: EditorState;
	dispatch: (a: EditorAction) => void;
	errors: Record<string, string>;
}) {
	if (state.selected === null) {
		return (
			<div className="flex h-full items-center justify-center rounded-xl border border-border border-dashed bg-card p-6 text-center">
				<p className="text-muted-foreground text-sm">
					Selecione um elemento no canvas ou no painel esquerdo.
				</p>
			</div>
		);
	}

	if (state.selected === "background") {
		return (
			<div className="rounded-xl border border-border bg-card p-4">
				<BackgroundInspector
					dispatch={dispatch}
					errors={errors}
					state={state}
				/>
			</div>
		);
	}

	return (
		<div className="rounded-xl border border-border bg-card p-4">
			<ElementInspector
				dispatch={dispatch}
				elementKey={state.selected}
				errors={errors}
				state={state}
			/>
		</div>
	);
}
