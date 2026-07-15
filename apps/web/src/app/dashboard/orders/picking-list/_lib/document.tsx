import {
	Document,
	G,
	Page,
	Path,
	StyleSheet,
	Svg,
	Text,
	View,
} from "@react-pdf/renderer";
import { formatDateTime } from "@/lib/format/datetime";
import {
	type CarrierGroup,
	type CollectLine,
	consolidateItems,
	groupByCarrier,
	type PickingListOrder,
	pickingListStats,
	shouldIncludeCollect,
} from "./picking-list-logic";

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
	// header: identidade | lote
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
	loteBox: {
		alignItems: "center",
		borderColor: INK,
		borderRadius: 3,
		borderWidth: 1.2,
		paddingHorizontal: 10,
		paddingVertical: 5,
	},
	loteLabel: {
		color: LIGHT,
		fontSize: 5.5,
		fontWeight: 600,
		letterSpacing: 1.4,
	},
	loteNum: {
		fontFamily: "IBM Plex Mono",
		fontSize: 10.5,
		fontWeight: 600,
		marginTop: 1,
	},
	// faixa de contexto
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
	// stat row
	stats: {
		borderBottomColor: HAIRLINE,
		borderBottomWidth: 0.8,
		flexDirection: "row",
	},
	stat: {
		alignItems: "center",
		borderRightColor: "#eceae6",
		borderRightWidth: 0.8,
		flex: 1,
		paddingVertical: 9,
	},
	statLast: { borderRightWidth: 0 },
	statNum: { fontFamily: "Barlow Condensed", fontSize: 16, fontWeight: 700 },
	statLabel: {
		color: LIGHT,
		fontSize: 5.5,
		fontWeight: 600,
		letterSpacing: 1.1,
		marginTop: 3,
		textTransform: "uppercase",
	},
	// seções
	sectionLabel: {
		fontFamily: "Barlow Condensed",
		fontSize: 11,
		fontWeight: 700,
		letterSpacing: 1,
		marginTop: 16,
	},
	sectionHint: { color: LIGHT, fontSize: 6.5, marginBottom: 4, marginTop: 1 },
	// coleta
	pickRow: {
		alignItems: "flex-start",
		borderBottomColor: "#eceae6",
		borderBottomWidth: 0.8,
		flexDirection: "row",
		gap: 10,
		paddingVertical: 8,
	},
	check: {
		borderColor: INK,
		borderRadius: 2,
		borderWidth: 1.2,
		height: 11,
		marginTop: 2,
		width: 11,
	},
	checkLg: { height: 13, width: 13 },
	qty: {
		fontFamily: "Barlow Condensed",
		fontSize: 15,
		fontWeight: 700,
		textAlign: "center",
		width: 28,
	},
	pickInfo: { flex: 1 },
	pickName: { fontSize: 9, fontWeight: 600, lineHeight: 1.35 },
	pickSub: {
		color: GRAY,
		fontFamily: "IBM Plex Mono",
		fontSize: 7,
		marginTop: 3,
	},
	pickSide: { alignItems: "flex-end", gap: 3 },
	barcodeText: { color: GRAY, fontFamily: "IBM Plex Mono", fontSize: 6.5 },
	ordersRef: { color: LIGHT, fontSize: 6.5 },
	// conferência
	carrier: {
		alignItems: "center",
		backgroundColor: BAND,
		borderRadius: 2,
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 12,
		paddingHorizontal: 9,
		paddingVertical: 5,
	},
	carrierName: {
		fontFamily: "Barlow Condensed",
		fontSize: 10,
		fontWeight: 700,
		letterSpacing: 1,
	},
	carrierCount: { color: GRAY, fontSize: 6.5, fontWeight: 500 },
	orderBlock: {
		borderBottomColor: "#eceae6",
		borderBottomWidth: 0.8,
		flexDirection: "row",
		gap: 10,
		paddingVertical: 9,
	},
	orderBody: { flex: 1 },
	orderHead: { flexDirection: "row", justifyContent: "space-between" },
	orderNum: { fontFamily: "IBM Plex Mono", fontSize: 9, fontWeight: 600 },
	orderCity: { color: LIGHT, fontSize: 7 },
	orderClient: { color: GRAY, fontSize: 8, fontWeight: 500, marginTop: 2 },
	orderItems: {
		borderTopColor: "#ddd9d3",
		borderTopStyle: "dashed",
		borderTopWidth: 0.8,
		marginTop: 6,
		paddingTop: 5,
	},
	oItem: { flexDirection: "row", gap: 7, paddingVertical: 2 },
	oItemQty: { fontSize: 8, fontWeight: 700, width: 16 },
	oItemInfo: { flex: 1 },
	oItemName: { fontSize: 8, fontWeight: 500 },
	oItemSku: {
		color: GRAY,
		fontFamily: "IBM Plex Mono",
		fontSize: 6.5,
		marginTop: 1,
	},
	// rodapé
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

