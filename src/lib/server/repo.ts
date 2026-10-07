import type { DatabaseSync } from 'node:sqlite';
import { englishKey, normalizeEnglish, normalizeMeaning } from '$lib/domain/normalize';
import type {
	DaySummary,
	ImportInput,
	ImportItem,
	ImportResult,
	Word,
	WordPatch,
	WordRef
} from '$lib/domain/types';
import { tx } from './db';

export type RepoErrorCode =
	| 'invalid_request'
	| 'day_not_found'
	| 'word_not_found'
	| 'already_in_day'
	| 'duplicate_word';

export class RepoError extends Error {
	constructor(
		public code: RepoErrorCode,
		message: string
	) {
		super(message);
	}
}

type WordRow = {
	id: number;
	english: string;
	meaning: string;
	pos: string;
	example: string;
	example_ko: string;
	bookmarked: number;
	hidden: number;
};

const WORD_COLUMNS = 'w.id, w.english, w.meaning, w.pos, w.example, w.example_ko, w.bookmarked, w.hidden';

function toWord(row: WordRow): Word {
	return {
		id: row.id,
		english: row.english,
		meaning: row.meaning,
		pos: row.pos,
		example: row.example,
		exampleKo: row.example_ko,
		bookmarked: row.bookmarked === 1,
		hidden: row.hidden === 1
	};
}

function toRef(word: { id: number; english: string; meaning: string }): WordRef {
	return { id: word.id, english: word.english, meaning: word.meaning };
}

function now(): string {
	return new Date().toISOString();
}

