import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { InviteEmail } from "../invite";

describe("InviteEmail", () => {
	it("renderiza HTML com o link de aceite e o convidante", async () => {
		const html = await render(
			<InviteEmail
				acceptUrl="https://x/convite?token=abc"
				inviterName="Maria"
			/>
		);
		expect(html).toContain("https://x/convite?token=abc");
		expect(html).toContain("Maria");
		expect(html).toContain("Criar acesso");
	});
});
