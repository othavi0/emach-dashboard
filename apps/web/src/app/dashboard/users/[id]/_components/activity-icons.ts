import {
	Activity,
	Building2,
	CheckCircle2,
	KeyRound,
	type LucideIcon,
	Monitor,
	MonitorOff,
	Pause,
	Pencil,
	Play,
	Trash2,
	Wrench,
	XCircle,
} from "lucide-react";

/** Ícone por tipo de ação, compartilhado pelas views/tabela de atividade e pela prévia do Perfil. */
export const ACTION_ICONS: Record<string, LucideIcon> = {
	"user.approved": CheckCircle2,
	"user.rejected": XCircle,
	"user.updated": Pencil,
	"user.suspended": Pause,
	"user.reactivated": Play,
	"user.deleted": Trash2,
	"user.password_reset_triggered": KeyRound,
	"user.session_revoked": Monitor,
	"user.all_sessions_revoked": MonitorOff,
	"user.branch_linked": Building2,
	"user.branch_unlinked": Building2,
	"tool.created": Wrench,
	"tool.updated": Wrench,
	"tool.deleted": Wrench,
};

export const FALLBACK_ACTION_ICON = Activity;
