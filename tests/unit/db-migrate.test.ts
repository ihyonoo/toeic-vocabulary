import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, openDb } from '$lib/server/db';
import { getDayWords } from '$lib/server/repo';

let dir: string | undefined;

afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
	dir = undefined;
});

describe('마이그레이션', () => {
	it('새 DB는 최신 버전이고 소속에 묶음 칸이 있다', () => {
		const db = openDb(':memory:');
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
		const columns = (db.prepare('PRAGMA table_info(day_words)').all() as { name: string }[]).map((c) => c.name);
		expect(columns).toContain('section');
	});

	it('버전 1 DB를 열면 기존 소속이 모두 수업 단어가 되고 순서가 그대로다', () => {
		dir = mkdtempSync(join(tmpdir(), 'vocab-migrate-'));
		const path = join(dir, 'v1.db');
		const v1 = new DatabaseSync(path);
		v1.exec(MIGRATIONS[0]);
		v1.exec('PRAGMA user_version = 1');
		v1.exec(`INSERT INTO days (number, created_at) VALUES (1, 'x');
			INSERT INTO words (id, english, english_key, meaning, created_at) VALUES
			  (1, 'apple', 'apple', '사과', 'x'), (2, 'river', 'river', '강', 'x');
			INSERT INTO day_words (day_number, word_id, position) VALUES (1, 2, 1), (1, 1, 2);`);
		v1.close();

		const db = openDb(path);
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: MIGRATIONS.length });
		expect(
			db.prepare('SELECT word_id, section FROM day_words ORDER BY position').all().map((r) => ({ ...r }))
		).toEqual([
			{ word_id: 2, section: 'class' },
			{ word_id: 1, section: 'class' }
		]);
		expect(getDayWords(db, 1)!.map((w) => `${w.section}:${w.english}`)).toEqual(['class:river', 'class:apple']);
		expect(() =>
			db.prepare("UPDATE day_words SET section = 'other' WHERE word_id = 1").run()
		).toThrow(/CHECK/);
		db.close();
	});

	it('버전 2 DB를 열면 초안 테이블이 생기고 기존 단어는 그대로다', () => {
		dir = mkdtempSync(join(tmpdir(), 'vocab-migrate-'));
		const path = join(dir, 'v2.db');
		const v2 = new DatabaseSync(path);
		v2.exec(MIGRATIONS[0]);
		v2.exec(MIGRATIONS[1]);
		v2.exec('PRAGMA user_version = 2');
		v2.exec(`INSERT INTO days (number, created_at) VALUES (1, 'x');
			INSERT INTO words (id, english, english_key, meaning, created_at) VALUES (1, 'apple', 'apple', '사과', 'x');
			INSERT INTO day_words (day_number, word_id, position, section) VALUES (1, 1, 1, 'mine');`);
		v2.close();

		const db = openDb(path);
		expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 3 });
		expect(getDayWords(db, 1)!.map((w) => `${w.section}:${w.english}`)).toEqual(['mine:apple']);
		expect(db.prepare('SELECT COUNT(*) AS n FROM drafts').get()).toEqual({ n: 0 });
		expect(() =>
			db
				.prepare(
					"INSERT INTO drafts (day_number, section, status, photo_count, created_at, updated_at) VALUES (1, 'class', 'done', 1, 'x', 'x')"
				)
				.run()
		).toThrow(/CHECK/);
		db.close();
	});
});