function isPositiveInt(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function dayExists(db: DatabaseSync, day: number): boolean {
	return db.prepare('SELECT 1 FROM days WHERE number = ?').get(day) !== undefined;
}

function findWord(db: DatabaseSync, english: string, meaning: string): WordRow | undefined {
	return db
		.prepare(`SELECT ${WORD_COLUMNS} FROM words w WHERE w.english_key = ? AND w.meaning = ?`)
		.get(englishKey(english), normalizeMeaning(meaning)) as WordRow | undefined;
}

function isInDay(db: DatabaseSync, day: number, wordId: number): boolean {
	return (
		db.prepare('SELECT 1 FROM day_words WHERE day_number = ? AND word_id = ?').get(day, wordId) !==
		undefined
	);
}

function appendToDay(db: DatabaseSync, day: number, wordId: number) {
	db.prepare(
		`INSERT INTO day_words (day_number, word_id, position)
		 SELECT ?, ?, COALESCE(MAX(position), 0) + 1 FROM day_words WHERE day_number = ?`
	).run(day, wordId, day);
}

type CleanItem = { english: string; meaning: string; pos: string; example: string; exampleKo: string };

function cleanImport(input: unknown): { day: number; words: CleanItem[] } {
	const { day, words } = (input ?? {}) as Partial<ImportInput>;
	if (!isPositiveInt(day)) throw new RepoError('invalid_request', 'Day 번호는 1 이상의 정수여야 해요.');
	if (!Array.isArray(words) || words.length === 0) {
		throw new RepoError('invalid_request', '단어 목록이 비어 있어요.');
	}

	const bad: number[] = [];
	const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
	const cleaned = words.map((item: ImportItem, index) => {
		const optional = [item?.pos, item?.example, item?.exampleKo];
		const english = typeof item?.english === 'string' ? normalizeEnglish(item.english) : '';
		const meaning = typeof item?.meaning === 'string' ? normalizeMeaning(item.meaning) : '';
		if (!english || !meaning || optional.some((v) => v !== undefined && typeof v !== 'string')) {
			bad.push(index);
		}
		return {
			english,
			meaning,
			pos: text(item?.pos),
			example: text(item?.example),
			exampleKo: text(item?.exampleKo)
		};
	});
	if (bad.length > 0) {
		throw new RepoError('invalid_request', `잘못된 항목이 있어요 (인덱스: ${bad.join(', ')}).`);
	}
	return { day, words: cleaned };
}

export function importDay(db: DatabaseSync, input: ImportInput): ImportResult {
	const { day, words } = cleanImport(input);
	const result: ImportResult = { day, created: [], linked: [], skipped: [] };

	tx(db, () => {
		db.prepare('INSERT OR IGNORE INTO days (number, created_at) VALUES (?, ?)').run(day, now());

		for (const item of words) {
			const existing = findWord(db, item.english, item.meaning);
			if (existing && isInDay(db, day, existing.id)) {
				result.skipped.push(toRef(existing));
				continue;
			}
			if (existing) {
				// 기존 값은 유지하고 빈 칸만 채운다
				db.prepare(
					`UPDATE words SET
					   pos = CASE WHEN pos = '' THEN ? ELSE pos END,
					   example = CASE WHEN example = '' THEN ? ELSE example END,
					   example_ko = CASE WHEN example_ko = '' THEN ? ELSE example_ko END
					 WHERE id = ?`
				).run(item.pos, item.example, item.exampleKo, existing.id);
				appendToDay(db, day, existing.id);
				result.linked.push(toRef(existing));
				continue;
			}
			const created = db
				.prepare(
					`INSERT INTO words (english, english_key, meaning, pos, example, example_ko, created_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`
				)
				.get(
					item.english,
					englishKey(item.english),
					item.meaning,
					item.pos,
					item.example,
					item.exampleKo,
					now()
				) as { id: number };
			appendToDay(db, day, created.id);
			result.created.push({ id: created.id, english: item.english, meaning: item.meaning });
		}
	});
	return result;
}

export function listDays(db: DatabaseSync): DaySummary[] {
	return db
		.prepare(
			`SELECT d.number,
			   (SELECT COUNT(*) FROM day_words WHERE day_number = d.number) AS wordCount,
			   (SELECT COUNT(*) FROM study_logs WHERE day_number = d.number) AS studyCount,
			   (SELECT MAX(studied_on) FROM study_logs WHERE day_number = d.number) AS lastStudiedOn
			 FROM days d ORDER BY d.number`
		)
		.all() as DaySummary[];
}

export function countStudyableWords(db: DatabaseSync): number {
	const row = db
		.prepare(
			`SELECT COUNT(DISTINCT w.id) AS n FROM words w
			 JOIN day_words dw ON dw.word_id = w.id WHERE w.hidden = 0`
		)
		.get() as { n: number };
	return row.n;
}

export function getDayWords(db: DatabaseSync, day: number): Word[] | null {
	if (!dayExists(db, day)) return null;
	const rows = db
		.prepare(
			`SELECT ${WORD_COLUMNS} FROM day_words dw JOIN words w ON w.id = dw.word_id
			 WHERE dw.day_number = ? ORDER BY dw.position`
		)
		.all(day) as WordRow[];
	return rows.map(toWord);
}

function getWord(db: DatabaseSync, id: number): Word | null {
	const row = db.prepare(`SELECT ${WORD_COLUMNS} FROM words w WHERE w.id = ?`).get(id) as WordRow | undefined;
	return row ? toWord(row) : null;
}

// 통합·북마크 교재순: 단어마다 처음 나온 (Day, 위치)
function orderedWords(db: DatabaseSync, where: string): Word[] {
	const rows = db
		.prepare(
			`SELECT ${WORD_COLUMNS} FROM words w
			 JOIN (SELECT word_id, day_number, position,
			         ROW_NUMBER() OVER (PARTITION BY word_id ORDER BY day_number, position) AS nth
			       FROM day_words) f ON f.word_id = w.id AND f.nth = 1
			 WHERE ${where} ORDER BY f.day_number, f.position`
		)
		.all() as WordRow[];
	return rows.map(toWord);
}

export function getAllWords(db: DatabaseSync, opts: { includeHidden: boolean }): Word[] {
	return orderedWords(db, opts.includeHidden ? '1 = 1' : 'w.hidden = 0');
}

export function getBookmarkedWords(db: DatabaseSync, opts: { includeHidden: boolean }): Word[] {
	return orderedWords(db, opts.includeHidden ? 'w.bookmarked = 1' : 'w.bookmarked = 1 AND w.hidden = 0');
}

const TEXT_FIELDS = { english: 'english', meaning: 'meaning', pos: 'pos', example: 'example', exampleKo: 'example_ko' } as const;
const FLAG_FIELDS = { bookmarked: 'bookmarked', hidden: 'hidden' } as const;

export function updateWord(db: DatabaseSync, id: number, patch: WordPatch): Word {
	const entries = Object.entries(patch ?? {});
	if (entries.length === 0) throw new RepoError('invalid_request', '고칠 내용이 없어요.');

	const sets: Record<string, string | number> = {};
	for (const [key, value] of entries) {
		// in은 프로토타입 속성(toString 등)까지 통과시키므로 자기 속성만 본다
		if (Object.hasOwn(TEXT_FIELDS, key) && typeof value === 'string') {
			sets[TEXT_FIELDS[key as keyof typeof TEXT_FIELDS]] =
				key === 'english' ? normalizeEnglish(value) : key === 'meaning' ? normalizeMeaning(value) : value.trim();
		} else if (Object.hasOwn(FLAG_FIELDS, key) && typeof value === 'boolean') {
			sets[FLAG_FIELDS[key as keyof typeof FLAG_FIELDS]] = value ? 1 : 0;
		} else {
			throw new RepoError('invalid_request', '고칠 내용이 잘못됐어요.');
		}
	}
	if (sets.english === '' || sets.meaning === '') {
		throw new RepoError('invalid_request', '영어와 뜻은 비워 둘 수 없어요.');
	}

	return tx(db, () => {
		const current = getWord(db, id);
		if (!current) throw new RepoError('word_not_found', '단어를 찾을 수 없어요.');
		if ('english' in sets || 'meaning' in sets) {
			const english = (sets.english as string | undefined) ?? current.english;
			const meaning = (sets.meaning as string | undefined) ?? current.meaning;
			const other = findWord(db, english, meaning);
			if (other && other.id !== id) {
				throw new RepoError('duplicate_word', `이미 있는 단어예요: ${other.english} [${other.meaning}]`);
			}
			sets.english_key = englishKey(english);
		}
		const columns = Object.keys(sets);
		db.prepare(`UPDATE words SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
			...columns.map((c) => sets[c]),
			id
		);
		return getWord(db, id)!;
	});
}

export function deleteWord(db: DatabaseSync, id: number): boolean {
	return db.prepare('DELETE FROM words WHERE id = ?').run(id).changes > 0;
}

export function deleteDay(db: DatabaseSync, day: number): { deletedWords: number } | null {
	return tx(db, () => {
		if (!dayExists(db, day)) return null;
		db.prepare('DELETE FROM days WHERE number = ?').run(day);
		const orphans = db
			.prepare('DELETE FROM words WHERE id NOT IN (SELECT word_id FROM day_words)')
			.run();
		return { deletedWords: Number(orphans.changes) };
	});
}

export function addWordToDay(
	db: DatabaseSync,
	day: number,
	input: { english: string; meaning: string }
): { word: Word; result: 'created' | 'linked' } {
	const english = typeof input?.english === 'string' ? normalizeEnglish(input.english) : '';
	const meaning = typeof input?.meaning === 'string' ? normalizeMeaning(input.meaning) : '';
	if (!english || !meaning) throw new RepoError('invalid_request', '영어와 뜻을 모두 입력해 주세요.');

	return tx(db, () => {
		if (!dayExists(db, day)) throw new RepoError('day_not_found', 'Day를 찾을 수 없어요.');
		const existing = findWord(db, english, meaning);
		if (existing && isInDay(db, day, existing.id)) {
			throw new RepoError('already_in_day', '이 Day에 이미 있는 단어예요.');
		}
		if (existing) {
			// 직접 추가는 다시 외우겠다는 뜻이라 숨김을 푼다
			db.prepare('UPDATE words SET hidden = 0 WHERE id = ?').run(existing.id);
			appendToDay(db, day, existing.id);
			return { word: getWord(db, existing.id)!, result: 'linked' as const };
		}
		const { id } = db
			.prepare(
				`INSERT INTO words (english, english_key, meaning, created_at) VALUES (?, ?, ?, ?) RETURNING id`
			)
			.get(english, englishKey(english), meaning, now()) as { id: number };
		appendToDay(db, day, id);
		return { word: getWord(db, id)!, result: 'created' as const };
	});
}

const SEOUL_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });

export function recordStudy(
	db: DatabaseSync,
	day: number,
	at: Date
): { studyCount: number; lastStudiedOn: string } | null {
	return tx(db, () => {
		if (!dayExists(db, day)) return null;
		db.prepare('INSERT INTO study_logs (day_number, studied_on, created_at) VALUES (?, ?, ?)').run(
			day,
			SEOUL_DATE.format(at),
			at.toISOString()
		);
		const summary = listDays(db).find((d) => d.number === day)!;
		return { studyCount: summary.studyCount, lastStudiedOn: summary.lastStudiedOn! };
	});
}
