import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Html,
	Preview,
	pixelBasedPreset,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

export interface StockAlertEmailProps {
	branchName: string;
	dashboardUrl: string;
	items: Array<{
		alertLevel: "critical" | "reorder";
		deficit: number;
		quantity: number;
		reorderPoint: number;
		sku: string;
		toolName: string;
	}>;
}

const CRITICAL_COLOR = "#dc2626";
const cellStyle = { padding: "6px 8px" };
const headStyle = {
	...cellStyle,
	borderBottom: "1px solid #e5e7eb",
	textAlign: "left" as const,
};
const rowStyle = { borderBottom: "1px solid #f3f4f6" };

export function StockAlertEmail({
	branchName,
	dashboardUrl,
	items,
}: StockAlertEmailProps) {
	return (
		<Html lang="pt-BR">
			<Tailwind
				config={{
					presets: [pixelBasedPreset],
					theme: { extend: { colors: { coral: "#cc785c" } } },
				}}
			>
				<Head />
				<Body className="bg-gray-100 font-sans">
					<Preview>Alerta de estoque baixo — filial {branchName}</Preview>
					<Container className="mx-auto max-w-xl p-6">
						<Section className="rounded-lg border border-gray-200 border-solid bg-white p-8">
							<Text className="m-0 font-bold text-coral text-sm tracking-widest">
								E-MACH
							</Text>
							<Heading className="mt-4 mb-2 font-normal text-2xl text-gray-900">
								Estoque abaixo do ponto de reposição
							</Heading>
							<Text className="text-base text-gray-700">
								Olá! Os itens abaixo na filial {branchName} precisam de
								reposição.
							</Text>
							<table
								style={{
									borderCollapse: "collapse" as const,
									fontSize: 14,
									width: "100%",
								}}
							>
								<thead>
									<tr>
										<th style={headStyle}>Ferramenta</th>
										<th style={headStyle}>SKU</th>
										<th style={headStyle}>Estoque</th>
										<th style={headStyle}>Ponto</th>
										<th style={headStyle}>Déficit</th>
									</tr>
								</thead>
								<tbody>
									{items.map((item) => (
										<tr key={item.sku} style={rowStyle}>
											<td style={cellStyle}>{item.toolName}</td>
											<td style={cellStyle}>{item.sku}</td>
											<td
												style={
													item.alertLevel === "critical"
														? {
																...cellStyle,
																color: CRITICAL_COLOR,
																fontWeight: 600,
															}
														: cellStyle
												}
											>
												{item.quantity}
											</td>
											<td style={cellStyle}>{item.reorderPoint}</td>
											<td style={cellStyle}>{item.deficit}</td>
										</tr>
									))}
								</tbody>
							</table>
							<Button
								className="my-4 box-border block rounded-md bg-coral px-5 py-3 text-center font-medium text-white no-underline"
								href={dashboardUrl}
							>
								Ver reposição no painel
							</Button>
							<Text className="text-gray-500 text-sm">
								Você recebeu este e-mail porque administra esta filial no painel
								E-mach.
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

StockAlertEmail.PreviewProps = {
	branchName: "Filial Centro",
	dashboardUrl:
		"https://admin.emach.com.br/dashboard/tools?mode=repor&branchId=b1",
	items: [
		{
			alertLevel: "critical",
			deficit: 5,
			quantity: 0,
			reorderPoint: 5,
			sku: "PFD-12V-001",
			toolName: "Parafusadeira 12V",
		},
		{
			alertLevel: "reorder",
			deficit: 5,
			quantity: 3,
			reorderPoint: 8,
			sku: "FUR-500W-002",
			toolName: "Furadeira 500W",
		},
	],
} satisfies StockAlertEmailProps;

export default StockAlertEmail;
