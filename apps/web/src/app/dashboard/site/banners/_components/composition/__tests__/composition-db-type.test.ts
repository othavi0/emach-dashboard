import type { BannerCompositionData } from "@emach/db/schema/banner";
import { describe, expectTypeOf, it } from "vitest";
import type { BannerComposition } from "../composition-schema";

describe("BannerCompositionData espelha o compositionSchema", () => {
	it("o tipo do banco e o inferido do zod são o mesmo nos dois sentidos", () => {
		expectTypeOf<BannerCompositionData>().toEqualTypeOf<BannerComposition>();
	});
});
