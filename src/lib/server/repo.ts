import type { DatabaseSync } from 'node:sqlite';
import { englishKey, normalizeEnglish, normalizeMeaning } from '$lib/domain/normalize';
import type {
	DaySummary,
	DayWord,
	Draft,
	DraftInput,
	DraftItem,
	DraftSummary,
	ImportInput,
	ImportItem,
	ImportResult,
	Section,
	StudyGroup,
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
	| 'duplicate_word'
	| 'draft_not_found'
	| 'draft_not_ready';

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
	sections: string | null;
};

const SECTIONS: Section[] = ['class', 'mine'];
const SECTION_LABEL: Record<Section, string> = { class: '수업 단어', mine: '내 단어' };

const WORD_COLUMNS = `w.id, w.english, w.meaning, w.pos, w.example, w.example_ko, w.bookmarked, w.hidden,
	(SELECT group_concat(DISTINCT section) FROM day_words WHERE word_id = w.id) AS sections`;

// Day 안 순서와 통합 교재순에서 수업 단어를 내 단어보다 앞에 둔다
const SECTION_RANK = "CASE section WHEN 'class' THEN 0 ELSE 1 END";

function toWord(row: WordRow): Word {
	const sections = row.sections?.split(',') ?? [];
	return {
		id: row.id,
		english: row.english,
		meaning: row.meaning,
		pos: row.pos,
		example: row.example,
		exampleKo: row.example_ko,
		bookmarked: row.bookmarked === 1,
		hidden: row.hidden === 1,
		sections: SECTIONS.filter((s) => sections.includes(s))
	};
}

