import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

const FONTS_DIR = path.join(process.cwd(), "public/fonts/pdf");

/** Idempotente: Font.register global do react-pdf, chamado uma vez por processo. */
export function registerPdfFonts(): void {
	if (registered) {
		return;
	}
	registered = true;
	Font.register({
		family: "Barlow",
		fonts: [
			{ src: path.join(FONTS_DIR, "Barlow-Regular.ttf"), fontWeight: 400 },
			{ src: path.join(FONTS_DIR, "Barlow-Medium.ttf"), fontWeight: 500 },
			{ src: path.join(FONTS_DIR, "Barlow-SemiBold.ttf"), fontWeight: 600 },
		],
	});
	Font.register({
		family: "Barlow Condensed",
		fonts: [
			{
				src: path.join(FONTS_DIR, "BarlowCondensed-SemiBold.ttf"),
				fontWeight: 600,
			},
			{
				src: path.join(FONTS_DIR, "BarlowCondensed-Bold.ttf"),
				fontWeight: 700,
			},
		],
	});
	Font.register({
		family: "IBM Plex Mono",
		fonts: [
			{ src: path.join(FONTS_DIR, "IBMPlexMono-Regular.ttf"), fontWeight: 400 },
			{
				src: path.join(FONTS_DIR, "IBMPlexMono-SemiBold.ttf"),
				fontWeight: 600,
			},
		],
	});
	// Desliga hifenização (nomes de produto quebrados por hífen leem mal em picking list).
	Font.registerHyphenationCallback((word) => [word]);
}
