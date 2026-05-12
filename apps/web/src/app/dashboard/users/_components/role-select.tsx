"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";

import { ROLE_LABELS, type Role } from "./role-labels";

interface Props {
	allowedRoles: Role[];
	disabled?: boolean;
	onChange: (next: Role) => void;
	value: Role;
}

export function RoleSelect({ value, onChange, disabled, allowedRoles }: Props) {
	return (
		<Select
			disabled={disabled}
			onValueChange={(v) => onChange(v as Role)}
			value={value}
		>
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{allowedRoles.map((r) => (
					<SelectItem key={r} value={r}>
						{ROLE_LABELS[r]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
