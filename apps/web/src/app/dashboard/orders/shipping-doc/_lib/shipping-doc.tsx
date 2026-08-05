import {
	Document,
	Image,
	Page,
	StyleSheet,
	Text,
	View,
} from "@react-pdf/renderer";
import {
	itemsSummary,
	type LabelSheet,
	labelRecipientLines,
	paginateLabels,
	type ShippingDocOrder,
	senderInline,
} from "./shipping-doc-logic";

const INK = "#1c1a17";
const GRAY = "#4a463f";
const LIGHT = "#8a857c";
const HAIRLINE = "#e2ddd6";

const styles = StyleSheet.create({
	page: {
		color: INK,
		fontFamily: "Barlow",
		fontSize: 9,
		paddingHorizontal: 34,
		paddingVertical: 26,
	},
	half: { flex: 1 },
	halfTop: { paddingBottom: 14 },
	halfBottom: { paddingTop: 14 },
	cutRow: {
		alignItems: "center",
		flexDirection: "row",
		gap: 6,
	},
	cutLine: {
		borderTopColor: "#b3ada3",
		borderTopStyle: "dashed",
		borderTopWidth: 1,
		flex: 1,
	},
	cutLabel: { color: LIGHT, fontSize: 5.5, letterSpacing: 1.2 },
	head: {
		alignItems: "baseline",
		flexDirection: "row",
		justifyContent: "space-between",
	},
	docTitle: {
		fontFamily: "Barlow Condensed",
		fontSize: 15,
		fontWeight: 700,
		letterSpacing: 0.8,
	},
	orderNum: { fontFamily: "IBM Plex Mono", fontSize: 10, fontWeight: 600 },
	rule: { borderTopColor: INK, borderTopWidth: 2, marginTop: 6 },
	cols: { flex: 1, flexDirection: "row", gap: 16, marginTop: 10 },
	colItems: { width: "47%" },
	colAddr: { flexDirection: "column", width: "53%" },
	micro: {
		color: LIGHT,
		fontSize: 5.5,
		fontWeight: 600,
		letterSpacing: 1.2,
		textTransform: "uppercase",
	},
	itemsHead: {
		borderBottomColor: INK,
		borderBottomWidth: 1,
		flexDirection: "row",
		marginTop: 4,
		paddingBottom: 3,
	},
	itemRow: {
		alignItems: "flex-start",
		borderBottomColor: "#eceae6",
		borderBottomWidth: 0.6,
		flexDirection: "row",
		paddingVertical: 4,
	},
	qty: {
		fontFamily: "IBM Plex Mono",
		fontSize: 8.5,
		fontWeight: 600,
		width: 24,
	},
	itemName: { fontSize: 8, fontWeight: 500, lineHeight: 1.3 },
	itemSku: { color: LIGHT, fontFamily: "IBM Plex Mono", fontSize: 6 },
	senderBox: {
		borderColor: HAIRLINE,
		borderRadius: 3,
		borderWidth: 0.8,
		padding: 8,
	},
	senderName: { fontSize: 8, fontWeight: 600 },
	senderAddr: { color: GRAY, fontSize: 7, lineHeight: 1.45, marginTop: 1 },
	destBox: {
		borderColor: INK,
		borderRadius: 3,
		borderWidth: 1.3,
		flex: 1,
		flexDirection: "column",
		marginTop: 8,
		overflow: "hidden",
	},
	destBand: {
		backgroundColor: INK,
		color: "#ffffff",
		fontSize: 6.5,
		fontWeight: 600,
		letterSpacing: 1.8,
		paddingHorizontal: 9,
		paddingVertical: 3.5,
		textTransform: "uppercase",
	},
	destBody: { flex: 1, flexDirection: "column", padding: 9 },
	destName: {
		fontFamily: "Barlow Condensed",
		fontSize: 15,
		fontWeight: 700,
	},
	addrLine: { color: GRAY, fontSize: 8.5, lineHeight: 1.5, marginTop: 3 },
	cepInline: { color: INK, fontFamily: "IBM Plex Mono", fontWeight: 600 },
	cepBlock: { marginTop: "auto" },
	cepOver: {
		fontFamily: "IBM Plex Mono",
		fontSize: 11,
		fontWeight: 600,
		letterSpacing: 3,
		textAlign: "center",
	},
	cepBarcode: { height: 26, marginTop: 2, width: "100%" },
	emptyWrap: { alignItems: "center", flex: 1, justifyContent: "center" },
	emptyText: { color: GRAY, fontSize: 11 },
});

function ItemsColumn({ order }: { order: ShippingDocOrder }) {
	return (
		<View style={styles.colItems}>
			<Text
				style={styles.micro}
			>{`Conferência · ${itemsSummary(order.items)}`}</Text>
			<View style={styles.itemsHead}>
				<Text style={[styles.micro, { width: 24 }]}>Qtd</Text>
				<Text style={[styles.micro, { flex: 1 }]}>Item</Text>
			</View>
			{order.items.map((item, index) => (
				<View
					key={`${item.sku ?? item.name}-${index}`}
					style={styles.itemRow}
					wrap={false}
				>
					<Text style={styles.qty}>{`${item.quantity}×`}</Text>
					<View style={{ flex: 1 }}>
						<Text style={styles.itemName}>
							{item.voltage ? `${item.name} · ${item.voltage}` : item.name}
						</Text>
						{item.sku ? <Text style={styles.itemSku}>{item.sku}</Text> : null}
					</View>
				</View>
			))}
		</View>
	);
}

