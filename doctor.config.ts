// Config do react-doctor (CI advisory em .github/workflows/react-doctor.yml).
export default {
	rules: {
		// A regra só reconhece auth()/getSession()/requireAuth() etc. e não tem
		// opção para helpers custom — não enxerga o requireCapability*/
		// requireCurrentSession do ADR-0016/0018 e marcou 134 actions, das quais
		// 132 eram falsos positivos (auditoria 2026-07-13). O guard de server
		// actions é disciplina própria do repo: apps/web/CLAUDE.md + ADR-0018.
		"react-doctor/server-auth-actions": "off",
		// Auditoria 2026-07-13: os 14 findings eram event handlers e callbacks
		// .then() comuns — nenhum era updater de setState (onde "React may run
		// the updater twice" se aplicaria). O detector confunde qualquer arrow
		// `(next) => { setX(next); ... }` passada a prop/handler com updater.
		"react-doctor/no-impure-state-updater": "off",
	},
};
