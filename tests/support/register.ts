import type { DatabaseSync } from 'node:sqlite';
import type { BaseSection, ImportItem, ImportResult } from '$lib/domain/types';
import { commitDraft, createDraft, finishDraft } from '$lib/server/repo';

// 앱의 등록 경로(사진 초안 등록)로 단어를 넣는다
export function register(
	db: DatabaseSync,
	{ day, section = 'class', words }: { day: number; section?: BaseSection; words: ImportItem[] }
): ImportResult {
	const items = words.map((w) => ({
		english: w.english,
		meaning: w.meaning,
		pos: w.pos ?? '',
		example: w.example ?? '',
		exampleKo: w.exampleKo ?? '',
		paperEnglish: null,
		meaningFilled: false
	}));
	const draft = createDraft(db, { day, section: 'class', photoCount: 1 });
	finishDraft(db, draft.id, items);
	return commitDraft(db, draft.id, { day, section, items });
}
