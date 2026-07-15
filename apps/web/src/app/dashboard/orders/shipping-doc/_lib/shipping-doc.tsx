import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateTime } from "@/lib/format/datetime";
import { Wordmark } from "../../picking-list/_lib/document";
import {
	contentDeclarationTotals,
	displayPhone,
	formatBRL,
	formatCarrierService,
	maskDocument,
	recipientAddressLines,
	type ShippingDocOrder,
	senderAddressLines,
} from "./shipping-doc-logic";

const INK = "#1c1a17";
const GRAY = "#4a463f";
const LIGHT = "#8a857c";
const HAIRLINE = "#e2ddd6";
const BAND = "#eeece8";

const styles = StyleSheet.create({
	page: {
		color: INK,
		fontFamily: "Barlow",
		fontSize: 9,
		paddingBottom: 52,
		paddingHorizontal: 40,
		paddingTop: 36,
	},
	head: {
		alignItems: "flex-start",
		flexDirection: "row",
		justifyContent: "space-between",
	},
	docTitle: {
		fontFamily: "Barlow Condensed",
		fontSize: 17,
		fontWeight: 700,
		letterSpacing: 0.8,
		marginTop: 7,
	},
	orderBox: {
		alignItems: "center",
		borderColor: INK,
		borderRadius: 3,
		borderWidth: 1.2,
		paddingHorizontal: 10,
		paddingVertical: 5,
	},
	orderBoxLabel: {
		color: LIGHT,
		fontSize: 5.5,
		fontWeight: 600,
		letterSpacing: 1.4,
	},
	orderBoxNum: {
		fontFamily: "IBM Plex Mono",
		fontSize: 10.5,
		fontWeight: 600,
		marginTop: 1,
	},
	context: {
		borderBottomColor: HAIRLINE,
		borderBottomWidth: 0.8,
		borderTopColor: INK,
		borderTopWidth: 2,
		flexDirection: "row",
		gap: 26,
		marginTop: 12,
		paddingVertical: 8,
	},
	ctxLabel: {
		color: LIGHT,
		fontSize: 5.5,
		fontWeight: 600,
		letterSpacing: 1.2,
		textTransform: "uppercase",
	},
	ctxValue: { fontSize: 9, fontWeight: 500, marginTop: 2 },
	// duas colunas remetente/destinatário
	parties: { flexDirection: "row", gap: 16, marginTop: 16 },
	party: {
		borderColor: HAIRLINE,
		borderRadius: 3,
		borderWidth: 0.8,
		flex: 1,
		padding: 11,
	},
	partyLabel: {
		color: LIGHT,
		fontSize: 6,
		fontWeight: 600,
		letterSpacing: 1.4,
		textTransform: "uppercase",
	},
	partyName: {
		fontFamily: "Barlow Condensed",
		fontSize: 13,
		fontWeight: 700,
		letterSpacing: 0.3,
		marginBottom: 4,
		marginTop: 3,
	},
	partyLine: { color: GRAY, fontSize: 8.5, lineHeight: 1.45 },
	partyMeta: {
		borderTopColor: "#eceae6",
		borderTopWidth: 0.8,
		flexDirection: "row",
		gap: 14,
		marginTop: 7,
		paddingTop: 6,
	},
	metaLabel: { color: LIGHT, fontSize: 5.5, fontWeight: 600, letterSpacing: 1 },
	metaValue: {
		fontFamily: "IBM Plex Mono",
		fontSize: 8,
		fontWeight: 500,
		marginTop: 2,
	},
	muted: { color: LIGHT },
	// faixa transportadora
	carrier: {
		alignItems: "center",
		backgroundColor: BAND,
		borderRadius: 2,
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 12,
		paddingHorizontal: 10,
		paddingVertical: 7,
	},
	carrierLabel: {
		color: LIGHT,
		fontSize: 5.5,
		fontWeight: 600,
		letterSpacing: 1.2,
	},
	carrierValue: {
		fontFamily: "Barlow Condensed",
		fontSize: 11,
		fontWeight: 700,
		letterSpacing: 0.5,
		marginTop: 1,
	},
	// declaração de conteúdo
	sectionLabel: {
		fontFamily: "Barlow Condensed",
		fontSize: 11,
		fontWeight: 700,
		letterSpacing: 1,
		marginTop: 18,
	},
	sectionHint: { color: LIGHT, fontSize: 6.5, marginBottom: 6, marginTop: 1 },
	tableHead: {
		borderBottomColor: INK,
		borderBottomWidth: 1,
		flexDirection: "row",
		paddingBottom: 4,
	},
	th: {
		color: LIGHT,
		fontSize: 5.5,
		fontWeight: 600,
		letterSpacing: 1,
		textTransform: "uppercase",
	},
	row: {
		borderBottomColor: "#eceae6",
		borderBottomWidth: 0.8,
		flexDirection: "row",
		paddingVertical: 5,
	},
	colItem: { flex: 1, paddingRight: 8 },
	colQty: { textAlign: "center", width: 34 },
	colPrice: { textAlign: "right", width: 66 },
	itemName: { fontSize: 8.5, fontWeight: 500 },
	cellNum: { fontFamily: "IBM Plex Mono", fontSize: 8 },
	totalsRow: {
		flexDirection: "row",
		marginTop: 6,
		paddingTop: 2,
	},
	totalsLabel: {
		color: GRAY,
		flex: 1,
		fontSize: 8,
		fontWeight: 600,
		textAlign: "right",
	},
	totalsQty: {
		fontFamily: "IBM Plex Mono",
		fontSize: 8,
		fontWeight: 600,
		textAlign: "center",
		width: 34,
	},
	totalsValue: {
		fontFamily: "IBM Plex Mono",
		fontSize: 9,
		fontWeight: 600,
		textAlign: "right",
		width: 66,
	},
	foot: {
		borderTopColor: HAIRLINE,
		borderTopWidth: 0.8,
		bottom: 22,
		color: LIGHT,
		flexDirection: "row",
		fontSize: 6.5,
		justifyContent: "space-between",
		left: 40,
		paddingTop: 4,
		position: "absolute",
		right: 40,
	},
	emptyWrap: { alignItems: "center", flex: 1, justifyContent: "center" },
	emptyText: { color: GRAY, fontSize: 11 },
});

