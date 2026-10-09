import { env } from '$env/dynamic/private';

export function appPassword(): string {
	return env.APP_PASSWORD ?? '';
}

export function databasePath(): string {
	return env.DATABASE_PATH || 'data/vocab.db';
}

// 세션 쿠키 서명용 (docs/design/2026-10-10-devserver-deploy.md)
export function sessionSecret(): string {
	return env.SESSION_SECRET ?? '';
}

// 없으면 사진 등록만 막힌다 (PRD R-51)
export function openaiApiKey(): string {
	return env.OPENAI_API_KEY ?? '';
}
