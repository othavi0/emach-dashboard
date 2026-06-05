import type { ToolFormState, ToolPatch } from "../tool-form-state";
import type { ToolFormValues } from "../tool-schema";

export interface ToolFieldGroupProps {
	disabled?: boolean;
	errors: Partial<Record<keyof ToolFormValues, string>>;
	onPatch: ToolPatch;
	values: ToolFormState;
}