function DocFooter({ generatedAt }: { generatedAt: Date }) {
	return (
		<View fixed style={styles.foot}>
			<Text>{`emach dashboard · Dados de envio · ${formatDateTime(generatedAt)}`}</Text>
			<Text
				render={({ pageNumber, totalPages }) =>
					`página ${pageNumber} de ${totalPages}`
				}
			/>
		</View>
	);
}

function PartyLines({ lines }: { lines: string[] }) {
	if (lines.length === 0) {
		return (
			<Text style={[styles.partyLine, styles.muted]}>
				Endereço não informado
			</Text>
		);
	}
	return (
		<>
			{lines.map((line) => (
				<Text key={line} style={styles.partyLine}>
					{line}
				</Text>
			))}
		</>
	);
}

function SenderParty({ order }: { order: ShippingDocOrder }) {
	const phone = displayPhone(order.sender.phone);
	return (
		<View style={styles.party}>
			<Text style={styles.partyLabel}>Remetente</Text>
			<Text style={styles.partyName}>{order.sender.name ?? "—"}</Text>
			<PartyLines lines={senderAddressLines(order.sender)} />
			{phone ? (
				<View style={styles.partyMeta}>
					<View>
						<Text style={styles.metaLabel}>TELEFONE</Text>
						<Text style={styles.metaValue}>{phone}</Text>
					</View>
				</View>
			) : null}
		</View>
	);
}

function RecipientParty({ order }: { order: ShippingDocOrder }) {
	const phone = displayPhone(order.recipient.phone);
	const doc = maskDocument(order.recipient.document);
	return (
		<View style={styles.party}>
			<Text style={styles.partyLabel}>Destinatário</Text>
			<Text style={styles.partyName}>{order.recipient.name ?? "—"}</Text>
			<PartyLines lines={recipientAddressLines(order.recipient)} />
			{phone || doc ? (
				<View style={styles.partyMeta}>
					{phone ? (
						<View>
							<Text style={styles.metaLabel}>TELEFONE</Text>
							<Text style={styles.metaValue}>{phone}</Text>
						</View>
					) : null}
					{doc ? (
						<View>
							<Text style={styles.metaLabel}>CPF/CNPJ</Text>
							<Text style={styles.metaValue}>{doc}</Text>
						</View>
					) : null}
				</View>
			) : null}
		</View>
	);
}

