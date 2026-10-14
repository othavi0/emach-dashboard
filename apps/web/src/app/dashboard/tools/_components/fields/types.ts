import type { ToolFormState, ToolPatch, ToolUpdate } from "../tool-form-state";
import type { ToolFormValues } from "../tool-schema";

export interface ToolFieldGroupProps {
	disabled?: boolean;
	errors: Partial<Record<keyof ToolFormValues, string>>;
	onPatch: ToolPatch;
	onUpdate: ToolUpdate;
	values: ToolFormState;
}
