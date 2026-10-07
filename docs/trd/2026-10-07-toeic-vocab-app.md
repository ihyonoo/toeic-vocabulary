# TRD: 토익 학원 단어장 웹앱 MVP

- 작성일: 2026-10-07
- 상태: 확정 (spec-review 1회, 코드 리뷰 1회 반영)
- PRD: `docs/prd/2026-10-07-toeic-vocab-app.md`

## 1. 개요

- 이 문서는 PRD의 R-1~R-44 전부를 다룬다.
- **앱 구성:** SvelteKit 2 앱 하나를 Node 서버(adapter-node)로 실행한다.
  - 화면은 클라이언트에서 렌더링한다(`ssr = false`). 데이터는 서버 `load`와 JSON API로 받는다.
- **저장소:** 데이터는 Node 내장 SQLite(`node:sqlite`) 파일 하나에 둔다. 단어와 Day는 다대다 관계다.
- **설계 원칙:** 학습 진행(바퀴, 섞기, 이전·다음, 숨기기)과 같은 단어 판정은 프레임워크와 무관한 순수 함수로 분리해 단위 테스트로 고정한다.
- **등록 경로:** Claude(Mac의 Claude Code)와 화면이 같은 API를 쓴다. Claude는 Bearer 토큰으로, 화면은 로그인 쿠키로 인증한다.

## 2. 아키텍처

```
아이폰 Safari / 홈 화면 앱 ─┐
                            ├─HTTP─▶ hooks.server.ts (init: 환경 변수 검사 / handle: 인증)
Mac의 Claude Code (curl) ───┘              │
                                 ┌─────────┴──────────┐
                          routes/**/+page.server.ts   routes/api/**/+server.ts
                          (화면 데이터 load)           (JSON 조회·변경)
                                 └─────────┬──────────┘
                                   $lib/server/repo.ts ── $lib/domain/normalize.ts
                                           │
                                   $lib/server/db.ts (node:sqlite, 처음 쓸 때 연다) ── data/vocab.db

브라우저: 화면 컴포넌트 ── $lib/domain/session.ts (학습 진행, 순수 함수)
                       ── $lib/client/prefs.svelte.ts (보기 모드·학습 설정, localStorage)
                       ── $lib/client/api.ts (fetch 래퍼)
```

### 디렉터리

```
package.json, svelte.config.js, vite.config.ts, tsconfig.json,
playwright.config.ts, .env.example, README.md
src/
  app.html                       아이폰 메타 태그, manifest 링크
  app.css                        색 토큰, 공통 버튼 스타일, 움직임 줄이기 설정
  hooks.server.ts                init(환경 변수 검사), handle(API 인증)
  lib/
    domain/types.ts              Word, DaySummary, Order, Repeat, ViewMode 등
    domain/normalize.ts          R-2 정규화
    domain/format.ts             Day 표기, MM-DD
    domain/session.ts            학습 세션 상태 기계 (R-25~R-37)
    server/env.ts                $env/dynamic/private에서 APP_PASSWORD, DATABASE_PATH 읽기
    server/db.ts                 getDb(): 처음 호출 때 열고 스키마 적용, tx(): 트랜잭션
    server/repo.ts               조회·변경 함수
    server/auth.ts               쿠키 서명·검증, Bearer 확인, next 경로 검사
    server/http.ts               JSON 응답·에러 헬퍼, 요청 검증
    client/api.ts                화면용 API 호출
    client/prefs.svelte.ts       보기 모드, 마지막 학습 설정
    client/flags.ts              북마크·숨김 토글 요청 줄 세우기
    client/toast.svelte.ts       토스트 상태
    client/wakeLock.ts           화면 꺼짐 방지 (R-40)
    components/                  WordList, WordRow, MaskCell, ViewModeButton, PageHeader,
                                 BottomSheet, StudySheet, WordFormSheet, StudyCard, Toast
    components/gesture.ts        제스처 임계값과 카드 넘김 시간 상수
  routes/
    +layout.ts                   ssr = false
    +layout.svelte               app.css 적용, 토스트
    +error.svelte                404·400 이유와 [홈으로]
    login/                       로그인 화면 (R-42)
    (app)/+layout.server.ts      화면 인증 (미인증이면 /login으로)
    (app)/+page.svelte / .server.ts    홈 (R-10~R-14)
    (app)/days/[n]/              Day 단어 목록 (R-15~R-23)
    (app)/bookmarks/             북마크 목록 (R-24)
    (app)/study/                 학습 (R-25~R-40)
    api/login/+server.ts         POST 로그인
    api/days/+server.ts          GET 목록 (R-5), POST 등록 (R-4)
    api/days/[n]/+server.ts      DELETE (R-8)
    api/days/[n]/words/+server.ts       POST 단어 추가 (R-22)
    api/days/[n]/study-log/+server.ts   POST 학습 기록 (R-13)
    api/words/[id]/+server.ts    PATCH 수정·북마크·숨김, DELETE 삭제
static/
  manifest.webmanifest, icons/   홈 화면 앱 (R-43)
tests/
  unit/                          vitest
  e2e/                           Playwright
```

npm 스크립트: `dev`(`vite dev --host`), `build`, `start`(`node --env-file=.env build`), `check`(svelte-check), `test:unit`(vitest run), `test:e2e`(playwright test).

### 주요 흐름

- **화면 진입:** `+page.server.ts`의 `load`가 repo에서 읽는다. 화면은 받은 데이터를 로컬 상태(`$state`)로 들고 있다.
- **화면에서 변경:** 4장 "화면 변경 처리" 표를 따른다.
- **학습**
  - 진입: `/study`의 `load`가 범위의 단어 중 숨기지 않은 것을 교재순으로 넘긴다.
  - 진행: 클라이언트가 `session.ts`로 바퀴·위치를 계산한다.
  - 기록: Day 학습에서 첫 바퀴가 끝났다고 처음 판정되면 학습 기록 API를 한 번 호출한다.
- **Claude 등록:** 9장 "등록 절차"를 따른다.

## 3. 데이터 모델

SQLite. 외래 키를 켜고(`PRAGMA foreign_keys = ON`), 저널은 기본값(rollback journal)을 쓴다.

- WAL은 쓰지 않는다. 사용자 한 명이라 동시성 이득이 없다.
- 이렇게 하면 서버가 쉬고 있을 때 DB 파일 하나만 복사해도 이관이 된다.