/** Wordmark emach — paths de apps/web/public/emach-nome-branco.svg, fill em tinta. */
function Wordmark() {
	return (
		<Svg height={13} viewBox="0 0 2041 377" width={70}>
			<G transform="translate(0,377) scale(0.1,-0.1)">
				<Path
					d="M2167 3293 c-4 -3 -7 -638 -7 -1410 l0 -1403 1413 0 1412 0 -3 277 c-2 153 -6 280 -8 282 -2 3 -510 5 -1129 5 l-1125 1 0 292 0 293 1128 0 c621 0 1131 2 1133 4 2 2 3 131 1 285 l-3 281 -1129 0 -1130 0 0 265 0 265 1130 0 1130 0 0 285 0 285 -1403 0 c-772 0 -1407 -3 -1410 -7z"
					fill={INK}
				/>
				<Path
					d="M9446 3293 c-8 -8 -7 -2779 1 -2800 4 -10 64 -13 279 -13 l274 0 0 575 0 575 854 0 853 0 -2 -562 c-1 -310 0 -569 2 -575 4 -10 69 -13 279 -13 l274 0 -2 1408 -3 1407 -1401 3 c-770 1 -1404 -1 -1408 -5z m2264 -812 c0 -137 -3 -256 -6 -265 -6 -14 -90 -16 -855 -16 l-849 0 0 265 0 265 855 0 855 0 0 -249z"
					fill={INK}
				/>
				<Path
					d="M12488 3273 c-4 -22 -3 -1474 2 -2685 l0 -108 1410 0 1410 0 0 280 0 280 -252 2 c-139 1 -649 2 -1133 2 l-880 1 -1 842 -1 843 1131 2 1131 3 0 280 0 280 -1406 3 -1406 2 -5 -27z"
					fill={INK}
				/>
				<Path
					d="M15557 3268 c-5 -37 -5 -2513 1 -2681 l3 -107 275 0 274 0 0 73 c1 39 0 298 0 575 l-1 502 851 0 850 0 0 -575 0 -575 275 0 275 0 0 1410 0 1410 -275 0 -275 0 -1 -77 c-1 -43 0 -291 1 -550 l1 -473 -850 0 -851 0 0 550 0 550 -274 0 -274 0 -5 -32z"
					fill={INK}
				/>
				<Path
					d="M6898 3215 c-233 -44 -453 -185 -594 -380 -42 -57 -1196 -2364 -1189 -2375 14 -22 403 -29 544 -10 294 40 497 150 664 360 51 63 124 203 467 895 246 496 425 844 452 880 73 99 217 207 338 255 38 15 181 50 205 50 20 0 -9 29 -97 100 -121 94 -286 181 -403 211 -106 27 -284 33 -387 14z"
					fill={INK}
				/>
				<Path
					d="M8380 3219 c-236 -36 -468 -177 -612 -371 -35 -49 -226 -421 -630 -1230 -318 -638 -576 -1164 -572 -1167 3 -3 130 -6 282 -6 293 0 361 8 507 57 200 68 369 207 478 393 41 70 373 732 642 1282 188 382 221 433 347 535 116 94 255 159 371 173 31 4 57 11 57 16 0 13 -138 117 -234 175 -105 63 -215 110 -305 130 -87 19 -250 25 -331 13z"
					fill={INK}
				/>
				<Path
					d="M8552 1483 c-18 -9 -44 -30 -56 -47 -13 -17 -132 -246 -265 -508 l-242 -478 103 0 c57 0 310 -2 563 -5 253 -3 495 -1 537 3 l77 7 -90 170 c-50 94 -163 312 -251 485 -88 173 -168 324 -177 334 -23 27 -90 56 -131 56 -19 0 -50 -8 -68 -17z"
					fill={INK}
				/>
			</G>
		</Svg>
	);
}

