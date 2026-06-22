import { getToolsForQuote } from "../../../data";
import { PreviewForm } from "./preview-form";

interface Props {
	carrierId: string;
}

export async function CarrierPreviewTab({ carrierId }: Props) {
	const tools = await getToolsForQuote();

	return <PreviewForm carrierId={carrierId} tools={tools} />;
}