```sql
CREATE TABLE words (
  id          INTEGER PRIMARY KEY,
  english     TEXT NOT NULL,              -- 정규화된 철자 (대소문자는 입력 그대로)
  english_key TEXT NOT NULL,              -- 소문자 철자, 같은 단어 판정용
  meaning     TEXT NOT NULL,              -- 정규화된 뜻
  pos         TEXT NOT NULL DEFAULT '',
  example     TEXT NOT NULL DEFAULT '',
  example_ko  TEXT NOT NULL DEFAULT '',
  bookmarked  INTEGER NOT NULL DEFAULT 0, -- 0/1
  hidden      INTEGER NOT NULL DEFAULT 0, -- 0/1
  created_at  TEXT NOT NULL,              -- ISO 8601 UTC
  UNIQUE (english_key, meaning)           -- R-2
);

CREATE TABLE days (
  number     INTEGER PRIMARY KEY CHECK (number >= 1),
  created_at TEXT NOT NULL
);

CREATE TABLE day_words (
  day_number INTEGER NOT NULL REFERENCES days(number) ON DELETE CASCADE,
  word_id    INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,                 -- Day 안 교재순
  PRIMARY KEY (day_number, word_id),
  UNIQUE (day_number, position)
);
CREATE INDEX day_words_word_id ON day_words(word_id);

CREATE TABLE study_logs (                      -- R-13, S-5 판정 근거
  id         INTEGER PRIMARY KEY,
  day_number INTEGER NOT NULL REFERENCES days(number) ON DELETE CASCADE,
  studied_on TEXT NOT NULL,                    -- 'YYYY-MM-DD', 서울 시간
  created_at TEXT NOT NULL
);
CREATE INDEX study_logs_day ON study_logs(day_number);
```

- **빈 값 표현:** 선택 칸(품사, 예문, 해석)이 비면 빈 문자열이다. R-4의 "비어 있는 칸만 채운다"는 `= ''` 검사다.
- **위치:** 새 위치는 `COALESCE(MAX(position), 0) + 1`이다. 삭제해도 번호를 다시 매기지 않는다. 그래서 위치에 빈 번호가 생길 수 있다.
- **교재순:**
  - Day 안: `position` 오름차순이다.
  - 통합·북마크(R-39): 단어마다 가장 작은 `(day_number, position)`을 구하고, 그 값으로 정렬한다.
- **학습 기록 집계:** `DaySummary.studyCount`는 그 Day의 `study_logs` 행 수다. `lastStudiedOn`은 `MAX(studied_on)`이다.
- **스키마 버전:** `PRAGMA user_version`으로 관리한다.
  - 이번은 1이다. `getDb()`가 처음 열 때 0이면 위 스키마를 만들고 1로 올린다.
  - 다음 변경은 `db.ts`의 `MIGRATIONS` 배열에 버전별 SQL을 추가하고, 순서대로 적용한다.
- **고아 단어:** `ON DELETE CASCADE`는 `day_words`만 지운다. Day 삭제(R-8) 뒤 어느 Day에도 없는 단어는 repo가 같은 트랜잭션에서 지운다.
- **DB 파일:** `DATABASE_PATH`(기본 `data/vocab.db`)다. `data/`는 git에서 제외한다(R-44).
- **트랜잭션:** `node:sqlite`에는 트랜잭션 헬퍼가 없다. `db.ts`의 `tx(fn)`이 `BEGIN` → `fn` → `COMMIT`을 실행하고, 예외가 나면 `ROLLBACK`한다. 여러 문장을 실행하는 repo 함수(`importDay`, `deleteDay`, `addWordToDay`, `updateWord`, `recordStudy`)는 모두 `tx`로 감싼다.

### 정규화 (R-2)

뜻 정규화는 아래 순서로 적용한다.

1. 연속 공백(`\s+`)을 공백 하나로 바꾼다.
2. `\s*([,;])\s*`을 `$1 `로 바꾼다.
3. 앞뒤 공백을 지운다.

| 대상 | 규칙 |
|---|---|
| 철자 저장값 | 1단계와 3단계 |
| 철자 키 | 저장값을 소문자로 바꾼 것 |
| 뜻 저장값·비교값 | 1~3단계 |
| 선택 칸 (품사, 예문, 해석) | 앞뒤 공백 제거 |
| 같은 단어 판정 | `(english_key, meaning)` 쌍. `words`의 `UNIQUE`가 보장한다 |

- "빈 값"은 정규화한 뒤의 빈 문자열이다. 공백만 있는 입력도 빈 값이다.

## 4. 인터페이스

### 공통

- **환경 변수 읽기:** `env.ts`는 `$env/dynamic/private`에서 읽는다.
  - 개발(`vite dev`)에서는 Vite가 `.env`를 이 모듈에 넣는다.
  - 실행(`node --env-file=.env build`)에서는 `process.env`가 이 모듈에 들어온다.
- **시작 시 검사:** `hooks.server.ts`의 `init`에서 `APP_PASSWORD`와 `ORIGIN`(빌드 실행 때만)이 없으면 예외를 던져 서버 시작을 멈춘다.
  - 빌드 분석 단계(`building`)에는 검사도 DB 열기도 하지 않는다.
- **인증:** 유효한 세션 쿠키 또는 `Authorization: Bearer <APP_PASSWORD>`가 있어야 한다. `handle`이 판정해 `locals.authed`에 담는다.
  - API: `handle`이 막는다. 매칭된 API 라우트(`/api/login` 제외)에 대한 미인증 요청은 `401`이다. 매칭되는 라우트가 없는 경로는 `404`다.
    - 판정은 원문 경로가 아니라 매칭된 라우트(`event.route.id`)로 한다. 원문 경로는 `/%61pi/days`처럼 퍼센트 인코딩으로 검사를 우회하기 때문이다.
  - 화면: `(app)/+layout.server.ts`의 `load`가 막는다. 미인증이면 `303 /login?next=<경로+쿼리>`다.
    - `ssr = false`라 문서 요청은 빈 셸을 받고, 리다이렉트는 뒤따르는 데이터 요청에서 일어난다.
    - 보호할 새 화면은 `(app)` 그룹 안에 둔다.
  - 정적 파일(`/manifest.webmanifest`, `/icons/*`, `/_app/*`)은 adapter-node가 hooks 전에 처리한다.
  - Bearer는 모든 API를 호출할 수 있다. 화면과 Claude가 같은 API를 쓰는 의도된 범위다.
- **비교:** 비밀번호·Bearer·쿠키는 HMAC-SHA256 다이제스트(32바이트)끼리 `crypto.timingSafeEqual`로 비교한다. 입력 길이와 무관하게 예외 없이 비교하기 위해서다.
- **세션 쿠키 `vocab_session`**
  - 값: `HMAC-SHA256(key=APP_PASSWORD, "vocab-session-v1")`의 hex.
  - 속성: `httpOnly`, `sameSite=lax`, `path=/`, `maxAge=365일`.
  - `secure`: `event.url.protocol === 'https:'`일 때만 켠다. 빌드 실행에서는 `ORIGIN`이 프로토콜을 정한다.
  - 비밀번호를 바꾸면 기존 쿠키는 모두 무효가 된다.
- **CSRF**
  - 로그인은 폼 액션이 아니라 JSON API(`POST /api/login`)다. 그래서 SvelteKit 폼 출처 검사의 대상이 아니다.
  - 교차 사이트 요청은 두 가지로 막는다.
    - 쿠키가 `sameSite=lax`라서 다른 사이트의 POST·PATCH·DELETE에는 쿠키가 실리지 않는다.
    - 본문이 있는 요청은 `content-type: application/json`만 받는다(아니면 `415`). CORS 단순 요청 형식(`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`)은 그보다 먼저 SvelteKit 출처 검사가 `403`으로 막는다. 본문이 없는 요청(`DELETE`, `study-log` POST)에는 이 헤더를 요구하지 않는다.