interface HeaderProps {
	batch: string;
	branchName: string | null;
	generatedAt: Date;
	operatorName: string;
	title: string;
}

function DocHeader({
	batch,
	branchName,
	generatedAt,
	operatorName,
	title,
}: HeaderProps) {
	return (
		<>
			<View style={styles.head}>
				<View>
					<Wordmark />
					<Text style={styles.docTitle}>{title}</Text>
				</View>
				<View style={styles.loteBox}>
					<Text style={styles.loteLabel}>LOTE</Text>
					<Text style={styles.loteNum}>{batch}</Text>
				</View>
			</View>
			<View style={styles.context}>
				<View>
					<Text style={styles.ctxLabel}>Filial</Text>
					<Text style={styles.ctxValue}>{branchName ?? "—"}</Text>
				</View>
				<View>
					<Text style={styles.ctxLabel}>Emissão</Text>
					<Text style={styles.ctxValue}>{formatDateTime(generatedAt)}</Text>
				</View>
				<View>
					<Text style={styles.ctxLabel}>Operador</Text>
					<Text style={styles.ctxValue}>{operatorName}</Text>
				</View>
			</View>
		</>
	);
}

function DocFooter({ batch }: { batch: string }) {
	return (
		<View fixed style={styles.foot}>
			<Text>{`emach dashboard · Lote ${batch}`}</Text>
			<Text
				render={({ pageNumber, totalPages }) =>
					`página ${pageNumber} de ${totalPages}`
				}
			/>
		</View>
	);
}

function itemMeta(item: {
	model: string | null;
	sku: string | null;
	voltage: string | null;
}): string {
	return [item.sku, item.voltage, item.model].filter(Boolean).join(" · ");
}

function CollectSection({ lines }: { lines: CollectLine[] }) {
	return (
		<>
			<Text style={styles.sectionLabel}>COLETA CONSOLIDADA</Text>
			<Text style={styles.sectionHint}>
				Itens iguais agrupados — uma passada no estoque
			</Text>
			{lines.map((line, i) => (
				<View
					key={`${line.sku ?? line.name}`}
					style={
						i === lines.length - 1
							? [styles.pickRow, { borderBottomWidth: 0 }]
							: styles.pickRow
					}
					wrap={false}
				>
					<View style={styles.check} />
					<Text style={styles.qty}>{`${line.totalQty}×`}</Text>
					<View style={styles.pickInfo}>
						<Text style={styles.pickName}>{line.name}</Text>
						{itemMeta(line) ? (
							<Text style={styles.pickSub}>{itemMeta(line)}</Text>
						) : null}
					</View>
					<View style={styles.pickSide}>
						{line.barcode ? (
							<Text style={styles.barcodeText}>{line.barcode}</Text>
						) : null}
						<Text style={styles.ordersRef}>
							{line.orderCount === 1
								? "1 pedido"
								: `${line.orderCount} pedidos`}
						</Text>
					</View>
				</View>
			))}
		</>
	);
}

