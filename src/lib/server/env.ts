import { env } from '$env/dynamic/private';

export function appPassword(): string {
	return env.APP_PASSWORD ?? '';
}

export function databasePath(): string {
	return env.DATABASE_PATH || 'data/vocab.db';
}

// 없으면 사진 등록만 막힌다 (PRD R-51)
export function openaiApiKey(): string {
	return env.OPENAI_API_KEY ?? '';
}