- **에러 형식:** `{ "error": { "code": string, "message": string } }`. `message`는 화면에 그대로 띄울 한국어 문장이다.
- **경로 파라미터:** `{n}`·`{id}`가 1 이상의 정수가 아니면 `400 invalid_request`다.

### 타입 (`$lib/domain/types.ts`)

```ts
type Word = {
  id: number; english: string; meaning: string;
  pos: string; example: string; exampleKo: string;
  bookmarked: boolean; hidden: boolean;
};
type DaySummary = {
  number: number;
  wordCount: number;          // day_words 행 수, 숨긴 단어 포함 (R-14)
  studyCount: number;         // study_logs 행 수
  lastStudiedOn: string | null;  // 'YYYY-MM-DD'
};
type WordRef = { id: number; english: string; meaning: string };
type ImportItem = { english: string; meaning: string; pos?: string; example?: string; exampleKo?: string };
type ImportInput = { day: number; words: ImportItem[] };
type ImportResult = { day: number; created: WordRef[]; linked: WordRef[]; skipped: WordRef[] };
type WordPatch = Partial<Pick<Word, 'english' | 'meaning' | 'pos' | 'example' | 'exampleKo' | 'bookmarked' | 'hidden'>>;
type Order = 'textbook' | 'random' | 'alpha';
type Repeat = 1 | 2 | 3 | 'loop';
type ViewMode = 'both' | 'english' | 'meaning';
type StudyScope = 'day' | 'all' | 'bookmarks';
```

### API

| 메서드·경로 | 요청 | 성공 응답 | 에러 |
|---|---|---|---|
| `POST /api/login` (R-42) | `{ password, next? }` | `200 { next }` + 쿠키 설정 | 400 `wrong_password` ("비밀번호가 맞지 않아요"), 415 |
| `GET /api/days` (R-5) | — | `200 { days: DaySummary[] }` (번호 오름차순) | 401 |
| `POST /api/days` (R-4) | `ImportInput` | `200 ImportResult` | 400 `invalid_request`, 401, 415 |
| `DELETE /api/days/{n}` (R-8) | — | `200 { day, deletedWords: number }` | 400, 401, 404 `day_not_found` |
| `POST /api/days/{n}/words` (R-22) | `{ english, meaning }` | `201 { word: Word, result: 'created' \| 'linked' }` | 400 `invalid_request`, 401, 404 `day_not_found`, 409 `already_in_day`, 415 |
| `POST /api/days/{n}/study-log` (R-13) | — | `200 { studyCount, lastStudiedOn }` | 400, 401, 404 `day_not_found` |
| `PATCH /api/words/{id}` (R-7, R-19, R-20, R-21, R-34, R-35) | `WordPatch` (최소 한 칸) | `200 { word: Word }` | 400 `invalid_request`, 401, 404 `word_not_found`, 409 `duplicate_word`, 415 |
| `DELETE /api/words/{id}` (R-21) | — | `204` | 400, 401, 404 `word_not_found` |

- **`POST /api/days` 검증:** 아래 중 하나라도 어기면 `400 invalid_request`이고, 아무것도 저장하지 않는다. 문제 항목의 인덱스를 `message`에 담는다.
  - `day`는 1 이상의 안전한 정수(`Number.isSafeInteger`)다.
  - `words`는 비어 있지 않은 배열이다.
  - 각 항목의 `english`·`meaning`은 문자열이고, 정규화한 뒤 비어 있지 않다.
  - 선택 칸은 없거나 문자열이다.
- **`POST /api/days`의 경우별 동작 (R-4):** `linked`는 다른 Day에 있던 단어를 이 Day에 연결한 것이다. `skipped`는 이 Day에 이미 있거나 요청 안에서 중복된 것이다. 기존 단어의 숨김·북마크는 그대로 둔다.
- **`POST /api/days/{n}/words`:** 숨긴 단어를 연결하면 `hidden`을 0으로 바꾼다(R-22).
- **`PATCH /api/words/{id}`:** 영어·뜻을 바꾸면 정규화한 뒤 R-2 키 충돌을 검사한다. 응답의 `word`는 정규화된 값이다. 허용 칸은 자기 속성(`Object.hasOwn`)으로만 판정한다.
- **`next` 검사:** `/`로 시작하는 값을 URL로 파싱해 출처가 바뀌지 않으면 `pathname + search`를, 바뀌면 `/`를 쓴다.
  - URL 파서가 탭·줄바꿈을 지우고 `\`를 `/`로 읽으므로 문자열 접두사만으로는 판정하지 않는다.
  - 점 경로(`/.//evil.com`)가 풀려 결과가 `//`로 시작하거나, 파싱이 실패하면 `/`다.

### 화면 경로

| 경로 | load 데이터 | 비고 |
|---|---|---|
| `/` | `days: DaySummary[]`, `studyableCount: number` | `studyableCount`: 숨기지 않은 고유 단어 수. 통합 학습 0개 판정용 (R-36) |
| `/login` | — | 비밀번호 입력 하나. 실패하면 입력창 아래에 문구 |
| `/days/[n]` | `day: number, words: Word[]` (숨김 포함, 교재순) | 없는 Day는 404 |
| `/bookmarks` | `words: Word[]` (북마크, 숨김 포함, R-39 교재순) | 화면에 들어올 때의 목록을 유지한다 (R-24) |
| `/study?scope=…&day=…&order=…&repeat=…` | `words: Word[]` (숨김 제외, 교재순), `scope`, `day` | 아래 쿼리 검증 |

- **`/study` 쿼리 검증:**
  - 허용 값: `scope`는 `day`/`all`/`bookmarks`, `order`는 `textbook`/`random`/`alpha`, `repeat`는 `1`/`2`/`3`/`loop`. 그 밖의 값은 400이다.
  - `scope=day`인데 `day`가 없거나 정수가 아니면 400, 없는 Day면 404다.
- **학습 시작 가능 판정 (`StudySheet`, R-36):** 학습할 단어가 0개면 [학습 시작]을 비활성화하고 "학습할 단어가 없어요. 숨긴 단어는 학습에서 빠져요."를 보여준다. 학습할 단어 수는 화면마다 다음과 같다.
  - 홈(통합): `studyableCount`
  - Day: 로컬 `words` 중 `!hidden`
  - 북마크: 로컬 `words` 중 `bookmarked && !hidden`. 이 화면에서 끈 행은 남아 있으므로 다시 거른다.

### 서버 함수