function ContentDeclaration({ order }: { order: ShippingDocOrder }) {
	const totals = contentDeclarationTotals(order.items);
	return (
		<>
			<Text style={styles.sectionLabel}>DECLARAÇÃO DE CONTEÚDO</Text>
			<Text style={styles.sectionHint}>
				Conteúdo e valores do pedido — dispensa nota fiscal impressa no despacho
			</Text>
			<View style={styles.tableHead}>
				<Text style={[styles.th, styles.colItem]}>Item</Text>
				<Text style={[styles.th, styles.colQty]}>Qtd</Text>
				<Text style={[styles.th, styles.colPrice]}>Vlr unit.</Text>
				<Text style={[styles.th, styles.colPrice]}>Vlr total</Text>
			</View>
			{order.items.map((item, index) => (
				<View key={`${item.name}-${index}`} style={styles.row} wrap={false}>
					<View style={styles.colItem}>
						<Text style={styles.itemName}>{item.name}</Text>
					</View>
					<Text style={[styles.cellNum, styles.colQty]}>{item.quantity}</Text>
					<Text style={[styles.cellNum, styles.colPrice]}>
						{formatBRL(item.unitPrice)}
					</Text>
					<Text style={[styles.cellNum, styles.colPrice]}>
						{formatBRL(item.lineTotal)}
					</Text>
				</View>
			))}
			<View style={styles.totalsRow}>
				<Text style={styles.totalsLabel}>Total</Text>
				<Text style={styles.totalsQty}>{totals.totalQuantity}</Text>
				<Text style={styles.totalsValue}>{formatBRL(totals.totalValue)}</Text>
			</View>
		</>
	);
}

function OrderPage({
	generatedAt,
	operatorName,
	order,
}: {
	generatedAt: Date;
	operatorName: string;
	order: ShippingDocOrder;
}) {
	return (
		<Page size="A4" style={styles.page}>
			<View style={styles.head}>
				<View>
					<Wordmark />
					<Text style={styles.docTitle}>DADOS DE ENVIO</Text>
				</View>
				<View style={styles.orderBox}>
					<Text style={styles.orderBoxLabel}>PEDIDO</Text>
					<Text style={styles.orderBoxNum}>{order.number}</Text>
				</View>
			</View>
			<View style={styles.context}>
				<View>
					<Text style={styles.ctxLabel}>Emissão</Text>
					<Text style={styles.ctxValue}>{formatDateTime(generatedAt)}</Text>
				</View>
				<View>
					<Text style={styles.ctxLabel}>Operador</Text>
					<Text style={styles.ctxValue}>{operatorName}</Text>
				</View>
			</View>
			<View style={styles.parties}>
				<SenderParty order={order} />
				<RecipientParty order={order} />
			</View>
			<View style={styles.carrier}>
				<View>
					<Text style={styles.carrierLabel}>TRANSPORTADORA / SERVIÇO</Text>
					<Text style={styles.carrierValue}>
						{formatCarrierService(
							order.shippingMethod,
							order.shippingServiceCode
						)}
					</Text>
				</View>
			</View>
			<ContentDeclaration order={order} />
			<DocFooter generatedAt={generatedAt} />
		</Page>
	);
}

export interface ShippingDocDocumentProps {
	generatedAt: Date;
	operatorName: string;
	orders: ShippingDocOrder[];
}

/**
 * Documento de Dados de Envio (issue #321): uma folha por pedido (o papel
 * acompanha a caixa), com REMETENTE (filial) | DESTINATÁRIO (snapshot) +
 * transportadora/serviço + declaração de conteúdo. Nenhum dado é digitado —
 * tudo vem do banco. Mesma identidade visual da lista de separação (#319).
 */
export function ShippingDocDocument({
	generatedAt,
	operatorName,
	orders,
}: ShippingDocDocumentProps) {
	return (
		<Document title="Dados de Envio">
			{orders.map((order) => (
				<OrderPage
					generatedAt={generatedAt}
					key={order.id}
					operatorName={operatorName}
					order={order}
				/>
			))}
		</Document>
	);
}

/** 200 com documento vazio: não vaza existência de pedidos fora do escopo (spec #319). */
export function EmptyShippingDocDocument({
	generatedAt,
}: {
	generatedAt: Date;
}) {
	return (
		<Document title="Dados de Envio">
			<Page size="A4" style={styles.page}>
				<View style={styles.emptyWrap}>
					<Text style={styles.emptyText}>
						Nenhum pedido no escopo deste documento.
					</Text>
				</View>
				<DocFooter generatedAt={generatedAt} />
			</Page>
		</Document>
	);
}
