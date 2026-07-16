import { ean13Bars, isValidEan13 } from "@/lib/ean13";

interface BarcodeEan13Props {
	className?: string;
	code: string;
	height?: number;
}

/**
 * Barras EAN-13 em SVG (95 módulos de largura lógica). Retorna null para
 * código fora do formato — o consumidor exibe o número em mono sem barras.
 */
export function BarcodeEan13({
	code,
	height = 40,
	className,
}: BarcodeEan13Props) {
	if (!isValidEan13(code)) {
		return null;
	}
	return (
		<svg
			aria-label={`Código de barras ${code}`}
			className={className}
			height={height}
			preserveAspectRatio="none"
			role="img"
			viewBox={`0 0 95 ${height}`}
			width="100%"
		>
			{ean13Bars(code).map((bar) => (
				<rect
					className="fill-foreground"
					height={height}
					key={bar.x}
					width={bar.w}
					x={bar.x}
					y={0}
				/>
			))}
		</svg>
	);
}