```ts
// $lib/server/db.ts
function getDb(): DatabaseSync;                       // 처음 호출 때 열고 스키마 적용
function openDb(path: string): DatabaseSync;          // 테스트는 ':memory:'로 직접 연다
function tx<T>(db: DatabaseSync, fn: () => T): T;

// $lib/server/repo.ts (db를 첫 인자로 받는다)
function listDays(db): DaySummary[];
function countStudyableWords(db): number;
function getDayWords(db, day: number): Word[] | null;
function getAllWords(db, opts: { includeHidden: boolean }): Word[];
function getBookmarkedWords(db, opts: { includeHidden: boolean }): Word[];
function importDay(db, input: ImportInput): ImportResult;
function deleteDay(db, day: number): { deletedWords: number } | null;
function addWordToDay(db, day: number, input: { english: string; meaning: string }): { word: Word; result: 'created' | 'linked' };
function updateWord(db, id: number, patch: WordPatch): Word;
function deleteWord(db, id: number): boolean;
function recordStudy(db, day: number, now: Date): { studyCount: number; lastStudiedOn: string } | null;

class RepoError extends Error {
  code: 'invalid_request' | 'day_not_found' | 'word_not_found' | 'already_in_day' | 'duplicate_word';
}
```

### 정규화 (`$lib/domain/normalize.ts`)

```ts
function normalizeEnglish(s: string): string;
function englishKey(s: string): string;
function normalizeMeaning(s: string): string;
```

### 학습 세션 (`$lib/domain/session.ts`)

```ts
type SessionState = {
  order: Order; repeat: Repeat;
  base: number[];          // 교재순 또는 알파벳순으로 정렬된 단어 id. 숨기면 빠진다
  rounds: number[][];      // 만들어진 바퀴들. 랜덤이면 바퀴마다 새로 섞인 순서
  round: number;           // 현재 바퀴 (0부터)
  index: number;           // 현재 바퀴 안 위치 (0부터)
  status: 'active' | 'done' | 'empty';
  firstRoundFinished: boolean;  // R-13 사건
};
type Rng = () => number;   // [0, 1), 테스트에서 시드 고정

function createSession(words: { id: number; english: string; meaning: string }[], opts: { order: Order; repeat: Repeat }, rng?: Rng): SessionState;
function next(s: SessionState, rng?: Rng): SessionState;
function prev(s: SessionState): SessionState;
function hide(s: SessionState, wordId: number, rng?: Rng): SessionState;
function currentId(s: SessionState): number | null;
function progress(s: SessionState): { position: number; total: number; round: number; totalRounds: number | null };
```

- **`createSession`:**
  - 빈 목록이면 `status = 'empty'`, `firstRoundFinished = false`다.
  - 아니면 첫 바퀴를 만들고 `index = 0`이다.
  - 생성 직후에도 `firstRoundFinished`를 판정한다. 그래서 1장짜리 세션은 `true`로 시작한다.
- **바퀴 만들기:**
  - 다음 바퀴는 처음 들어갈 때 만든다.
  - 교재순·알파벳순이면 `base`를 복사하고, 랜덤이면 `base`를 Fisher–Yates로 섞는다.
  - 이미 만든 바퀴는 보관해서 이전 이동(R-31)이 지나온 순서를 따른다.
- **알파벳순:**
  - 1차 키: `english.localeCompare(…, 'en', { sensitivity: 'base' })`
  - 2차 키: `meaning.localeCompare(…, 'ko')`
- **`next`:**
  - 바퀴 끝이 아니면 `index + 1`이다.
  - 바퀴 끝이면 남은 바퀴가 있을 때(`repeat === 'loop'` 또는 `round + 1 < repeat`) 다음 바퀴의 0번으로 간다.
  - 남은 바퀴가 없으면 `status = 'done'`이다.
- **`prev`:**
  - `index > 0`이면 `index - 1`이다.
  - `index === 0`이고 `round > 0`이면 앞 바퀴의 마지막 카드로 간다.
  - 첫 바퀴의 첫 카드면 그대로다.
- **`hide`:**
  - `base`와 만들어진 모든 바퀴에서 그 id를 지운다.
  - 현재 카드를 지웠으면 같은 `index`(= 다음 카드)에 머문다. 그 `index`가 바퀴 길이 이상이면 `next`와 같은 규칙으로 다음 바퀴 또는 `done`이다.
  - 현재 위치 앞의 카드를 지웠으면 `index`를 1 줄인다.
  - `base`가 비면 `status = 'empty'`다.
- **`firstRoundFinished`:** 다음 중 하나가 되면 `true`가 되고, 이후 바뀌지 않는다.
  - `round === 0`이고 `index === rounds[0].length - 1`
  - `round > 0`
  - 첫 카드가 한 번이라도 나온 세션의 `status`가 `done` 또는 `empty`
- **화면의 기록 호출:**
  - 화면은 세션을 만든 직후와 상태가 바뀔 때마다 검사한다.
  - `scope === 'day'`이고, `firstRoundFinished`이고, 이 세션에서 아직 기록하지 않았으면 학습 기록 API를 한 번 호출한다.

### 클라이언트 상태 (`$lib/client/prefs.svelte.ts`)

- **`viewMode: ViewMode`** (R-16~R-18)
  - `localStorage['vocab.viewMode']`에 저장한다.
  - 순환: `both → english → meaning → both`.
  - 버튼 문구: `영어/뜻 보기`, `영어만 보기`, `뜻만 보기`.
- **`studyPrefs: { order: Order; repeat: Repeat }`** (R-28, R-29)
  - `localStorage['vocab.studyPrefs']`에 저장한다. 없으면 `{ order: 'textbook', repeat: 1 }`이다.
  - [학습 시작]을 누를 때 저장한다.
- **저장소 접근 실패:** 모든 `localStorage` 접근은 `try/catch`로 감싼다. 실패하면 기본값으로 동작한다.
- **화면 렌더링 시점:** `ssr = false`라서 첫 렌더링 전에 `localStorage`를 읽는다. 그래서 가린 칸이 잠깐 드러나는 일이 없다.

### 화면 변경 처리

| 동작 | 방식 | 실패 시 |
|---|---|---|
| 북마크 켜고 끄기 (목록·카드), 숨기기·숨김 해제 (목록) | 낙관적. 같은 단어·칸의 요청은 줄 세워 누른 순서대로 보낸다 (`client/flags.ts`) | 실패한 요청이 마지막 요청이면 서버가 마지막으로 확인한 값으로 되돌리고 토스트 |
| 숨기기 (카드) | 낙관적, `session.hide` 먼저. 직전 숨기기에서 `TAP_MAX_MS` 안의 입력은 무시한다 (다음 카드가 같은 자리에 바로 그려져 두 번째 탭이 보지 못한 카드를 숨기므로) | 세션은 그대로 두고 토스트 ("숨기기를 저장하지 못했어요. 다음 학습에는 다시 나와요.") |
| 수정 | 응답 후 반영. 버튼에 "저장 중…" 표시. 대상 행을 요청 전에 잡아 두고, 응답 전에 시트를 닫아도 그 행의 글자 칸(영어·뜻·품사·예문·해석)에 반영한다 | 409·400: 그 시트가 아직 열려 있으면 입력창 아래에 `message`, 닫혔거나 다시 열렸으면 토스트. 그 밖: 토스트 |
| 삭제 | 확인 시트 → 낙관적으로 행 제거 | 행을 되돌리고 토스트 |
| 단어 추가 | 응답 후 반영. 응답의 `word`를 목록 끝에 붙인다. 그 시트가 아직 열려 있을 때만 닫는다 | 수정과 같다 |
| 학습 기록 | 응답을 기다리지 않음. 실패하면 1회 재시도 | 토스트 ("학습 기록을 저장하지 못했어요") |