function toDayWord(row: WordRow & { section: Section }): DayWord {
	return { ...toWord(row), section: row.section };
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

// 그 Day에 속해 있으면 묶음을, 아니면 undefined를 돌려준다
function sectionInDay(db: DatabaseSync, day: number, wordId: number): Section | undefined {
	const row = db
		.prepare('SELECT section FROM day_words WHERE day_number = ? AND word_id = ?')
		.get(day, wordId) as { section: Section } | undefined;
	return row?.section;
}

const NEXT_POSITION = 'SELECT COALESCE(MAX(position), 0) + 1 FROM day_words WHERE day_number = ?';

function appendToDay(db: DatabaseSync, day: number, wordId: number, section: Section) {
	db.prepare(
		`INSERT INTO day_words (day_number, word_id, position, section) SELECT ?, ?, (${NEXT_POSITION}), ?`
	).run(day, wordId, day, section);
}

// 기존 값은 유지하고 빈 칸만 채운다
function fillBlanks(db: DatabaseSync, id: number, item: { pos: string; example: string; exampleKo: string }) {
	db.prepare(
		`UPDATE words SET
		   pos = CASE WHEN pos = '' THEN ? ELSE pos END,
		   example = CASE WHEN example = '' THEN ? ELSE example END,
		   example_ko = CASE WHEN example_ko = '' THEN ? ELSE example_ko END
		 WHERE id = ?`
	).run(item.pos, item.example, item.exampleKo, id);
}

function isSection(value: unknown): value is Section {
	return value === 'class' || value === 'mine';
}

type CleanItem = { english: string; meaning: string; pos: string; example: string; exampleKo: string };

function cleanImport(input: unknown): { day: number; section: Section; words: CleanItem[] } {
	const { day, words, section = 'class' } = (input ?? {}) as Partial<ImportInput>;
	if (!isPositiveInt(day)) throw new RepoError('invalid_request', 'Day 번호는 1 이상의 정수여야 해요.');
	if (!isSection(section)) throw new RepoError('invalid_request', "section은 'class'나 'mine'이어야 해요.");
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
	return { day, section, words: cleaned };
}

export function importDay(db: DatabaseSync, input: ImportInput): ImportResult {
	const clean = cleanImport(input);
	return tx(db, () => importClean(db, clean));
}

// 트랜잭션 없이 실행한다
// 초안 등록이 초안 삭제와 한 트랜잭션으로 묶는다
function importClean(
	db: DatabaseSync,
	{ day, section, words }: { day: number; section: Section; words: CleanItem[] }
): ImportResult {
	const result: ImportResult = { day, created: [], linked: [], skipped: [], moved: [] };

	db.prepare('INSERT OR IGNORE INTO days (number, created_at) VALUES (?, ?)').run(day, now());

	for (const item of words) {
		const existing = findWord(db, item.english, item.meaning);
		const current = existing && sectionInDay(db, day, existing.id);
		if (existing && current === 'mine' && section === 'class') {
			// 종이가 우선한다
			// 내 단어였던 것을 이번 종이 순서 끝의 수업 단어로 옮긴다
			db.prepare(
				`UPDATE day_words SET section = 'class', position = (${NEXT_POSITION})
				 WHERE day_number = ? AND word_id = ?`
			).run(day, day, existing.id);
			fillBlanks(db, existing.id, item);
			result.moved.push(toRef(existing));
			continue;
		}
		if (existing && current) {
			result.skipped.push(toRef(existing));
			continue;
		}
		if (existing) {
			fillBlanks(db, existing.id, item);
			appendToDay(db, day, existing.id, section);
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
		appendToDay(db, day, created.id, section);
		result.created.push({ id: created.id, english: item.english, meaning: item.meaning });
	}
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

export function countStudyableWords(db: DatabaseSync): Record<StudyGroup, number> {
	const row = db
		.prepare(
			`SELECT COUNT(DISTINCT w.id) AS total,
			   COUNT(DISTINCT CASE WHEN dw.section = 'class' THEN w.id END) AS class_n,
			   COUNT(DISTINCT CASE WHEN dw.section = 'mine' THEN w.id END) AS mine_n
			 FROM words w JOIN day_words dw ON dw.word_id = w.id WHERE w.hidden = 0`
		)
		.get() as { total: number; class_n: number; mine_n: number };
	return { all: row.total, class: row.class_n, mine: row.mine_n };
}

const DAY_WORD_SELECT = `SELECT ${WORD_COLUMNS}, dw.section AS section
	FROM day_words dw JOIN words w ON w.id = dw.word_id`;

export function getDayWords(db: DatabaseSync, day: number): DayWord[] | null {
	if (!dayExists(db, day)) return null;
	const rows = db
		.prepare(
			`${DAY_WORD_SELECT} WHERE dw.day_number = ?
			 ORDER BY CASE dw.section WHEN 'class' THEN 0 ELSE 1 END, dw.position`
		)
		.all(day) as (WordRow & { section: Section })[];
	return rows.map(toDayWord);
}

function getDayWord(db: DatabaseSync, day: number, wordId: number): DayWord | null {
	const row = db
		.prepare(`${DAY_WORD_SELECT} WHERE dw.day_number = ? AND dw.word_id = ?`)
		.get(day, wordId) as (WordRow & { section: Section }) | undefined;
	return row ? toDayWord(row) : null;
}

function getWord(db: DatabaseSync, id: number): Word | null {
	const row = db.prepare(`SELECT ${WORD_COLUMNS} FROM words w WHERE w.id = ?`).get(id) as WordRow | undefined;
	return row ? toWord(row) : null;
}

// 통합·북마크 교재순: 단어마다 처음 나온 (Day, 묶음, 위치)
// 묶음을 고르면 그 묶음의 소속만으로 첫 위치를 정한다
function orderedWords(
	db: DatabaseSync,
	where: string,
	group: StudyGroup,
	params: number[] = []
): Word[] {
	const rows = db
		.prepare(
			`SELECT ${WORD_COLUMNS} FROM words w
			 JOIN (SELECT word_id, day_number, ${SECTION_RANK} AS rank, position,
			         ROW_NUMBER() OVER (PARTITION BY word_id ORDER BY day_number, ${SECTION_RANK}, position) AS nth
			       FROM day_words WHERE ? = 'all' OR section = ?) f ON f.word_id = w.id AND f.nth = 1
			 WHERE ${where} ORDER BY f.day_number, f.rank, f.position`
		)
		.all(group, group, ...params) as WordRow[];
	return rows.map(toWord);
}

export function getAllWords(db: DatabaseSync, opts: { includeHidden: boolean; group?: StudyGroup }): Word[] {
	return orderedWords(db, opts.includeHidden ? '1 = 1' : 'w.hidden = 0', opts.group ?? 'all');
}

// alsoId: 북마크를 끈 뒤에도 화면에 남은 행을 카드 보기에 같은 자리로 넣는다
export function getBookmarkedWords(
	db: DatabaseSync,
	opts: { includeHidden: boolean; group?: StudyGroup; alsoId?: number }
): Word[] {
	const marked = opts.alsoId === undefined ? 'w.bookmarked = 1' : '(w.bookmarked = 1 OR w.id = ?)';
	return orderedWords(
		db,
		opts.includeHidden ? marked : `${marked} AND w.hidden = 0`,
		opts.group ?? 'all',
		opts.alsoId === undefined ? [] : [opts.alsoId]
	);
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
): { word: DayWord; result: 'created' | 'linked' } {
	const english = typeof input?.english === 'string' ? normalizeEnglish(input.english) : '';
	const meaning = typeof input?.meaning === 'string' ? normalizeMeaning(input.meaning) : '';
	if (!english || !meaning) throw new RepoError('invalid_request', '영어와 뜻을 모두 입력해 주세요.');

	return tx(db, () => {
		if (!dayExists(db, day)) throw new RepoError('day_not_found', 'Day를 찾을 수 없어요.');
		const existing = findWord(db, english, meaning);
		const current = existing && sectionInDay(db, day, existing.id);
		if (current) {
			throw new RepoError('already_in_day', `이 Day의 ${SECTION_LABEL[current]}에 이미 있어요.`);
		}
		// 앱에서 추가하는 단어는 언제나 내 단어다
		if (existing) {
			// 직접 추가는 다시 외우겠다는 뜻이라 숨김을 푼다
			db.prepare('UPDATE words SET hidden = 0 WHERE id = ?').run(existing.id);
			appendToDay(db, day, existing.id, 'mine');
			return { word: getDayWord(db, day, existing.id)!, result: 'linked' as const };
		}
		const { id } = db
			.prepare(
				`INSERT INTO words (english, english_key, meaning, created_at) VALUES (?, ?, ?, ?) RETURNING id`
			)
			.get(english, englishKey(english), meaning, now()) as { id: number };
		appendToDay(db, day, id, 'mine');
		return { word: getDayWord(db, day, id)!, result: 'created' as const };
	});
}

// Claude가 잘못 넣은 묶음을 바로잡을 때 쓴다
export function setSection(db: DatabaseSync, day: number, wordId: number, section: Section): DayWord {
	if (!isSection(section)) throw new RepoError('invalid_request', "section은 'class'나 'mine'이어야 해요.");
	return tx(db, () => {
		if (!sectionInDay(db, day, wordId)) {
			throw new RepoError('word_not_found', '그 Day에서 단어를 찾을 수 없어요.');
		}
		db.prepare('UPDATE day_words SET section = ? WHERE day_number = ? AND word_id = ?').run(section, day, wordId);
		return getDayWord(db, day, wordId)!;
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

// 사진 등록 초안 (docs/trd/2026-10-09-photo-import.md)

type DraftRow = {
	id: number;
	day_number: number;
	section: Section;
	status: Draft['status'];
	items: string;
	error: string | null;
	created_at: string;
};

const INTERRUPTED = '서버가 다시 시작돼 처리가 멈췄어요. 사진을 다시 올려 주세요.';

function toDraft(row: DraftRow): Draft {
	const items = JSON.parse(row.items) as DraftItem[];
	return {
		id: row.id,
		day: row.day_number,
		section: row.section,
		status: row.status,
		itemCount: items.length,
		error: row.error,
		createdAt: row.created_at,
		items
	};
}

function toSummary({ items: _, ...summary }: Draft): DraftSummary {
	return summary;
}

function draftRow(db: DatabaseSync, id: number): DraftRow {
	const row = db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as DraftRow | undefined;
	if (!row) throw new RepoError('draft_not_found', '초안을 찾을 수 없어요.');
	return row;
}

export function createDraft(
	db: DatabaseSync,
	input: { day: number; section: Section; photoCount: number }
): DraftSummary {
	const at = now();
	const row = db
		.prepare(
			`INSERT INTO drafts (day_number, section, status, photo_count, created_at, updated_at)
			 VALUES (?, ?, 'processing', ?, ?, ?) RETURNING *`
		)
		.get(input.day, input.section, input.photoCount, at, at) as DraftRow;
	return toSummary(toDraft(row));
}

export function getDraft(db: DatabaseSync, id: number): Draft {
	return toDraft(draftRow(db, id));
}

export function listDrafts(db: DatabaseSync): DraftSummary[] {
	const rows = db.prepare('SELECT * FROM drafts ORDER BY created_at, id').all() as DraftRow[];
	return rows.map((r) => toSummary(toDraft(r)));
}

// 등록된 Day와 아직 등록하지 않은 수업 단어 초안 중 가장 큰 번호 + 1 (R-47)
export function nextClassDay(db: DatabaseSync): number {
	const row = db
		.prepare(
			`SELECT MAX(n) AS max FROM (
			   SELECT number AS n FROM days
			   UNION ALL
			   SELECT day_number FROM drafts WHERE section = 'class' AND status IN ('processing', 'ready'))`
		)
		.get() as { max: number | null };
	return (row.max ?? 0) + 1;
}

// 처리 중인 초안만 바꾼다
// 버렸거나 이미 실패한 초안이 되살아나지 않는다
export function finishDraft(db: DatabaseSync, id: number, items: DraftItem[]) {
	db.prepare(
		`UPDATE drafts SET status = 'ready', items = ?, updated_at = ? WHERE id = ? AND status = 'processing'`
	).run(JSON.stringify(items), now(), id);
}

export function failDraft(db: DatabaseSync, id: number, message: string) {
	db.prepare(
		`UPDATE drafts SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'processing'`
	).run(message, now(), id);
}

export function failInterruptedDrafts(db: DatabaseSync): number {
	const result = db
		.prepare(`UPDATE drafts SET status = 'failed', error = ?, updated_at = ? WHERE status = 'processing'`)
		.run(INTERRUPTED, now());
	return Number(result.changes);
}

function isDraftItem(value: unknown): value is DraftItem {
	const v = value as Record<string, unknown> | null;
	return (
		typeof v === 'object' &&
		v !== null &&
		['english', 'meaning', 'pos', 'example', 'exampleKo'].every((k) => typeof v[k] === 'string') &&
		(v.paperEnglish === null || typeof v.paperEnglish === 'string') &&
		typeof v.meaningFilled === 'boolean'
	);
}

// 편집 중이라 빈 영어·뜻을 허용한다
function cleanDraftInput(input: unknown): DraftInput {
	const { day, section, items } = (input ?? {}) as Partial<DraftInput>;
	if (!isPositiveInt(day)) throw new RepoError('invalid_request', 'Day 번호는 1 이상의 정수여야 해요.');
	if (!isSection(section)) throw new RepoError('invalid_request', "section은 'class'나 'mine'이어야 해요.");
	if (!Array.isArray(items) || !items.every(isDraftItem)) {
		throw new RepoError('invalid_request', '단어 목록이 잘못됐어요.');
	}
	const cleaned = items.map((i) => ({
		english: i.english,
		meaning: i.meaning,
		pos: i.pos,
		example: i.example,
		exampleKo: i.exampleKo,
		paperEnglish: i.paperEnglish,
		meaningFilled: i.meaningFilled
	}));
	return { day, section, items: cleaned };
}

function readyRow(db: DatabaseSync, id: number): DraftRow {
	const row = draftRow(db, id);
	if (row.status !== 'ready') throw new RepoError('draft_not_ready', '아직 확인할 수 있는 초안이 아니에요.');
	return row;
}

export function saveDraft(db: DatabaseSync, id: number, input: unknown): Draft {
	const { day, section, items } = cleanDraftInput(input);
	return tx(db, () => {
		readyRow(db, id);
		db.prepare('UPDATE drafts SET day_number = ?, section = ?, items = ?, updated_at = ? WHERE id = ?').run(
			day,
			section,
			JSON.stringify(items),
			now(),
			id
		);
		return getDraft(db, id);
	});
}

// 저장된 items가 아니라 보낸 내용으로 등록한다
// 마지막 저장 요청과 경쟁하지 않는다
export function commitDraft(db: DatabaseSync, id: number, input: unknown): ImportResult {
	const { day, section, items } = cleanDraftInput(input);
	const clean = cleanImport({ day, section, words: items });
	return tx(db, () => {
		readyRow(db, id);
		const result = importClean(db, clean);
		db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
		return result;
	});
}

export function deleteDraft(db: DatabaseSync, id: number) {
	const result = db.prepare('DELETE FROM drafts WHERE id = ?').run(id);
	if (Number(result.changes) === 0) throw new RepoError('draft_not_found', '초안을 찾을 수 없어요.');
}
