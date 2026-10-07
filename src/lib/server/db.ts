import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { databasePath } from './env';

const SCHEMA_V1 = `
CREATE TABLE words (
  id          INTEGER PRIMARY KEY,
  english     TEXT NOT NULL,
  english_key TEXT NOT NULL,
  meaning     TEXT NOT NULL,
  pos         TEXT NOT NULL DEFAULT '',
  example     TEXT NOT NULL DEFAULT '',
  example_ko  TEXT NOT NULL DEFAULT '',
  bookmarked  INTEGER NOT NULL DEFAULT 0,
  hidden      INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  UNIQUE (english_key, meaning)
);
CREATE TABLE days (
  number     INTEGER PRIMARY KEY CHECK (number >= 1),
  created_at TEXT NOT NULL
);
CREATE TABLE day_words (
  day_number INTEGER NOT NULL REFERENCES days(number) ON DELETE CASCADE,
  word_id    INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  PRIMARY KEY (day_number, word_id),
  UNIQUE (day_number, position)
);
CREATE INDEX day_words_word_id ON day_words(word_id);
CREATE TABLE study_logs (
  id         INTEGER PRIMARY KEY,
  day_number INTEGER NOT NULL REFERENCES days(number) ON DELETE CASCADE,
  studied_on TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX study_logs_day ON study_logs(day_number);
`;

// 인덱스 i가 버전 i → i+1 마이그레이션
const MIGRATIONS = [SCHEMA_V1];

function migrate(db: DatabaseSync) {
	const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
	for (let version = row.user_version; version < MIGRATIONS.length; version++) {
		tx(db, () => {
			db.exec(MIGRATIONS[version]);
			db.exec(`PRAGMA user_version = ${version + 1}`);
		});
	}
}

export function openDb(path: string): DatabaseSync {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec('PRAGMA foreign_keys = ON');
	migrate(db);
	return db;
}

export function tx<T>(db: DatabaseSync, fn: () => T): T {
	db.exec('BEGIN');
	try {
		const result = fn();
		db.exec('COMMIT');
		return result;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

let instance: DatabaseSync | undefined;

// 빌드 분석 단계에서 DB 파일이 생기지 않도록 처음 쓸 때 연다
export function getDb(): DatabaseSync {
	instance ??= openDb(databasePath());
	return instance;
}