### 화면 동작 세부

- **Day 표기:** 두 자리로 맞춘다(`Day 01`, `Day 12`). 100 이상은 그대로 쓴다.
- **가림 칸 (`MaskCell`)**
  - prop `masked`가 참이면 점선 상자에 '터치하세요'를 띄운다. 누를 때마다 드러냄과 가림을 오간다.
  - 드러낸 상태는 컴포넌트 로컬이다. `viewMode`가 바뀌면 초기화한다(R-16).
- **행 밀기 (`WordRow`)**
  - pointer 이벤트로 가로 이동을 추적한다. 행은 `touch-action: pan-y`로 세로 스크롤을 브라우저에 맡긴다.
  - 왼쪽으로 행 너비의 25% 넘게 밀면 메뉴가 열린 상태로 고정된다. 메뉴는 [숨기기/숨김 해제] [수정] [삭제]다.
  - 한 번에 한 행만 열린다.
  - 닫히는 경우: 다른 곳을 탭할 때, 오른쪽으로 밀 때, 목록이 스크롤될 때, 메뉴 동작을 실행한 뒤.
  - 숨긴 행은 `opacity: 0.4`로 흐리게 보인다.
- **기록 없음 표시:** Day 행에 `lastStudiedOn`이 없으면 "학습 전"이라고 적는다(R-12).
- **바텀 시트 (`BottomSheet`):** 수정, 추가, 삭제 확인, 학습 설정에 쓴다. 브라우저 대화상자(`alert`, `confirm`)는 쓰지 않는다. 배경을 누르거나 Esc를 누르면 닫힌다.
- **빈 상태와 오류:** 홈·북마크 목록이 비면 다음 행동을 알려 주는 문구를 보여준다. 목록 위에 단어 수(`N단어`)를 적는다. 없는 Day·잘못된 학습 주소는 `+error.svelte`가 이유를 보여준다.
- **학습 카드 (`StudyCard` + `/study`)**
  - 카드 앞면의 칸 구성과, 보기 모드별로 가리는 칸:

    | 칸 | 내용 | `both` | `english` | `meaning` |
    |---|---|---|---|---|
    | 영어 칸 | 영어 | 보임 | 보임 | 가림 |
    | 뜻 칸 | 품사 + 뜻 | 보임 | 가림 | 보임 |

  - 카드 뒷면:
    - 예문(영어)과 해석을 보여준다.
    - 예문이 비면 "예문 없음"이라고 적는다.
    - 해석만 비면 해석 줄을 생략한다.
  - 카드 밀기
    - pointer 이벤트로 판정한다. 가로 이동이 카드 너비의 20% 이상이거나 속도가 0.5px/ms 이상이면 넘기고, 아니면 제자리로 돌린다.
    - 첫 바퀴의 첫 카드에서 오른쪽으로 밀면 0.25배로 저항하며 따라오다 제자리로 돌린다.
  - 탭 판정: 이동 8px 미만이고 400ms 미만이면 탭이다.
    - 탭 지점이 가린 칸(드러낸 상태 포함) 안이면 칸만 토글한다(R-32). 바깥이면 뒤집는다(R-33).
    - `both` 모드에는 가린 칸이 없으므로 어디를 눌러도 뒤집는다.
  - 카드 좌우 여백: 20px(`app.css`의 `--gutter`). 사파리 가장자리 뒤로 가기 영역에서 떨어뜨리기 위한 시작값이다.
  - 제스처 수치(25%, 20%, 0.5px/ms, 8px, 400ms, 저항 0.25)와 카드 넘김 시간(250ms)은 `$lib/components/gesture.ts`의 상수로 모아 실기기에서 조정한다.
  - 앞뒤를 뒤집을 때 200ms 회전 애니메이션으로 면이 바뀌었음을 알린다.
  - 기기의 "동작 줄이기"가 켜져 있으면 넘김·뒤집기 애니메이션을 끈다(`app.css`, `CARD_ANIMATION_MS` 대신 0). E2E도 이 설정으로 돈다.
  - 카드 상단: 북마크 버튼, 숨기기 버튼. 이 버튼의 탭은 뒤집기로 번지지 않게 막는다.
  - 헤더
    - [뒤로]: 완료 화면의 [목록으로]와 같은 경로로 간다.
    - 보기 모드 버튼, 위치(`12 / 99`).
    - 바퀴: 반복 2·3회면 `2 / 3회`, '계속'이면 `2회차`다. 반복 1회면 숨긴다.
  - 카드가 바뀌면 앞면이고 가린 칸이 모두 가려진 상태로 다시 그린다(R-33).
- **완료 화면과 빈 화면**
  - 완료(`done`): [목록으로]와 [다시 학습](R-38).
    - [목록으로]는 `day`이면 `/days/n`, `bookmarks`이면 `/bookmarks`, `all`이면 `/`로 간다.
    - [다시 학습]은 `invalidateAll()`로 `load`를 다시 실행한다. 그래서 숨김·북마크 변경을 반영한 새 목록으로 새 세션을 만든다.
  - 빈 화면(`empty`): "학습할 단어가 없어요" 문구와 [목록으로].
- **화면 꺼짐 방지 (`wakeLock.ts`, R-40)**
  - `/study`가 마운트될 때 `navigator.wakeLock.request('screen')`을 요청한다. 지원하지 않거나 거부되면 아무것도 하지 않는다.
  - `visibilitychange`로 다시 보일 때 재요청하고, 떠날 때 해제한다.
- **날짜:** 서버가 `Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })`로 `studied_on`을 만든다. 화면은 `MM-DD`만 보여준다.

### 시각 요소 (R-41, R-43)

- **색 토큰**
  - 배경 `#0f0f11`, 표면 `#1c1c1f`, 표면2 `#26262a`, 구분선 `#2e2e33`
  - 본문 `#f2f2f3`, 보조 `#9b9ba3`
  - 포인트 노랑 `#f5d466`: 주요 버튼
  - 포인트 주황 `#e8893a`: 켜진 북마크, 진행 표시
  - 오류 `#e5534b`
- **모서리:** 카드·시트·버튼 14px, 칩·토글 알약형.
- **아이콘:** `phosphor-svelte` 한 세트만 쓴다. 굵기 `regular`, 크기 22px로 통일하고, 켜진 북마크만 `fill`이다.
- **앱 아이콘:** 포인트 노랑 바탕에 검은 글자 "단"이다. 180·192·512px PNG로 만든다. 원본 SVG를 함께 둔다.

### 환경 변수