function AddressColumn({
	barcode,
	order,
}: {
	barcode: string | undefined;
	order: ShippingDocOrder;
}) {
	const sender = senderInline(order.sender);
	const lines = labelRecipientLines(order.recipient);
	return (
		<View style={styles.colAddr}>
			<View style={styles.senderBox}>
				<Text style={styles.micro}>Remetente</Text>
				<Text style={styles.senderName}>
					{order.sender.name ? `EMACH · ${order.sender.name}` : "EMACH"}
				</Text>
				{sender ? <Text style={styles.senderAddr}>{sender}</Text> : null}
			</View>
			<View style={styles.destBox}>
				<Text style={styles.destBand}>Destinatário</Text>
				<View style={styles.destBody}>
					<Text style={styles.destName}>{order.recipient.name ?? "—"}</Text>
					{lines.street ? (
						<Text style={styles.addrLine}>{lines.street}</Text>
					) : null}
					{lines.locality || lines.cep ? (
						<Text style={styles.addrLine}>
							{lines.locality}
							{lines.locality && lines.cep ? " · " : ""}
							{lines.cep ? (
								<Text style={styles.cepInline}>{`CEP ${lines.cep}`}</Text>
							) : null}
						</Text>
					) : null}
					{lines.cep && barcode ? (
						<View style={styles.cepBlock}>
							<Text style={styles.cepOver}>{lines.cep}</Text>
							<Image src={barcode} style={styles.cepBarcode} />
						</View>
					) : null}
				</View>
			</View>
		</View>
	);
}

function Label({
	barcode,
	order,
}: {
	barcode: string | undefined;
	order: ShippingDocOrder;
}) {
	return (
		<>
			<View style={styles.head}>
				<Text style={styles.docTitle}>ETIQUETA DE ENVIO</Text>
				<Text style={styles.orderNum}>{order.number}</Text>
			</View>
			<View style={styles.rule} />
			<View style={styles.cols}>
				<ItemsColumn order={order} />
				<AddressColumn barcode={barcode} order={order} />
			</View>
		</>
	);
}

// ✂ do mockup virou rótulo textual: Barlow/Plex Mono não têm glyph confiável no react-pdf.
function CutLine() {
	return (
		<View style={styles.cutRow}>
			<View style={styles.cutLine} />
			<Text style={styles.cutLabel}>CORTE AQUI</Text>
			<View style={styles.cutLine} />
		</View>
	);
}

function SheetPage({
	cepBarcodes,
	sheet,
}: {
	cepBarcodes: Record<string, string>;
	sheet: LabelSheet;
}) {
	if (sheet.kind === "full") {
		return (
			<Page size="A4" style={styles.page}>
				<Label barcode={cepBarcodes[sheet.order.id]} order={sheet.order} />
			</Page>
		);
	}
	return (
		<Page size="A4" style={styles.page}>
			<View style={[styles.half, styles.halfTop]}>
				<Label barcode={cepBarcodes[sheet.top.id]} order={sheet.top} />
			</View>
			<CutLine />
			<View style={[styles.half, styles.halfBottom]}>
				{sheet.bottom ? (
					<Label barcode={cepBarcodes[sheet.bottom.id]} order={sheet.bottom} />
				) : null}
			</View>
		</Page>
	);
}

export interface ShippingDocDocumentProps {
	cepBarcodes: Record<string, string>;
	orders: ShippingDocOrder[];
}

/**
 * Etiqueta de envio (spec 2026-08-05): A4 retrato com DUAS etiquetas por folha
 * (linha de corte no meio); pedido com mais de MAX_ITEMS_PER_HALF itens ganha
 * folha exclusiva. Sem valores (DANFE acompanha a caixa), sem barcode de
 * rastreio (postagem no balcão) — o barcode é o CEP, padrão de triagem.
 */
export function ShippingDocDocument({
	cepBarcodes,
	orders,
}: ShippingDocDocumentProps) {
	const sheets = paginateLabels(orders);
	return (
		<Document title="Etiqueta de envio">
			{sheets.map((sheet) => (
				<SheetPage
					cepBarcodes={cepBarcodes}
					key={sheet.kind === "full" ? sheet.order.id : sheet.top.id}
					sheet={sheet}
				/>
			))}
		</Document>
	);
}

/** 200 com documento vazio: não vaza existência de pedidos fora do escopo (spec #319). */
export function EmptyShippingDocDocument() {
	return (
		<Document title="Etiqueta de envio">
			<Page size="A4" style={styles.page}>
				<View style={styles.emptyWrap}>
					<Text style={styles.emptyText}>
						Nenhum pedido no escopo deste documento.
					</Text>
				</View>
			</Page>
		</Document>
	);
}
