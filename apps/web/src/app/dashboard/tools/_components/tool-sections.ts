import type { ComponentType } from "react";

import { FiscalFields } from "./fields/fiscal-fields";
import { IdentityFields } from "./fields/identity-fields";
import { LogisticsFields } from "./fields/logistics-fields";
import { PublishFields } from "./fields/publish-fields";
import { SpecFields } from "./fields/spec-fields";
import type { ToolFieldGroupProps } from "./fields/types";
import { VariantFields } from "./fields/variant-fields";
import type { ToolStepId } from "./tool-form-steps";

export const TOOL_SECTION_COMPONENTS: Record<
	ToolStepId,
	ComponentType<ToolFieldGroupProps>
> = {
	identity: IdentityFields,
	variants: VariantFields,
	specs: SpecFields,
	logistics: LogisticsFields,
	fiscal: FiscalFields,
	publish: PublishFields,
};