| 이름 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `APP_PASSWORD` | 예 | — | 로그인·API 인증 |
| `ORIGIN` | 빌드 실행 시 예 | — | 서버의 외부 주소. 이번 라운드는 `http://macbook.local:3000`. 이 값이 없으면 adapter-node가 HTTP 요청을 `https`로 판정한다 |
| `DATABASE_PATH` | 아니요 | `data/vocab.db` | SQLite 파일 경로. 디렉터리가 없으면 만든다 |
| `PORT` | 아니요 | 3000 | adapter-node. `HOST`는 기본값 `0.0.0.0`이라 폰에서 바로 접속된다 |

- **`.env` 위치:** 저장소 루트다. git이 추적하지 않는다(`.gitignore`). 키 목록은 `.env.example`로 커밋한다.
- **접속 주소:** 폰과 Mac 모두 `http://macbook.local:3000`으로 접속한다. Mac의 Bonjour 이름(`scutil --get LocalHostName` = `Macbook`)은 IP가 바뀌어도 그대로다.
- **개발 서버(`vite dev --host`):** 출처 검사가 없으므로 `ORIGIN`이 필요 없다.

## 5. 요구사항 매핑

| R | 담당 |
|---|---|
| R-1 | `words` 스키마, `POST /api/days` 검증. 품사 표기 규칙은 9장 등록 절차(README) |
| R-2 | `normalize.ts`, `words.UNIQUE(english_key, meaning)`, `day_words` 기본 키, 상태 칼럼이 `words`에 있음 |
| R-3 | `days`, `day_words.position` (`MAX + 1`) |
| R-4 | `POST /api/days` → `importDay` (`tx`) |
| R-5 | `GET /api/days` → `listDays`. 번호 규칙은 9장 |
| R-6 | `hooks.server.ts`, `auth.ts` (Bearer) |
| R-7 | `PATCH /api/words/{id}` → `updateWord` |
| R-8 | `DELETE /api/days/{n}` → `deleteDay` (고아 단어 삭제) |
| R-9 | 9장 절차로 Day 01 등록 |
| R-10 | `/`, `listDays` |
| R-11 | `/` 상단 버튼. [통합 학습]은 `StudySheet`(`studyableCount`) → `/study?scope=all` |
| R-12 | `/` Day 행, `studyCount`·`lastStudiedOn`, "학습 전" |
| R-13 | `session.firstRoundFinished`, 화면의 기록 호출 규칙, `study_logs`, `recordStudy` |
| R-14 | `/` Day 행, `DaySummary.wordCount` |
| R-15 | `WordList`, `WordRow` |
| R-16 | `ViewModeButton`, `MaskCell` |
| R-17 | `prefs.viewMode`(전역 하나), 목록·학습 화면이 같이 읽음 |
| R-18 | `prefs.viewMode`의 localStorage 저장 |
| R-19 | `WordRow` 북마크 버튼 → `PATCH bookmarked` |
| R-20 | `WordRow` 밀기 메뉴 → `PATCH hidden`, 흐림 |
| R-21 | `WordRow` 밀기 메뉴 → 수정 시트, 삭제 확인 시트 |
| R-22 | `/days/[n]` 목록 끝 '단어 추가' → `POST /api/days/{n}/words` |
| R-23 | `/days/[n]`, `/bookmarks` 하단 버튼 → `StudySheet` |
| R-24 | `/bookmarks`, `getBookmarkedWords({ includeHidden: true })`, 진입 시 목록 유지 |
| R-25 | `StudySheet` 순서 선택, `createSession` |
| R-26 | `StudySheet`의 알파벳순, `session`의 정렬 |
| R-27 | `StudySheet` 반복 선택, `session.next` |
| R-28 | `prefs.studyPrefs` 기본값, `StudySheet` [학습 시작] |
| R-29 | `prefs.studyPrefs` 저장 |
| R-30 | `session` 바퀴별 Fisher–Yates |
| R-31 | `/study` 밀기, `session.next/prev/progress`, 바퀴 표시 규칙 |
| R-32 | `StudyCard` 칸 구성 표 + `MaskCell` + 학습 헤더의 `ViewModeButton` |
| R-33 | `StudyCard` 탭 판정, 뒤집기, 뒷면 구성 |
| R-34 | `StudyCard` 북마크 버튼 → `PATCH bookmarked`. 세션 목록은 그대로 |
| R-35 | `StudyCard` 숨기기 버튼 → `session.hide` + `PATCH hidden` |
| R-36 | `/study` load의 숨김 제외, `StudySheet`의 0개 판정, `empty` 화면 |
| R-37 | `/study` 완료 화면, 범위별 돌아갈 경로 |
| R-38 | 완료 화면 [다시 학습] → `invalidateAll()` + 새 세션 |
| R-39 | `getAllWords`, `getBookmarkedWords`의 정렬 |
| R-40 | `wakeLock.ts` |
| R-41 | `+layout.svelte`의 색 토큰과 안전 영역, `phosphor-svelte` |
| R-42 | `/login`, `POST /api/login`, `auth.ts`, `hooks.server.ts` |
| R-43 | `static/manifest.webmanifest`, `static/icons/*`, `app.html` 메타 태그 |
| R-44 | `.gitignore`(`data/`, `.env`), `.env.example`, 테스트는 합성 단어 |

## 6. 의존성

| 대상 | 버전 | 도입 이유 | 검토한 대안과 기각 이유 |
|---|---|---|---|
| Node.js | `engines: >=22.13`. 개발 25.9.0, 배포 24 LTS | `node:sqlite`가 플래그 없이 동작한다 | 개발 Mac에는 25만 있다. 25는 06-01에 지원이 끝났으므로 배포 이미지는 24 LTS로 고정한다 |
| `node:sqlite` | Node 내장 (25.9.0에서 SQLite 3.53) | 네이티브 빌드가 없어 Mac(arm64)과 홈서버(x86)에서 그대로 돈다 | `better-sqlite3`: 네이티브 모듈이라 아키텍처별 빌드가 필요하다. Drizzle·Prisma: 테이블 4개 규모에는 과하다 |
| `@sveltejs/kit` | 2.70.x | 화면과 API를 한 앱으로, 코드량이 적다 | Kit 3.0(10-01 출시): 출시 6일째라 어댑터·생태계가 검증되지 않았다. Next.js: 런타임과 규약이 무겁다. FastAPI + React: 런타임이 두 개다 |
| `svelte` | 5.57.x | Kit 2의 피어, runes로 상태 관리 | — |
| `@sveltejs/adapter-node` | 5.5.x | `node build`로 실행한다. 다음 라운드 Docker 이미지에 그대로 넣는다 | adapter-static: 서버 API가 필요해서 불가 |
| `vite` / `@sveltejs/vite-plugin-svelte` | 8.1.x / 7.3.x | Kit 2의 피어가 허용하는 최신 조합. 공식 스캐폴더 `sv@0.17.1`의 Kit 2 템플릿과 같은 메이저다 | vite 7: 더 오래됐을 뿐 이득이 없다 |
| `typescript` / `svelte-check` | ~6.0 / 4.7.x | 타입 검사 | TypeScript 7: Kit 2와 svelte-check의 피어 범위 밖이다 |
| `@types/node` | ^24 | `node:sqlite`(`DatabaseSync`) 타입 | — |
| `phosphor-svelte` | 3.1.x | 아이콘 한 세트 (Svelte 5 지원) | 직접 그린 SVG: 크기·굵기가 흔들린다 |
| `vitest` | 4.1.x | 순수 함수와 repo 단위 테스트 | vitest 5: `engines`에 Node 25가 빠져 있다 |
| `@playwright/test` | 1.63.x + WebKit | WebKit(아이폰 프로필)으로 Safari 엔진에서 E2E | 실기기 수동 테스트만 하면 반복 검증이 안 된다 |