function ConferenceSection({ groups }: { groups: CarrierGroup[] }) {
	return (
		<>
			{groups.map((group) => (
				<View key={group.label}>
					<View minPresenceAhead={60} style={styles.carrier}>
						<Text style={styles.carrierName}>{group.label.toUpperCase()}</Text>
						<Text style={styles.carrierCount}>
							{group.orders.length === 1
								? "1 pedido"
								: `${group.orders.length} pedidos`}
						</Text>
					</View>
					{group.orders.map((o) => (
						<View key={o.id} style={styles.orderBlock} wrap={false}>
							<View style={[styles.check, styles.checkLg]} />
							<View style={styles.orderBody}>
								<View style={styles.orderHead}>
									<Text style={styles.orderNum}>{o.number}</Text>
									{o.city ? (
										<Text style={styles.orderCity}>
											{o.state ? `${o.city}/${o.state}` : o.city}
										</Text>
									) : null}
								</View>
								<Text style={styles.orderClient}>{o.clientName}</Text>
								<View style={styles.orderItems}>
									{o.items.map((item) => (
										<View
											key={`${o.id}-${item.sku ?? item.name}`}
											style={styles.oItem}
										>
											<Text style={styles.oItemQty}>{`${item.quantity}×`}</Text>
											<View style={styles.oItemInfo}>
												<Text style={styles.oItemName}>{item.name}</Text>
												{itemMeta(item) ? (
													<Text style={styles.oItemSku}>{itemMeta(item)}</Text>
												) : null}
											</View>
										</View>
									))}
								</View>
							</View>
						</View>
					))}
				</View>
			))}
		</>
	);
}

export interface PickingListDocumentProps {
	batch: string;
	branchName: string | null;
	generatedAt: Date;
	operatorName: string;
	orders: PickingListOrder[];
}

/**
 * Lista de Separação (spec 2026-07-15): documento adaptativo — coleta
 * consolidada só com 2+ pedidos; conferência por pedido agrupada por
 * transportadora sempre. Fluxo contínuo, quebra de página natural.
 */
export function PickingListDocument({
	batch,
	branchName,
	generatedAt,
	operatorName,
	orders,
}: PickingListDocumentProps) {
	const stats = pickingListStats(orders);
	const withCollect = shouldIncludeCollect(orders);
	return (
		<Document title={`Lista de Separação ${batch}`}>
			<Page size="A4" style={styles.page}>
				<DocHeader
					batch={batch}
					branchName={branchName}
					generatedAt={generatedAt}
					operatorName={operatorName}
					title="LISTA DE SEPARAÇÃO"
				/>
				<View style={styles.stats}>
					<View style={styles.stat}>
						<Text style={styles.statNum}>{stats.orders}</Text>
						<Text style={styles.statLabel}>
							{stats.orders === 1 ? "Pedido" : "Pedidos"}
						</Text>
					</View>
					<View style={styles.stat}>
						<Text style={styles.statNum}>{stats.units}</Text>
						<Text style={styles.statLabel}>Unidades</Text>
					</View>
					<View
						style={withCollect ? styles.stat : [styles.stat, styles.statLast]}
					>
						<Text style={styles.statNum}>{stats.skus}</Text>
						<Text style={styles.statLabel}>SKUs</Text>
					</View>
					{withCollect ? (
						<View style={[styles.stat, styles.statLast]}>
							<Text style={styles.statNum}>{stats.carriers}</Text>
							<Text style={styles.statLabel}>Transportadoras</Text>
						</View>
					) : null}
				</View>
				{withCollect ? (
					<CollectSection lines={consolidateItems(orders)} />
				) : null}
				{withCollect ? (
					<Text style={styles.sectionLabel}>CONFERÊNCIA POR PEDIDO</Text>
				) : null}
				<ConferenceSection groups={groupByCarrier(orders)} />
				<DocFooter batch={batch} />
			</Page>
		</Document>
	);
}

/** 200 com documento vazio: não vaza existência de pedidos fora do escopo (spec §edge cases). */
export function EmptyPickingListDocument({ batch }: { batch: string }) {
	return (
		<Document title={`Lista de Separação ${batch}`}>
			<Page size="A4" style={styles.page}>
				<View style={styles.emptyWrap}>
					<Text style={styles.emptyText}>
						Nenhum pedido no escopo desta lista.
					</Text>
				</View>
				<DocFooter batch={batch} />
			</Page>
		</Document>
	);
}
