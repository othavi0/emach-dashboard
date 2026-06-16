import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Estoque",
};

export default function StockRedirect() {
	redirect("/dashboard/tools?mode=repor");
}