- **골격:** 공식 스캐폴더(`sv`)의 최신판은 Kit 3을 만든다. 그래서 설정 파일을 직접 쓰고 위 버전으로 고정한다.
- **스와이프:** 라이브러리 없이 pointer 이벤트로 직접 구현한다.
  - Swiper·Embla 같은 캐러셀은 카드가 미리 나열된 목록을 전제한다.
  - 이 앱은 바퀴가 진행 중에 만들어지고, 숨기면 목록이 줄며, 탭이 가림 해제와 뒤집기로 갈린다. 캐러셀과 맞지 않는다.
- **CSS:** Svelte 컴포넌트 스코프 CSS와 `:root` 색 토큰을 쓴다. 의존성이 없다. Tailwind는 화면 수가 적어 이득이 작다.
- **글꼴:** 시스템 글꼴(`-apple-system`, `Apple SD Gothic Neo`)을 쓴다. 대상 기기가 아이폰이라 웹 글꼴이 필요 없다.
- **준비 작업:** 첫 E2E 전에 `npx playwright install webkit`(브라우저 내려받기)을 한다.

## 7. 비기능 요구사항

- **규모 가정:** 사용자 1명, 동시 요청은 수 개 수준이다. 단어는 12-13까지 약 70일 × 100 = 최대 7,000개다.
- **성능 목표:** 아래는 모두 화면 설계의 기준으로 정한 임의 목표다. 이번 라운드에 자동 측정은 하지 않는다.
  - 카드 넘김 애니메이션 250ms. `transform`만 바꾼다.
  - 탭 반응(가림 해제, 뒤집기)은 다음 프레임 안이다. 네트워크를 기다리지 않는다.
  - 통합 학습 7,000개 응답은 약 1.8MB(실측 단어당 약 263바이트)다. 와이파이에서 2초 이내를 목표로 한다.
- **보안**
  - 4장 "공통"의 인증·비교·CSRF 규칙을 따른다.
  - 로그인 시도 횟수 제한은 외부 공개(배포 라운드) 때 추가한다. 이번 라운드는 와이파이 안에서만 접속한다.
- **로깅:** 서버 콘솔에 API 5xx와 예외 스택을 남긴다. 별도 관측 도구는 없다.
- **데이터 내구성:** 기본 저널이라 서버가 쉬고 있을 때 DB 파일 하나만 복사하면 이관·백업이 된다. 자동 백업은 비목표다.

## 8. 테스트 전략

### 단위 (vitest, Node 환경)

- **`normalize.ts`:** R-2의 정규화 규칙과 적용 순서. 공백, 대소문자, 쉼표·세미콜론, 끝 쉼표, 뜻 순서가 다르면 다른 단어인지.
- **`session.ts`:** 시드를 고정한 RNG로 검증한다.
  - 정렬: 교재순·알파벳순·랜덤 (R-25, R-26)
  - 반복 1/2/3/loop의 끝 판정 (R-27, R-37)
  - 바퀴마다 새로 섞임 (R-30)
  - 바퀴 경계의 이전 이동과 지나온 순서 보존 (R-31)
  - 숨기기: 현재 카드, 앞 카드, 바퀴 마지막 카드, 마지막 바퀴 마지막 카드, 전부 숨김 (R-35, R-36)
  - `firstRoundFinished`의 시점: 1장 세션, 마지막 카드 도착, 숨기기로 벗어남 (R-13)
  - 성질 검사(S-3): 1~150개(하루 분량 약 100개를 넘는 범위) 무작위 목록에서, 순서 3종 × 반복 3회 각 바퀴에 모든 id가 정확히 한 번씩 나온다. 7,000개 한 번도 확인한다.
- **`repo.ts`:** 메모리 DB를 쓴다.
  - 등록의 경우별 동작 (R-4)
    - 새 단어, 다른 Day 연결과 빈 칸 채우기, 이 Day 중복 건너뛰기, 요청 안 중복
    - 검증 실패 시 전체 거부와 무저장
    - 기존 Day에 덧붙일 때의 위치
  - Day 조회의 `wordCount`(숨김 포함)와 기록 집계 (R-5, R-12, R-14), `countStudyableWords`
  - Day 삭제와 고아 단어 삭제 (R-8)
  - 수정 충돌 409, 정규화된 응답 (R-7, R-21), 삭제 연쇄 (R-21)
  - 단어 추가의 연결·숨김 해제·409·삭제 뒤 위치 (R-22)
  - 통합·북마크 교재순과 숨김 포함·제외 (R-24, R-36, R-39)
  - 학습 기록과 서울 날짜 경계 (R-13)
- **`auth.ts`:** 쿠키 서명·검증, 길이가 다른 비밀번호, Bearer 일치, `next` 경로 검사.

### 통합·E2E (Playwright)

- **서버:**
  - `npm run build` 뒤 `node build`를 띄운다. `ORIGIN=http://localhost:4173`, `PORT=4173`이다.
  - DB는 실행마다 새 파일(`test-results/e2e.db`)이다.
  - WebKit 아이폰 프로필, worker 1개.
- **입력 재현:** Playwright에는 터치 밀기 API가 없다.
  - 밀기는 `page.mouse` 드래그(pointer 이벤트)로 재현한다. 탭은 `click`으로 한다.
  - 실제 터치 동작(`touch-action`, 가장자리 뒤로 가기)은 실기기 수동 확인에서만 검증한다.
- **API (Playwright `request`):**
  - 인증: 401, Bearer, 쿠키
  - 415, 등록 응답의 `created`/`linked`/`skipped`, 에러 코드
- **화면:**
  - 로그인과 `next` 이동 (R-42)
  - 홈 Day 목록과 기록 표시 (R-10~R-14)
  - 보기 모드: 순환, 가림 토글, 화면 간 공유, 새로고침 뒤 유지 (R-16~R-18)
  - 목록 편집: 행 밀기로 숨김·흐림, 수정 409 안내, 삭제 확인, 단어 추가 (R-19~R-22)
  - 북마크 화면에서 끈 행 유지 (R-24)
  - 학습: 밀기 다음·이전, 탭 가림·뒤집기, 북마크·숨기기 (R-31~R-35)
  - 학습 끝: 완료 화면과 돌아갈 곳 (R-37), 다시 학습 (R-38), 통합 학습 → 홈 (R-11, R-37), 학습 기록 증가 (R-13)
