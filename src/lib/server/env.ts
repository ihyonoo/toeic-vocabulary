import { env } from '$env/dynamic/private';

export function appPassword(): string {
	return env.APP_PASSWORD ?? '';
}

export function databasePath(): string {
	return env.DATABASE_PATH || 'data/vocab.db';
}
