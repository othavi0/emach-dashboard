import type { ToolFormState } from "../tool-form-state";
import type { ToolFormValues } from "../tool-schema";

export interface ToolFieldGroupProps {
	disabled?: boolean;
	errors: Partial<Record<keyof ToolFormValues, string>>;
	onPatch: (patch: Partial<ToolFormState>) => void;
	values: ToolFormState;
}