- **성공 기준 확인:**
  - S-2: 홈에서 Day 행 → [학습하기] → [학습 시작], 탭 3번으로 첫 카드가 보이는지
  - S-3: 합성 99단어 Day를 교재순·랜덤 각각 끝까지 넘기며, 본 id가 99개이고 서로 다른지
  - S-4: 숨긴 뒤 Day·통합·북마크 학습 각각에 그 단어가 없는지, 새로고침한 뒤에도 같은지
- **테스트 데이터:** 합성 단어(`word001` 등)와 예시 몇 개만 쓴다(R-44).

### 수동 확인 (실기기)

- **S-3:** 아이폰 Safari 탭과 홈 화면 실행에서 Day 01을 끝까지 넘긴다.
  - 확인 범위는 "밀기가 건너뛰거나 두 번 넘어가지 않는가"다.
  - 카드 고유성은 E2E와 성질 검사로 판정한다.
- **R-43:** 홈 화면에 추가하면 아이콘과 전체 화면으로 열리는지 확인한다.
- **S-1:** 등록 응답의 `created + linked + skipped` 수가 종이 줄 수(111)와 같고, `created + linked`가 고유 단어 수(99)와 같은지 확인한다.
- **S-5:** 사용자 관찰이다. `study_logs`의 날짜별 행으로 확인한다.

## 9. 등록 절차 (README에 그대로 싣는다)

1. 사용자가 종이 사진을 Claude Code 대화에 첨부한다.
2. Claude가 종이 순서대로 `ImportInput` JSON을 만들어 `data/import/dayNN.json`에 저장한다.
   - 품사 표기 규칙(R-1): 숙어·구는 `구`, 뜻 항목의 품사가 다르면 `동사, 명사`처럼 뜻 순서대로 쓴다.
   - 종이에서 겹치는 줄도 그대로 넣는다. 중복 처리는 서버가 한다.
3. Day 번호를 정한다. 사용자가 정한 번호를 쓰고, 없으면 `GET /api/days`의 가장 큰 번호 + 1을 쓴다(R-5).
4. 아래 명령으로 등록한다.
   ```
   set -a; source .env; set +a
   curl -sS -X POST "$ORIGIN/api/days" -H "Authorization: Bearer $APP_PASSWORD" \
     -H 'content-type: application/json' --data @data/import/dayNN.json
   ```
5. 응답 수를 종이와 대조해 사용자에게 보고한다(S-1).
   - `created + linked + skipped` = 종이 줄 수
   - `created + linked` = 고유 단어 수
6. 예문을 고칠 때는 `PATCH /api/words/{id}`를, Day를 잘못 넣었을 때는 `DELETE /api/days/{n}` 뒤 다시 등록한다(R-7, R-8).

## 10. 구현 순서

얇은 조각 하나가 끝까지 동작하게 쌓는다. 단계마다 단위 테스트와 해당 E2E를 함께 쓴다.

| 단계 | 내용 | 요구사항 |
|---|---|---|
| 1 | 골격, `normalize`, DB·repo 등록·조회, 인증·로그인, `GET/POST /api/days`, 홈, Day 목록(보기 모드 포함) | R-1~R-6, R-10, R-15~R-18, R-23(버튼만), R-42, R-44 |
| 2 | 학습 세션과 학습 화면: 교재순·랜덤·반복·밀기·뒤집기·완료 | R-25, R-27, R-28, R-30~R-33, R-37 |
| 3 | Day 01 등록 → 첫 사용 가능 | R-9 |
| 4 | 북마크·숨기기(목록·카드), 북마크 화면, 통합 학습 | R-11, R-19, R-20, R-24, R-34~R-36, R-39 |
| 5 | 학습 기록, 수정·삭제·추가, Day 삭제·단어 수정 API | R-7, R-8, R-12~R-14, R-21, R-22 |
| 6 | 알파벳순, 설정 기억, 다시 학습, 홈 화면 앱, 화면 꺼짐 방지 | R-26, R-29, R-38, R-40, R-41(마감), R-43 |

- 일정이 밀리면 6단계부터 뺀다(PRD 제약: COULD, SHOULD 순).

## 11. 비목표

- PRD 5장의 비목표를 그대로 따른다.
- 기술 쪽으로 이번에 하지 않는 것:
  - 서비스 워커·오프라인 캐시
  - Dockerfile·CI·로컬 HTTPS
  - 가로 화면·아이패드·데스크톱 최적화 (동작은 하되 맞추지 않는다)
  - API 페이지네이션
  - 로그인 시도 횟수 제한
  - 접근성 감사 (기본적인 버튼 라벨과 포커스 표시는 한다)

## 12. 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| `node:sqlite`는 Node 문서상 아직 Release candidate다. 버전에 따라 API가 바뀔 수 있다 | 서버 시작 실패 | 사용을 `db.ts`와 `repo.ts`에 가둔다. 배포 Node 버전을 고정한다. 문제가 생기면 `better-sqlite3`로 바꾼다. 이때 타입 이름과 트랜잭션 헬퍼가 달라 `db.ts`의 시그니처를 고친다 |
| 아이폰 Safari 탭에서 화면 왼쪽 끝 밀기가 '뒤로 가기'와 겹친다 | 이전 카드 대신 페이지를 이탈한다 | 카드 좌우 여백 20px. 일상 사용은 뒤로 가기 제스처가 없는 홈 화면 실행을 권장한다 |
| 직접 만든 스와이프가 실기기에서 어긋난다 | 핵심 조작이 불편하다 | E2E는 pointer 드래그로 로직만 검증한다. 실기기 수동 확인을 한다. 임계값은 `gesture.ts` 상수로 조정한다 |
| iOS 저장소 정책: 탭 모드에서 오래 안 쓰면 스크립트 저장소가 지워질 수 있다. 홈 화면 앱은 Safari와 저장소가 분리된다 | 보기 모드·학습 설정이 초기화된다. 홈 화면 앱에서 한 번 더 로그인한다 | 설정은 편의 기능이라 기본값으로 동작한다. 로그인 쿠키는 서버가 `httpOnly`로 설정한다 (실기기 미검증) |
| `ORIGIN`과 다른 주소로 접속한다(예: Mac에서 `localhost`) | 쿠키 `secure` 판정이 어긋난다 | 접속 주소를 `http://macbook.local:3000` 하나로 통일하고 README에 적는다. 로그인은 JSON API라 출처 검사 403은 생기지 않는다 |
| 배포 뒤 프록시(Cloudflare Tunnel) 뒤에서 실행한다 | 출처·프로토콜 판정이 어긋난다 | 배포 라운드에서 `ORIGIN=https://<서브도메인>`으로 바꾼다 |
| 랜덤 바퀴 경계에서 같은 카드가 연달아 나온다 | 약간 어색하다 | 허용한다. PRD 범위 밖이다 |
| DB 파일이 하나뿐이다 | 디스크 문제가 생기면 북마크·숨김·기록이 사라진다 | 백업은 비목표다. 단어는 Claude가 다시 등록할 수 있다 |
