import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@emach/ui/components/alert";
import {
	Avatar,
	AvatarFallback,
	AvatarGroup,
	AvatarImage,
} from "@emach/ui/components/avatar";
import { Badge } from "@emach/ui/components/badge";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@emach/ui/components/breadcrumb";
import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Checkbox } from "@emach/ui/components/checkbox";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { Input } from "@emach/ui/components/input";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@emach/ui/components/item";
import { Kbd, KbdGroup } from "@emach/ui/components/kbd";
import { Label } from "@emach/ui/components/label";
import { Progress, ProgressLabel } from "@emach/ui/components/progress";
import { RadioGroup, RadioGroupItem } from "@emach/ui/components/radio-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Separator } from "@emach/ui/components/separator";
import { Skeleton } from "@emach/ui/components/skeleton";
import { Slider } from "@emach/ui/components/slider";
import { Spinner } from "@emach/ui/components/spinner";
import { Switch } from "@emach/ui/components/switch";
import {
	Table,
	TableActionsCell,
	TableActionsHead,
	TableBody,
	TableCaption,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import { Textarea } from "@emach/ui/components/textarea";
import {
	AlertCircleIcon,
	BoxIcon,
	Eye,
	MailIcon,
	Pencil,
	Trash2,
} from "lucide-react";
import {
	AccordionShowcase,
	DialogShowcase,
	DropdownShowcase,
	PopoverShowcase,
	ToastTriggers,
	TooltipShowcase,
} from "./_components/interactive";
import { Section, Showcase, Swatch } from "./_components/section";

const tableOfContents: { id: string; title: string }[] = [
	{ id: "tipografia", title: "Tipografia" },
	{ id: "paleta", title: "Paleta" },
	{ id: "buttons", title: "Buttons" },
	{ id: "badges", title: "Badges" },
	{ id: "form", title: "Inputs & Form" },
	{ id: "controls", title: "Checkbox / Radio / Switch" },
	{ id: "range", title: "Slider & Progress" },
	{ id: "avatar", title: "Avatar" },
	{ id: "card", title: "Card" },
	{ id: "alert", title: "Alert" },
	{ id: "overlays", title: "Overlays" },
	{ id: "menu", title: "Dropdown Menu" },
	{ id: "tabs", title: "Tabs" },
	{ id: "accordion", title: "Accordion" },
	{ id: "table", title: "Table" },
	{ id: "nav", title: "Navegação" },
	{ id: "feedback", title: "Feedback" },
	{ id: "empty", title: "Empty & Item" },
	{ id: "toast", title: "Toast (Sonner)" },
];

export default function DesignPage() {
	return (
		<main className="min-h-svh bg-background px-6 py-12 md:px-12">
			<div className="mx-auto max-w-5xl">
				<header className="mb-12">
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						/design
					</p>
					<h1 className="mt-2 font-medium font-sans text-5xl leading-[1.1] tracking-tight">
						Design system — emach
					</h1>
					<p className="mt-3 max-w-2xl text-muted-foreground text-sm leading-relaxed">
						Galeria de referência dos componentes disponíveis em{" "}
						<code className="font-mono text-xs">@emach/ui/components/*</code>.
						Sistema próprio: industrial dark warm + 6 roles cromáticas
						distintas. Tokens em{" "}
						<code className="font-mono text-xs">
							packages/ui/src/styles/globals.css
						</code>
						.
					</p>
				</header>

				<nav className="mb-12 bg-card p-4 ring-1 ring-foreground/10">
					<p className="mb-3 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Conteúdo
					</p>
					<ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
						{tableOfContents.map((item) => (
							<li key={item.id}>
								<a
									className="text-muted-foreground transition-colors hover:text-foreground"
									href={`#${item.id}`}
								>
									{item.title}
								</a>
							</li>
						))}
					</ul>
				</nav>

				<Section
					description="Inter sans no chrome do dashboard — hierarquia por peso e case, não por família. Cormorant Garamond serif: uso restrito (login, capa de relatório)."
					id="tipografia"
					title="Tipografia"
				>
					<Showcase label="Sans (chrome)">
						<div className="flex w-full flex-col gap-3">
							<p className="font-medium text-3xl tracking-tight">
								Display 30px / 500
							</p>
							<p className="font-medium text-2xl tracking-tight">
								h1 24px / 500
							</p>
							<p className="font-medium text-lg tracking-tight">
								h2 18px / 500
							</p>
							<p className="font-semibold text-sm uppercase tracking-wider">
								h3 14px caps · section marker
							</p>
							<p className="font-medium text-base">
								Title prominent 16px — card titles em listas
							</p>
							<p className="text-sm leading-relaxed">
								Body 14px / 1.625 — baseline do dashboard. Equipe lê tudo.
							</p>
							<p className="text-muted-foreground text-xs">
								Caption 12px — metadata, helpers, footers de tabela.
							</p>
							<p className="font-mono text-xs">
								Mono 12px — SKU, IDs, atalhos, valores literais.
							</p>
						</div>
					</Showcase>
					<Showcase label="Serif (uso restrito)">
						<div className="flex w-full flex-col gap-3">
							<p className="font-medium font-serif text-3xl leading-tight">
								Cormorant 30px — login hero
							</p>
							<p className="font-serif text-base leading-relaxed">
								Body serif 16px / 1.60 — capa de relatório impresso, momento
								editorial discreto. Nunca no chrome do dashboard.
							</p>
						</div>
					</Showcase>
				</Section>

				<Section
					description="Industrial neutrals warm (chroma 70°) + 6 roles cromáticas distintas (≥20° de hue entre vizinhas). Cada role reconhecível à distância."
					id="paleta"
					title="Paleta"
				>
					<div className="mb-3 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Surfaces (escuro → claro)
					</div>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
						<Swatch className="bg-sidebar" hex="#171612" name="sidebar" />
						<Swatch className="bg-background" hex="#1d1b18" name="background" />
						<Swatch className="bg-muted" hex="#221f1c" name="muted" />
						<Swatch
							className="bg-card"
							hex="#262320"
							name="card / popover / accent"
						/>
						<Swatch className="bg-border" hex="#4a4641" name="border" />
						<Swatch className="bg-input" hex="#57524c" name="input" />
						<Swatch className="bg-secondary" hex="#5c554d" name="secondary" />
						<Swatch className="bg-foreground" hex="#fefefe" name="foreground" />
					</div>

					<div className="mt-6 mb-3 font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Roles cromáticos (6 distintos por hue)
					</div>
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
						<Swatch
							className="bg-primary"
							hex="#cc785c"
							name="primary · coral · 38°"
						/>
						<Swatch
							className="bg-destructive"
							hex="#c24a40"
							name="destructive · red · 15°"
						/>
						<Swatch
							className="bg-warning"
							hex="#cfa845"
							name="warning · mustard · 85°"
						/>
						<Swatch
							className="bg-info"
							hex="#5da8ac"
							name="info · teal · 200°"
						/>
						<Swatch
							className="bg-success"
							hex="#3fa580"
							name="success · jade · 155°"
						/>
						<Swatch
							className="bg-secondary"
							hex="#5c554d"
							name="secondary · graphite · 70°"
						/>
					</div>
				</Section>

				<Section
					description="9 variants × 6 tamanhos. CTA primário = default (coral). Cada role saturada (destructive/warning/info/success) traz focus ring na própria cor."
					id="buttons"
					title="Buttons"
				>
					<Showcase label="variants">
						<Button>default</Button>
						<Button variant="secondary">secondary</Button>
						<Button variant="outline">outline</Button>
						<Button variant="ghost">ghost</Button>
						<Button variant="destructive">destructive</Button>
						<Button variant="warning">warning</Button>
						<Button variant="info">info</Button>
						<Button variant="success">success</Button>
						<Button variant="link">link</Button>
					</Showcase>
					<Showcase label="sizes">
						<Button size="xs">xs</Button>
						<Button size="sm">sm</Button>
						<Button>default</Button>
						<Button size="lg">lg</Button>
						<Button aria-label="settings" size="icon">
							<MailIcon />
						</Button>
					</Showcase>
					<Showcase label="states">
						<Button>normal</Button>
						<Button disabled>disabled</Button>
						<Button>
							<Spinner /> loading
						</Button>
					</Showcase>
				</Section>

				<Section
					description="Mesmo conjunto de roles do Button. Status sempre = ícone + label + cor (color-blind safe)."
					id="badges"
					title="Badges"
				>
					<Showcase label="variants">
						<Badge>default</Badge>
						<Badge variant="secondary">secondary</Badge>
						<Badge variant="outline">outline</Badge>
						<Badge variant="destructive">destructive</Badge>
						<Badge variant="warning">warning</Badge>
						<Badge variant="info">info</Badge>
						<Badge variant="success">success</Badge>
						<Badge variant="ghost">ghost</Badge>
					</Showcase>
					<Showcase label="status com ícone (recomendado)">
						<Badge variant="warning">
							<AlertCircleIcon />
							Estoque baixo
						</Badge>
						<Badge variant="success">
							<BoxIcon />
							Entregue
						</Badge>
						<Badge variant="info">
							<MailIcon />
							Aguardando NF
						</Badge>
						<Badge variant="destructive">
							<AlertCircleIcon />
							Cancelado
						</Badge>
					</Showcase>
				</Section>

				<Section
					description="Inputs base, textarea, select e label."
					id="form"
					title="Inputs & Form"
				>
					<Showcase label="input">
						<div className="flex w-full max-w-sm flex-col gap-2">
							<Label htmlFor="ds-email">Email</Label>
							<Input
								id="ds-email"
								placeholder="cliente@emach.com.br"
								type="email"
							/>
						</div>
						<div className="flex w-full max-w-sm flex-col gap-2">
							<Label htmlFor="ds-disabled">Disabled</Label>
							<Input disabled id="ds-disabled" placeholder="readonly" />
						</div>
						<div className="flex w-full max-w-sm flex-col gap-2">
							<Label htmlFor="ds-invalid">Invalid</Label>
							<Input
								aria-invalid
								defaultValue="123"
								id="ds-invalid"
								placeholder="cep"
							/>
						</div>
					</Showcase>
					<Showcase label="textarea">
						<div className="flex w-full flex-col gap-2">
							<Label htmlFor="ds-textarea">Notas internas</Label>
							<Textarea
								id="ds-textarea"
								placeholder="Observações sobre o pedido..."
							/>
						</div>
					</Showcase>
					<Showcase label="select">
						<div className="flex w-full max-w-sm flex-col gap-2">
							<Label>Status</Label>
							<Select defaultValue="active">
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="draft">Rascunho</SelectItem>
										<SelectItem value="active">Ativo</SelectItem>
										<SelectItem value="archived">Arquivado</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
					</Showcase>
				</Section>

				<Section id="controls" title="Checkbox / Radio / Switch">
					<Showcase label="checkbox">
						<div className="flex flex-col gap-3">
							<Label>
								<Checkbox defaultChecked /> Visível no site
							</Label>
							<Label>
								<Checkbox /> Permitir backorder
							</Label>
							<Label>
								<Checkbox disabled /> Disabled
							</Label>
						</div>
					</Showcase>
					<Showcase label="radio">
						<RadioGroup defaultValue="127">
							<Label>
								<RadioGroupItem value="127" /> 127V
							</Label>
							<Label>
								<RadioGroupItem value="220" /> 220V
							</Label>
							<Label>
								<RadioGroupItem value="bivolt" /> Bivolt
							</Label>
						</RadioGroup>
					</Showcase>
					<Showcase label="switch">
						<div className="flex flex-col gap-3">
							<Label>
								<Switch defaultChecked /> Promoção ativa
							</Label>
							<Label>
								<Switch size="sm" /> Notificar estoque baixo (sm)
							</Label>
						</div>
					</Showcase>
				</Section>

				<Section id="range" title="Slider & Progress">
					<Showcase label="slider">
						<div className="w-full max-w-md">
							<Slider defaultValue={[40]} max={100} />
						</div>
					</Showcase>
					<Showcase label="progress">
						<div className="flex w-full max-w-md flex-col gap-3">
							<Progress value={32}>
								<ProgressLabel>Importação CSV — 32%</ProgressLabel>
							</Progress>
							<Progress value={75}>
								<ProgressLabel>Sincronizando catálogo — 75%</ProgressLabel>
							</Progress>
						</div>
					</Showcase>
				</Section>

				<Section id="avatar" title="Avatar">
					<Showcase label="single">
						<Avatar size="sm">
							<AvatarFallback>OQ</AvatarFallback>
						</Avatar>
						<Avatar>
							<AvatarFallback>OQ</AvatarFallback>
						</Avatar>
						<Avatar size="lg">
							<AvatarImage
								alt="placeholder"
								src="https://i.pravatar.cc/80?img=12"
							/>
							<AvatarFallback>OQ</AvatarFallback>
						</Avatar>
					</Showcase>
					<Showcase label="group">
						<AvatarGroup>
							<Avatar>
								<AvatarFallback>JS</AvatarFallback>
							</Avatar>
							<Avatar>
								<AvatarFallback>MA</AvatarFallback>
							</Avatar>
							<Avatar>
								<AvatarFallback>RP</AvatarFallback>
							</Avatar>
						</AvatarGroup>
					</Showcase>
				</Section>

				<Section id="card" title="Card">
					<div className="grid gap-4 md:grid-cols-2">
						<Card>
							<CardHeader>
								<CardTitle>Furadeira de impacto 1/2"</CardTitle>
								<CardDescription>SKU FUR-127-001</CardDescription>
							</CardHeader>
							<CardContent>
								<p className="text-xs/relaxed">
									Estoque atual em 3 filiais · ponto de pedido em 12 unidades.
								</p>
							</CardContent>
							<CardFooter>
								<Button size="sm">Editar</Button>
							</CardFooter>
						</Card>
						<Card size="sm">
							<CardHeader>
								<CardTitle>Card compacto (size=sm)</CardTitle>
								<CardDescription>
									Espaçamento reduzido para listas densas.
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="flex gap-2">
									<Badge>novo</Badge>
									<Badge variant="secondary">promo</Badge>
								</div>
							</CardContent>
						</Card>
					</div>
				</Section>

				<Section
					description="bg-card sempre — texto carrega cor da role. Mantém legibilidade em dark sem fill saturado dominante."
					id="alert"
					title="Alert"
				>
					<Showcase label="default">
						<Alert>
							<BoxIcon />
							<AlertTitle>Sincronização concluída</AlertTitle>
							<AlertDescription>
								102 produtos atualizados a partir do CSV de fornecedor.
							</AlertDescription>
						</Alert>
					</Showcase>
					<Showcase label="info">
						<Alert variant="info">
							<MailIcon />
							<AlertTitle>Aguardando emissão de NF</AlertTitle>
							<AlertDescription>
								Pedido pago. NF será emitida no próximo lote.
							</AlertDescription>
						</Alert>
					</Showcase>
					<Showcase label="success">
						<Alert variant="success">
							<BoxIcon />
							<AlertTitle>Estoque atualizado</AlertTitle>
							<AlertDescription>
								Movimento de 24 unidades registrado em FIL-SP.
							</AlertDescription>
						</Alert>
					</Showcase>
					<Showcase label="warning">
						<Alert variant="warning">
							<AlertCircleIcon />
							<AlertTitle>Estoque abaixo do reorder</AlertTitle>
							<AlertDescription>
								12 ferramentas em ponto de pedido. Acionar fornecedor.
							</AlertDescription>
						</Alert>
					</Showcase>
					<Showcase label="destructive">
						<Alert variant="destructive">
							<AlertCircleIcon />
							<AlertTitle>Falha ao salvar</AlertTitle>
							<AlertDescription>
								CPF informado já está cadastrado para outro cliente.
							</AlertDescription>
						</Alert>
					</Showcase>
				</Section>

				<Section
					description="Componentes que abrem em overlay (precisam de client island)."
					id="overlays"
					title="Dialog · Popover · Tooltip"
				>
					<Showcase label="dialog">
						<DialogShowcase />
					</Showcase>
					<Showcase label="popover">
						<PopoverShowcase />
					</Showcase>
					<Showcase label="tooltip">
						<TooltipShowcase />
					</Showcase>
				</Section>

				<Section id="menu" title="Dropdown menu">
					<Showcase label="actions menu">
						<DropdownShowcase />
					</Showcase>
				</Section>

				<Section
					description='2 variants × 2 orientations × scrollable opcional. variant="default" = pill group em bg-accent; variant="line" = underline minimal. Use default em filtros e segmentação primária; line em sub-navegação dentro de página de detalhe. Contagem inline ("Ativos · 12") preferida a Badge — Badge só quando contagem é alerta (pendentes > 0).'
					id="tabs"
					title="Tabs"
				>
					<Showcase label='variant="default" (pill group, padrão)'>
						<Tabs className="w-full" defaultValue="resumo">
							<TabsList>
								<TabsTrigger value="resumo">Resumo</TabsTrigger>
								<TabsTrigger value="estoque">Estoque</TabsTrigger>
								<TabsTrigger value="historico">Histórico</TabsTrigger>
							</TabsList>
							<TabsContent value="resumo">
								<p className="pt-3 text-muted-foreground text-xs/relaxed">
									Visão geral do produto.
								</p>
							</TabsContent>
							<TabsContent value="estoque">
								<p className="pt-3 text-muted-foreground text-xs/relaxed">
									Saldo por filial.
								</p>
							</TabsContent>
							<TabsContent value="historico">
								<p className="pt-3 text-muted-foreground text-xs/relaxed">
									Movimentações recentes.
								</p>
							</TabsContent>
						</Tabs>
					</Showcase>

					<Showcase label='variant="line" (underline, sub-navegação)'>
						<Tabs className="w-full" defaultValue="perfil">
							<TabsList variant="line">
								<TabsTrigger value="perfil">Perfil</TabsTrigger>
								<TabsTrigger value="enderecos">Endereços</TabsTrigger>
								<TabsTrigger value="pedidos">Pedidos</TabsTrigger>
								<TabsTrigger value="reviews">Reviews</TabsTrigger>
							</TabsList>
							<TabsContent value="perfil">
								<p className="pt-3 text-muted-foreground text-xs/relaxed">
									Dados pessoais e contato.
								</p>
							</TabsContent>
						</Tabs>
					</Showcase>

					<Showcase label="contagem inline (preferida)">
						<Tabs className="w-full" defaultValue="active">
							<TabsList>
								<TabsTrigger value="active">Ativos · 24</TabsTrigger>
								<TabsTrigger value="pending">Pendentes · 3</TabsTrigger>
								<TabsTrigger value="suspended">Suspensos · 1</TabsTrigger>
							</TabsList>
						</Tabs>
					</Showcase>

					<Showcase label="badge de alerta (só quando contagem > 0 importa)">
						<Tabs className="w-full" defaultValue="todos">
							<TabsList>
								<TabsTrigger value="todos">Todos</TabsTrigger>
								<TabsTrigger value="pendentes">
									Pendentes
									<Badge className="ml-1.5" variant="warning">
										5
									</Badge>
								</TabsTrigger>
								<TabsTrigger value="aprovados">Aprovados</TabsTrigger>
							</TabsList>
						</Tabs>
					</Showcase>

					<Showcase label="scrollable (muitas abas, overflow horizontal com fade)">
						<Tabs className="w-full max-w-md" defaultValue="overview">
							<TabsList scrollable>
								<TabsTrigger value="overview">Overview</TabsTrigger>
								<TabsTrigger value="profile">Perfil</TabsTrigger>
								<TabsTrigger value="addresses">Endereços</TabsTrigger>
								<TabsTrigger value="orders">Pedidos</TabsTrigger>
								<TabsTrigger value="payments">Pagamentos</TabsTrigger>
								<TabsTrigger value="reviews">Reviews</TabsTrigger>
								<TabsTrigger value="lgpd">LGPD</TabsTrigger>
								<TabsTrigger value="audit">Auditoria</TabsTrigger>
							</TabsList>
						</Tabs>
					</Showcase>

					<Showcase label="orientation vertical">
						<Tabs
							className="w-full max-w-md"
							defaultValue="geral"
							orientation="vertical"
						>
							<TabsList>
								<TabsTrigger value="geral">Geral</TabsTrigger>
								<TabsTrigger value="filiais">Filiais</TabsTrigger>
								<TabsTrigger value="notificacoes">Notificações</TabsTrigger>
								<TabsTrigger value="acesso">Acesso e API</TabsTrigger>
							</TabsList>
							<TabsContent value="geral">
								<p className="pt-3 pl-3 text-muted-foreground text-xs/relaxed">
									Configurações de conta e workspace.
								</p>
							</TabsContent>
						</Tabs>
					</Showcase>
				</Section>

				<Section id="accordion" title="Accordion">
					<Showcase label="accordion (default open)">
						<AccordionShowcase />
					</Showcase>
				</Section>

				<Section
					description="Listagem padrão. Última coluna sempre = ações inline (Ver / Editar / Remover) usando TableActionsHead + TableActionsCell — helpers que cuidam de width (w-px shrink), alinhamento (text-right) e gap entre ícones (gap-1). Botões usam size=icon-sm + variant apropriado por semântica (outline=ver, secondary=editar, destructive=remover). Sempre aria-label descritivo. Conta/valor numérico permanece com texto."
					id="table"
					title="Table"
				>
					<div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
						<Table>
							<TableCaption>Pedidos recentes</TableCaption>
							<TableHeader>
								<TableRow>
									<TableHead>ID</TableHead>
									<TableHead>Cliente</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="text-right">Total</TableHead>
									<TableActionsHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								<TableRow>
									<TableCell className="font-mono">#10421</TableCell>
									<TableCell>Maria Silva</TableCell>
									<TableCell>
										<Badge variant="success">Pago</Badge>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										R$ 1.249,00
									</TableCell>
									<TableActionsCell>
										<Button
											aria-label="Ver pedido #10421"
											size="icon-sm"
											variant="outline"
										>
											<Eye aria-hidden className="size-3.5" />
										</Button>
										<Button
											aria-label="Editar pedido #10421"
											size="icon-sm"
											variant="secondary"
										>
											<Pencil aria-hidden className="size-3.5" />
										</Button>
										<Button
											aria-label="Remover pedido #10421"
											size="icon-sm"
											variant="destructive"
										>
											<Trash2 aria-hidden className="size-3.5" />
										</Button>
									</TableActionsCell>
								</TableRow>
								<TableRow>
									<TableCell className="font-mono">#10422</TableCell>
									<TableCell>João Pereira</TableCell>
									<TableCell>
										<Badge variant="info">Em separação</Badge>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										R$ 489,90
									</TableCell>
									<TableActionsCell>
										<Button
											aria-label="Ver pedido #10422"
											size="icon-sm"
											variant="outline"
										>
											<Eye aria-hidden className="size-3.5" />
										</Button>
										<Button
											aria-label="Editar pedido #10422"
											size="icon-sm"
											variant="secondary"
										>
											<Pencil aria-hidden className="size-3.5" />
										</Button>
										<Button
											aria-label="Remover pedido #10422"
											size="icon-sm"
											variant="destructive"
										>
											<Trash2 aria-hidden className="size-3.5" />
										</Button>
									</TableActionsCell>
								</TableRow>
								<TableRow>
									<TableCell className="font-mono">#10423</TableCell>
									<TableCell>Ana Costa</TableCell>
									<TableCell>
										<Badge variant="destructive">Cancelado</Badge>
									</TableCell>
									<TableCell className="text-right tabular-nums">
										R$ 289,00
									</TableCell>
									<TableActionsCell>
										<Button
											aria-label="Ver pedido #10423"
											size="icon-sm"
											variant="outline"
										>
											<Eye aria-hidden className="size-3.5" />
										</Button>
									</TableActionsCell>
								</TableRow>
							</TableBody>
						</Table>
					</div>
				</Section>

				<Section id="nav" title="Breadcrumb">
					<Showcase label="breadcrumb">
						<Breadcrumb>
							<BreadcrumbList>
								<BreadcrumbItem>
									<BreadcrumbLink href="#">Dashboard</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbLink href="#">Tools</BreadcrumbLink>
								</BreadcrumbItem>
								<BreadcrumbSeparator />
								<BreadcrumbItem>
									<BreadcrumbPage>Furadeira 1/2"</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</Showcase>
				</Section>

				<Section id="feedback" title="Skeleton · Spinner · Separator · Kbd">
					<Showcase label="skeleton">
						<div className="flex w-full max-w-sm flex-col gap-2">
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-4 w-1/2" />
							<Skeleton className="h-20 w-full" />
						</div>
					</Showcase>
					<Showcase label="spinner">
						<Spinner />
						<Spinner className="size-6" />
						<Spinner className="size-8 text-primary" />
					</Showcase>
					<Showcase label="separator">
						<div className="flex w-full max-w-sm flex-col gap-3">
							<span className="text-xs">Acima</span>
							<Separator />
							<span className="text-xs">Abaixo</span>
						</div>
					</Showcase>
					<Showcase label="kbd">
						<KbdGroup>
							<Kbd>⌘</Kbd>
							<Kbd>K</Kbd>
						</KbdGroup>
						<KbdGroup>
							<Kbd>shift</Kbd>
							<Kbd>↵</Kbd>
						</KbdGroup>
					</Showcase>
				</Section>

				<Section id="empty" title="Empty state & Item">
					<Showcase label="empty">
						<Empty className="w-full">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<BoxIcon />
								</EmptyMedia>
								<EmptyTitle>Nenhum produto</EmptyTitle>
								<EmptyDescription>
									Adicione o primeiro produto ou importe via CSV de fornecedor.
								</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button>Adicionar produto</Button>
							</EmptyContent>
						</Empty>
					</Showcase>
					<Showcase label="item list">
						<ItemGroup className="w-full">
							<Item variant="outline">
								<ItemMedia variant="icon">
									<BoxIcon />
								</ItemMedia>
								<ItemContent>
									<ItemTitle>Furadeira 1/2" — 127V</ItemTitle>
									<ItemDescription>
										SKU FUR-127-001 · 24 em estoque
									</ItemDescription>
								</ItemContent>
							</Item>
							<Item variant="outline">
								<ItemMedia variant="icon">
									<BoxIcon />
								</ItemMedia>
								<ItemContent>
									<ItemTitle>Esmerilhadeira 4 1/2"</ItemTitle>
									<ItemDescription>
										SKU ESM-220-014 · 6 em estoque
									</ItemDescription>
								</ItemContent>
							</Item>
						</ItemGroup>
					</Showcase>
				</Section>

				<Section
					description="Toaster já montado em providers.tsx — basta chamar toast()."
					id="toast"
					title="Toast (Sonner)"
				>
					<Showcase label="triggers">
						<ToastTriggers />
					</Showcase>
				</Section>

				<footer className="mt-16 border-border border-t pt-6 text-muted-foreground text-xs">
					<p>
						Componentes não exibidos visualmente (utilitários):{" "}
						<code className="font-mono">Sidebar</code>,{" "}
						<code className="font-mono">Direction</code>,{" "}
						<code className="font-mono">Resizable</code>,{" "}
						<code className="font-mono">ScrollArea</code>,{" "}
						<code className="font-mono">AspectRatio</code>,{" "}
						<code className="font-mono">Carousel</code>,{" "}
						<code className="font-mono">Calendar</code>,{" "}
						<code className="font-mono">Chart</code>,{" "}
						<code className="font-mono">Combobox</code>,{" "}
						<code className="font-mono">Command</code>,{" "}
						<code className="font-mono">ContextMenu</code>,{" "}
						<code className="font-mono">HoverCard</code>,{" "}
						<code className="font-mono">Menubar</code>,{" "}
						<code className="font-mono">NavigationMenu</code>,{" "}
						<code className="font-mono">Pagination</code>,{" "}
						<code className="font-mono">Sheet</code>,{" "}
						<code className="font-mono">Drawer</code>,{" "}
						<code className="font-mono">AlertDialog</code>,{" "}
						<code className="font-mono">InputOTP</code>,{" "}
						<code className="font-mono">InputGroup</code>,{" "}
						<code className="font-mono">Field</code>,{" "}
						<code className="font-mono">ButtonGroup</code>,{" "}
						<code className="font-mono">Toggle</code>,{" "}
						<code className="font-mono">ToggleGroup</code>,{" "}
						<code className="font-mono">Collapsible</code>.
					</p>
					<p className="mt-2">
						Sistema: industrial dark warm + 6 roles. Tokens:{" "}
						<code className="font-mono">
							packages/ui/src/styles/globals.css
						</code>
						. Voz e princípios: <code className="font-mono">DESIGN.md</code> +{" "}
						<code className="font-mono">PRODUCT.md</code>.
					</p>
				</footer>
			</div>
		</main>
	);
}
