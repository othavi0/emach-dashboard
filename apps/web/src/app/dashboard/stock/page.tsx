import { redirect } from "next/navigation";

export default function StockRedirect() {
	redirect("/dashboard/tools?mode=repor");
}
