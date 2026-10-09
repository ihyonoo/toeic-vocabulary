# TRD: 사진으로 단어 등록

- 작성일: 2026-10-09
- 상태: 확정 (spec-review 1회, 코드 리뷰 1회 반영)
- PRD: `docs/prd/2026-10-09-photo-import.md` (R-45~R-68, S-6~S-11)
- 바탕: `docs/trd/2026-10-07-toeic-vocab-app.md`(이하 MVP TRD), `docs/design/2026-10-08-my-words.md`

## 1. 개요

- 앱이 사진을 줄여 JSON(base64 data URL)으로 올리면, 서버가 초안을 `processing`으로 만들고 바로 응답한다.
- 서버는 같은 프로세스 안에서 사진마다 OpenAI Responses API를 동시에 부르고, 결과를 이어 붙여 초안에 저장한다(`ready` 또는 `failed`).
- 앱은 초안 화면에서 3초마다 초안을 다시 읽는다. 그래서 Cloudflare 100~125초 제한과 앱 종료에 영향받지 않는다.
- 미리보기 편집은 초안에 저장하고, 등록은 기존 `importDay` 규칙을 그대로 쓴다.

## 2. 아키텍처

```
[아이폰 앱]
  /imports/new ── shrinkPhoto() ── POST /api/imports {day, section, photos[]}
        │                                   │ createDraft(processing) → 201
        │                                   └─ runImport() (await 안 함)
        │                                        └─ 사진마다 extractWords() → OpenAI Responses API (동시)
        │                                             ├ 모두 성공 → finishDraft(ready, 이어 붙인 items)
        │                                             └ 하나라도 실패 → 나머지 중단, failDraft(failed, 이유)
  /imports/[id] ── 3초마다 GET /api/imports/[id] (processing인 동안)
        ├ 편집 ── PUT /api/imports/[id] {day, section, items}
        ├ 등록 ── POST /api/imports/[id]/commit {day, section, items} → importDay + 초안 삭제 (한 트랜잭션)
        └ 버리기 ── DELETE /api/imports/[id] → deleteDraft → cancelImport
  / (홈) ── load: listDrafts() → 초안 줄
서버 시작(hooks init) ── failInterruptedDrafts(): processing → failed
서버 종료(sveltekit:shutdown) ── 진행 중인 OpenAI 요청 중단
```

### 새 파일

| 파일 | 역할 |
|---|---|
| `src/lib/domain/photos.ts` | 앱과 서버가 같이 쓰는 사진 한도 상수 |
| `src/lib/server/extract.ts` | 사진 한 장의 OpenAI 호출, 프롬프트, JSON 스키마, 응답 → `DraftItem[]` 변환, 오류 문구 |
| `src/lib/server/imports.ts` | 업로드 검증, 초안 생성, 백그라운드 처리 시작·중단, 사용량 로그 |
| `src/lib/client/photos.ts` | 사진을 긴 변 2048px 이하 JPEG data URL로 줄임 |
| `src/lib/components/SectionChips.svelte` | 묶음 칩 (업로드 화면과 미리보기가 같이 씀) |
| `src/lib/components/DraftItemSheet.svelte` | 미리보기 행 편집 시트 (5칸 + 빼기) |
| `src/routes/(app)/imports/new/+page.{server.ts,svelte}` | 업로드 화면 |
| `src/routes/(app)/imports/[id]/+page.{server.ts,svelte}` | 처리 중 / 실패 / 미리보기 / 등록 결과 화면 |
| `src/routes/api/imports/+server.ts` | POST |
| `src/routes/api/imports/[id]/+server.ts` | GET, PUT, DELETE |
| `src/routes/api/imports/[id]/commit/+server.ts` | POST |
| `tests/support/fake-openai.mjs` | 테스트용 가짜 Responses API 서버 |

### 바뀌는 파일

- `db.ts`: `SCHEMA_V3` 추가
- `repo.ts`: 초안 함수 추가. `importDay` 본문을 트랜잭션 없는 내부 함수 `importClean`으로 나눠 `commitDraft`와 함께 쓴다
- `http.ts`: `REPO_STATUS`에 새 코드 추가. `readJson`이 본문 한도 초과를 413으로 구분한다
- `env.ts`: `openaiApiKey()` 추가
- `hooks.server.ts` `init`: `building` 반환과 필수 변수 검사 뒤에 `failInterruptedDrafts(getDb())`
- `types.ts`, `format.ts`(`sectionLabel`), `client/api.ts`, 홈 `+page.{server.ts,svelte}`
- `playwright.config.ts`: 가짜 OpenAI 서버를 첫 번째 `webServer`로 띄우고, 앱 서버에 `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `BODY_SIZE_LIMIT`를 준다
- `package.json`, `.env.example`, `README.md`, `AGENTS.md`, MVP PRD 머리말

## 3. 데이터 모델

### 스키마 v3

```sql
CREATE TABLE drafts (
  id          INTEGER PRIMARY KEY,
  day_number  INTEGER NOT NULL CHECK (day_number >= 1),  -- 아직 없는 Day일 수 있어 FK를 두지 않는다
  section     TEXT NOT NULL CHECK (section IN ('class', 'mine')),
  status      TEXT NOT NULL CHECK (status IN ('processing', 'ready', 'failed')),
  photo_count INTEGER NOT NULL,
  items       TEXT NOT NULL DEFAULT '[]',                 -- DraftItem[] JSON
  error       TEXT,                                       -- failed일 때 사용자에게 보일 이유
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

- 마이그레이션은 테이블 추가뿐이다. 기존 데이터는 바뀌지 않는다.
- 사진은 어디에도 저장하지 않는다(R-49). 요청 본문은 메모리에서 JSON으로 파싱되고, `runImport`가 끝나면 참조가 사라진다. 임시 파일을 만드는 경로가 없다.

### 상태 전이

| 지금 | 사건 | 다음 |
|---|---|---|
| (없음) | POST /api/imports | `processing` |
| `processing` | 모든 사진 추출 성공이고 단어 1개 이상 | `ready` |
| `processing` | 한 장이라도 추출 실패, 또는 단어 0개 | `failed` |
| `processing` | 서버 시작 | `failed` ("서버가 다시 시작돼 처리가 멈췄어요. 사진을 다시 올려 주세요.") |
| 아무 상태 | DELETE | 행 삭제 |
| `ready` | commit 성공 | 행 삭제 |

- `finishDraft`, `failDraft`는 `WHERE id = ? AND status = 'processing'`으로만 바꾼다. 버린 초안이나 이미 실패 처리된 초안이 되살아나지 않는다.

## 4. 인터페이스

### 타입 (`$lib/domain/types.ts`)

```ts
export type DraftStatus = 'processing' | 'ready' | 'failed';

export type DraftItem = {
  english: string;
  meaning: string;
  pos: string;
  example: string;
  exampleKo: string;
  paperEnglish: string | null; // AI가 철자를 고쳤을 때 종이의 철자 (R-54)
  meaningFilled: boolean;      // 종이에 뜻이 없어 AI가 채웠는가 (R-55)
};

export type DraftSummary = {
  id: number; day: number; section: Section; status: DraftStatus;
  itemCount: number; error: string | null; createdAt: string; // ISO
};

export type Draft = DraftSummary & { items: DraftItem[] };
export type DraftInput = { day: number; section: Section; items: DraftItem[] };
```

### 사진 한도 (`$lib/domain/photos.ts`)

| 상수 | 값 | 근거 |
|---|---|---|
| `MAX_PHOTOS` | 5 | PRD R-46 |
| `PHOTO_MAX_EDGE` | 2048 | PRD R-48 |
| `PHOTO_DATA_PREFIX` | `data:image/jpeg;base64,` | 앱이 항상 JPEG로 다시 인코딩한다 |
| `PHOTO_MAX_LENGTH` | 4,000,000자 | base64 길이. 디코드하면 약 3MB. 2048px·품질 0.85 JPEG는 보통 0.5~1.5MB라 넉넉하다 |

### API

- 모두 기존 인증(`hooks.server.ts`, `event.route.id` 판정)을 거친다. 오류 형식은 MVP TRD와 같은 `{ error: { code, message } }`다.
- 요청 본문은 모두 JSON이다. multipart를 쓰지 않으므로 SvelteKit의 폼 CSRF 차단과 무관하다.

| 메서드·경로 | 요청 | 응답 | 오류 |
|---|---|---|---|
| `POST /api/imports` | `{ day, section, photos: string[] }` | 201 `{ draft: DraftSummary }` | 400 `invalid_request`, 413 `payload_too_large`, 503 `openai_not_configured` |
| `GET /api/imports/[id]` | | `{ draft: Draft }` | 404 `draft_not_found` |
| `PUT /api/imports/[id]` | `DraftInput` | `{ draft: Draft }` | 400, 404, 409 `draft_not_ready` |
| `POST /api/imports/[id]/commit` | `DraftInput` | `ImportResult` | 400, 404, 409 |
| `DELETE /api/imports/[id]` | | 204 | 404 |

- `POST /api/imports` 검증 순서: 본문 읽기(`readJson`의 415·413·400) → 키 없음 503 → `day`(1 이상 안전 정수) → `section` → `photos`(배열 1~5개) → 각 사진(접두사, 길이)
  - 사진 형식이 틀리면 "사진 형식이 잘못됐어요.", 길이를 넘으면 "사진이 너무 커요."
- `PUT`·`commit`의 `DraftInput` 검증(`cleanDraftInput`): `day`, `section`은 업로드와 같다. `items`는 배열이고, 각 항목의 문자열 칸 5개는 문자열, `paperEnglish`는 문자열이나 `null`, `meaningFilled`는 불리언이다.
  - `PUT`은 편집 중이라 빈 영어·뜻을 허용한다.
  - 표시 칸(`paperEnglish`, `meaningFilled`)은 클라이언트가 받은 값을 그대로 돌려보낸다고 믿고 형식만 검사한다. 한 사용자 앱이라 위조를 막지 않는다. 행 추가도 서버에서 막지 않는다(화면에 추가 기능이 없다).
- `commit`: 받은 `DraftInput`의 items에서 표시 칸을 빼고 `cleanImport`로 검증한 뒤, `importClean` 실행과 초안 삭제를 한 트랜잭션으로 한다
  - 저장된 items가 아니라 요청 본문을 쓰므로 마지막 PUT과 경쟁하지 않는다.
  - 영어나 뜻이 빈 행이 있으면 `cleanImport`의 기존 400(`잘못된 항목이 있어요 (인덱스: …)`)을 돌려주고 초안은 남는다. 빈 목록이면 "단어 목록이 비어 있어요." 400이다.
  - 기존 단어는 `importDay` 규칙대로 기존 값을 유지하고 빈 칸만 채운다(MVP TRD, `fillBlanks`). 그래서 미리보기에서 고친 품사·예문은 새로 만드는 단어에만 들어간다(PRD R-64).
  - 요청 안의 겹친 줄은 `importClean`이 두 번째부터 `skipped`로 센다(PRD R-65).
- `readJson`: 본문이 `BODY_SIZE_LIMIT`를 넘으면 SvelteKit이 본문 읽기를 413 오류로 끝낸다. 이를 413 `payload_too_large` "요청이 너무 커요. 사진 수를 줄여 주세요."로 바꾼다. 다른 실패는 기존처럼 400이다.

### 서버 함수

```ts
// repo.ts
createDraft(db, input: { day: number; section: Section; photoCount: number }): DraftSummary
getDraft(db, id: number): Draft                       // 없으면 RepoError('draft_not_found')
listDrafts(db): DraftSummary[]                         // created_at, id 오름차순
nextClassDay(db): number                               // max(Day 번호, processing·ready 수업 단어 초안 번호) + 1, 없으면 1 (R-47)
finishDraft(db, id: number, items: DraftItem[]): void  // processing → ready
failDraft(db, id: number, message: string): void       // processing → failed
failInterruptedDrafts(db): number
saveDraft(db, id: number, input: unknown): Draft       // ready에서만, 아니면 'draft_not_ready'
commitDraft(db, id: number, input: unknown): ImportResult
deleteDraft(db, id: number): void                      // 없으면 'draft_not_found'

// imports.ts
startImport(db, input: unknown, opts: { apiKey: string; baseURL?: string }):
  { draft: DraftSummary; done: Promise<void> }         // 검증 → createDraft → runImport 시작. done은 테스트가 기다린다
cancelImport(id: number): void                         // 진행 중이면 그 초안의 요청을 모두 중단

// extract.ts
export const EXTRACT_MODEL = 'gpt-6.1-sol';
extractWords(photo: string, opts: { apiKey: string; baseURL?: string; signal?: AbortSignal; timeout?: number }):
  Promise<{ items: DraftItem[]; usage: { input: number; output: number } }>
export class ExtractError extends Error {}             // message가 곧 초안의 실패 이유
```

- `RepoErrorCode`에 `draft_not_found`(404), `draft_not_ready`(409)를 더한다. `openai_not_configured`, `payload_too_large`, 사진 검증 400은 `HttpError`다.
- 키와 주소는 `startImport`의 `opts`로 받는다.
  - API 라우트는 `openaiApiKey()`만 넘긴다. 주소는 SDK가 `OPENAI_BASE_URL` 환경 변수(E2E만 설정), 그다음 기본 주소를 쓴다.
  - 단위 테스트는 가짜 서버 주소를 직접 넘긴다. 그래서 사용자 `.env`에 실제 키가 있어도 실제 API를 부르지 않는다.
- `runImport(db, id, photos, opts)` (내부 함수)
  - 처리마다 `AbortController`(버리기·종료용)를 `Map<id, …>`에 넣고, 끝나면 `finally`에서 지운다.
  - 사진마다 `extractWords`를 동시에 부른다. 신호는 버리기용과 형제 중단용을 `AbortSignal.any`로 합친다.
  - 한 장이 실패하면 형제 중단 신호로 나머지를 끊고, 처음 실패한 이유로 `failDraft`한다.
  - 모두 성공하면 사진 순서대로 items를 이어 붙여 `finishDraft`한다. 0개 검사는 `extractWords`가 장마다 한다.
  - 버리기·종료로 중단된 경우는 기록하지 않는다. 종료로 끊긴 초안은 다음 시작 때 `failInterruptedDrafts`가 실패로 바꾼다.
  - 모든 예외를 잡는다. 아무도 이 Promise를 기다리지 않아서, 새는 예외는 처리되지 않은 거부로 서버를 끈다. `ExtractError`가 아닌 예외는 "AI 처리 중 서버 오류가 났어요."로 기록하고 `console.error`한다. `failDraft` 자체의 실패도 잡아 로그만 남긴다.
  - 끝나면 한 줄 로그: 초안 id, 사진 수, 단어 수, 입력·출력 토큰 합, 걸린 ms
- `process.on('sveltekit:shutdown')`에서 진행 중인 처리를 모두 중단한다. adapter-node는 종료 신호에 HTTP 서버만 닫으므로, 그대로 두면 진행 중인 요청이 최대 8분간 종료를 붙잡는다.

### OpenAI 호출 (`extract.ts`)

```ts
new OpenAI({ apiKey, baseURL, timeout: opts.timeout ?? 240_000, maxRetries: 1 })
client.responses.create(
  {
    model: EXTRACT_MODEL,
    reasoning: { effort: 'low' },
    store: false,                  // OpenAI에 응답을 저장하지 않는다
    max_output_tokens: 12_000,     // 약 50토큰/초 × 240초. 추론 토큰 포함
    instructions: PROMPT,
    input: [{ role: 'user', content: [{ type: 'input_image', image_url: photo, detail: 'high' }] }],
    text: { format: { type: 'json_schema', name: 'vocab_sheet', strict: true, schema: SCHEMA } }
  },
  { signal }
);
```

- 사진 한 장(약 55줄)의 출력은 약 5,000토큰, 약 1.5분이다. 12,000토큰이면 약 110단어까지 담는다. 그보다 많으면 출력 한도나 시간 제한에 걸리고, 둘 다 나눠 찍으라는 문구로 끝난다.
- 시간 제한은 시도마다 잰다(SDK). Node 내장 `fetch`(undici)의 응답 헤더 대기 기본값 300초보다 짧다.
- 재시도 1번: SDK는 408, 409, 429(크레딧 부족 포함), 5xx, 연결 오류, 시간 초과에 다시 시도한다. 재시도 대기는 `retry-after`를 따른다. 그래서 실패까지 가장 길면 약 8분이다.
- 스키마: `{ words: [{ english, paperEnglish: string|null, meaning, meaningFilled: boolean, pos, example, exampleKo }] }`. 모든 칸이 required이고 `additionalProperties: false`다.
- 응답 처리 순서
  1. `status === 'incomplete'`: 이유가 `max_output_tokens`이면 "단어가 많아 끝까지 읽지 못했어요. 사진 한 장에 단어가 많으면 나눠 찍어 올려 주세요.", 그 밖이면 "AI가 응답을 끝까지 만들지 못했어요."
  2. `status === 'failed'`: "AI 처리에 실패했어요."
  3. `type === 'message'`이고 `phase !== 'commentary'`인 출력만 본다. 그 안에 `refusal`이 있으면 "AI가 이 사진 처리를 거절했어요."
  4. 그 출력들의 `output_text`를 이어 `JSON.parse`한다. 실패하면 "AI 응답을 읽지 못했어요."
  5. 칸마다 `trim`. `paperEnglish`가 `english`와 대소문자 무시로 같으면 `null`. 영어가 빈 항목은 버린다. 뜻이 빈 항목은 남겨 미리보기에서 고치게 한다
  6. 남은 단어가 0개이면 "사진에서 단어를 찾지 못했어요."
- SDK 오류 → 실패 이유. 하위 클래스가 먼저 오도록 이 순서로 검사한다
  1. `APIUserAbortError`: 그대로 던진다(버리기·형제 중단·종료)
  2. `APIConnectionTimeoutError`: "AI 응답이 너무 오래 걸렸어요. 사진 한 장에 단어가 많으면 나눠 찍어 올려 주세요."
  3. `APIConnectionError`: "OpenAI에 연결하지 못했어요." (Mac 잠자기 등)
  4. `AuthenticationError`: "OpenAI API 키가 잘못됐어요."
  5. `RateLimitError`: `code === 'insufficient_quota'`면 "OpenAI 크레딧이 부족해요.", 아니면 "요청이 많아 잠시 막혔어요. 잠시 뒤 다시 올려 주세요."
  6. 그 밖의 `APIError`: "AI 호출에 실패했어요 (상태 코드)."

### 프롬프트 규칙 (R-54, R-55)

`PROMPT`는 사진 한 장 기준으로 아래를 한국어로 지시한다.

- 위에서 아래로 읽고, 단이 여러 개면 왼쪽 단부터 읽는다
- 단어 줄 하나가 항목 하나다. 같은 단어가 다시 나와도 모두 넣는다
- 제목, 날짜, 줄 번호, 머리말, 쪽 번호는 넣지 않는다
- `english`: 철자가 명백히 틀렸을 때만 고치고, 그때 `paperEnglish`에 종이 철자를 넣는다. 영국식 철자, 대소문자, 하이픈은 고치지 않는다
- `meaning`: 종이의 뜻을 글자 그대로 옮긴다. `영어 [뜻, 뜻]` 형식이면 대괄호를 빼고 `뜻, 뜻`으로 쓴다. 뜻이 없으면 토익에서 쓰는 뜻을 쓰고 `meaningFilled: true`
- `pos`: MVP PRD R-1 표기를 따른다. 지금 등록본에 쓰인 `명사` `동사` `형용사` `부사` `전치사` `접속사` `대명사` 중에서 고르고, 맞는 것이 없으면 가장 가까운 한국어 품사 이름을 쓴다. 숙어·구는 `구`, 뜻마다 품사가 다르면 뜻 순서대로 `동사, 명사`
- `example`: 토익 맥락의 짧은 영어 문장 하나(15단어 이하). `exampleKo`: 그 문장의 자연스러운 한국어 해석

### 화면

| 경로 | load | 동작 |
|---|---|---|
| `/` | 기존 + `drafts: listDrafts()` | 아래 홈 |
| `/imports/new` | `nextDay: nextClassDay()`, `enabled: openaiApiKey() !== ''` | 아래 업로드 화면 |
| `/imports/[id]` | `draft: getDraft()`. 숫자가 아니거나 없으면 `error(404)` | 아래 초안 화면 |

**홈 (R-45, R-57)**
- 초안이 있으면 상단 버튼과 Day 목록 사이에 "사진 등록" 영역을 둔다. 줄은 올린 순서다.
  - 줄: `Day NN · 수업 단어`(또는 내 단어)와 상태(`처리 중` / `확인 대기 · N단어` / `실패`). 누르면 `/imports/{id}`
  - 홈에 머무는 동안 다시 읽지 않는다
- Day 목록 끝에 '사진으로 등록' 링크(`/imports/new`)를 둔다.
  - Day가 없으면 빈 상태 문구를 "아직 등록된 Day가 없어요. 단어 종이 사진을 올리면 Day가 생겨요."로 바꾸고 그 아래에 같은 링크를 둔다

**업로드 화면 (R-46~R-52)**
- 머리: "사진으로 등록", 뒤로는 홈
- `enabled`가 false면 "OpenAI API 키가 설정되지 않았어요. 서버의 `.env`에 `OPENAI_API_KEY`를 넣어 주세요."를 보여 주고 올리기를 막는다(R-51)
- 사진: `<input type="file" accept="image/*" multiple aria-label="사진 더하기">`를 버튼 모양 라벨로 감싼다. 아이폰에서 사진 보관함·카메라·파일 중 고른다
  - 고를 때마다 목록 끝에 붙는다. 한 번에 여러 장이면 입력이 준 순서대로 붙는다
  - 자리가 모자라면 앞에서부터 들어가는 만큼만 붙이고 "사진은 5장까지 올릴 수 있어요."를 보여 준다. 5장이 찬 뒤에도 '사진 더하기'는 끄지 않는다. 고르면 같은 문구가 나온다
  - 썸네일에 1부터 번호를 달고, 썸네일마다 "사진 N 빼기" 버튼을 둔다. 빼면 번호가 다시 매겨진다
- 묶음: `SectionChips`. 처음은 수업 단어
- Day 번호: `<input inputmode="numeric">`, 라벨 "Day 번호"
  - 처음 값은 `nextDay`. 묶음을 내 단어로 바꾸면 비우고, 수업 단어로 바꾸면 `nextDay`로 채운다(R-47)
- [올리기]: 키가 있고 사진이 1장 이상이고 Day가 1 이상 정수일 때만 켜진다
  - 누르면 바로 꺼지고 "올리는 중…"이 된다(R-50)
  - `shrinkPhoto`를 차례로 실행 → `POST /api/imports` → `goto('/imports/{id}', { replaceState: true })`
  - 줄이기나 전송이 실패하면 사진·묶음·번호를 그대로 두고 이유(API 오류면 서버 문구)를 보여 준 뒤 버튼을 다시 켠다(R-52)
  - 올리는 동안 사진 더하기·빼기, 묶음, Day 입력을 막고, 누른 시점의 사진·번호·묶음을 보낸다
  - 줄이는 동안 화면을 떠나면 올리기를 그만둔다. 보낸 뒤에 떠났으면 지금 화면을 다시 읽어(`invalidateAll`) 홈이면 초안 줄이 보이게 한다

**초안 화면 (R-56, R-59~R-68)**
- 머리: 뒤로는 홈, 오른쪽에 [버리기]. 모든 상태에서 같은 자리다
  - [버리기] → "초안 버리기" 확인 시트("이 초안을 버릴까요? 처리 중이면 AI 호출을 멈춰요.", [취소] [버리기]) → DELETE(404도 성공으로 본다) → `goto('/', { replaceState: true })`
- `processing`
  - "AI가 단어를 읽고 있어요", 올린 뒤 지난 시간 `m:ss`(서버의 `createdAt` 기준, 1초마다. 다시 열어도 이어진다)(R-68), "앱을 닫아도 계속 처리돼요"
  - 3초마다, 그리고 화면이 다시 보일 때(`visibilitychange`) `GET`으로 다시 읽는다. 3초는 처리 시간(2분 안팎)에 비해 화면 전환 지연이 작고, 요청 수도 처리 한 번에 40회 남짓이다
  - 상태가 바뀌면 그 화면으로 바뀐다(R-59). 404면 다른 곳에서 버린 것이라 홈으로 간다. 401이면 로그인이 풀린 것이라 load를 다시 돌려 로그인 화면으로 간다
- `failed`: "처리하지 못했어요"와 이유(R-56)
- `ready` (미리보기)
  - 위: Day 번호 입력과 `SectionChips`(R-63)
    - 미리보기에서는 묶음을 바꿔도 번호를 그대로 둔다
    - 묶음은 바뀔 때, Day는 입력이 끝날 때(`change`) 저장한다. Day가 1 이상 정수가 아니면 저장하지 않고 입력 아래에 "Day 번호는 1 이상의 정수여야 해요."를 보여 준다
  - 단어 수 "N단어"와 행: 영어, 품사, 뜻(R-60)
    - `paperEnglish`가 있으면 영어 아래에 "종이: {paperEnglish}". 사용자가 행을 고쳐도 남는다(R-61)
    - `meaningFilled`면 뜻 옆에 "AI가 채움"(R-61)
    - 영어나 뜻이 비면 그 칸에 빨간 "비어 있음"
  - 행을 누르면 `DraftItemSheet`("단어 고치기"): 영어·품사·뜻·예문·해석 입력, [저장], [이 단어 빼기](R-62). 영어와 뜻은 비울 수 없다
  - 저장·빼기·Day·묶음 변경마다 PUT(R-67). PUT은 하나씩 순서대로 보낸다(앞 요청이 끝나야 다음). 실패하면 "고친 내용을 저장하지 못했어요." 토스트
  - 아래 고정 버튼 [N단어 등록]. N이 0이면 꺼진다
    - Day가 유효하지 않으면 보내지 않고 Day 오류를 보여 준다
    - 빈 행이 있으면 보내지 않고 "영어와 뜻이 빈 단어가 있어요."를 보여 주고 첫 빈 행으로 스크롤한다(R-64)
    - 보내기 전에 남은 PUT이 끝나기를 기다린다. 등록 뒤 늦은 PUT이 404 토스트를 띄우지 않게 한다
    - 보내는 동안 버튼은 꺼진다(R-50). [버리기], 행, Day 입력, 묶음 칩도 꺼진다. 실패하면 다시 켜고 버튼 위에 이유를 보여 준다. 404면 "이미 등록했거나 버린 초안이에요."
- 등록 결과 (commit 응답, 화면 안 상태)
  - "등록했어요"와 개수 4개: 새 단어 `created`, 다른 Day에서 연결 `linked`, 이미 있음 `skipped`, 내 단어에서 옮김 `moved`(R-65)
  - [Day NN으로](`replaceState`), [홈으로]

### 클라이언트 함수

```ts
// photos.ts
shrinkPhoto(file: File): Promise<string>  // 'data:image/jpeg;base64,...', 품질 0.85, 2048px보다 작으면 키우지 않는다

// api.ts
createImport(input: { day: number; section: Section; photos: string[] }): Promise<{ draft: DraftSummary }>
getImport(id: number): Promise<{ draft: Draft }>
saveImport(id: number, input: DraftInput): Promise<{ draft: Draft }>
commitImport(id: number, input: DraftInput): Promise<ImportResult>
discardImport(id: number): Promise<void>
```

- `shrinkPhoto`: `<img>`로 디코드한 뒤 줄인 크기의 캔버스에만 그린다. iOS 캔버스 한도(약 1,677만 화소)를 넘지 않는다. Safari가 HEIC 디코딩과 EXIF 회전을 처리하므로 직접 회전하지 않는다. 다시 인코딩하므로 위치 정보 같은 EXIF가 빠진다.

### 환경 변수

| 변수 | 설명 |
|---|---|
| `OPENAI_API_KEY` | 없으면 사진 등록만 막힌다(R-51) |
| `BODY_SIZE_LIMIT` | adapter-node 요청 본문 한도. 기본 512K라 사진이 막힌다. `20M`(20,971,520바이트) ≥ 사진 5장 × 4,000,000자 + JSON 여유. `npm start`만 해당하고 `npm run dev`에는 한도가 없다 |
| `OPENAI_BASE_URL` | E2E 전용. 가짜 서버 주소. 운영에서는 비워 둔다 |

- 사용자는 실제 `.env`에 `OPENAI_API_KEY`와 `BODY_SIZE_LIMIT=20M`을 직접 넣는다(README 준비 절차).

## 5. 요구사항 매핑

| ID | 구현 |
|---|---|
| R-45 | 홈 `+page.svelte` Day 목록 끝 링크, 빈 상태 문구와 링크 |
| R-46 | `/imports/new` 파일 입력(끝에 붙음, 자리만큼만), 번호 썸네일과 빼기, `MAX_PHOTOS` |
| R-47 | `/imports/new` 묶음 칩과 Day 입력, `nextClassDay`. 서버 `startImport` 검증 |
| R-48 | `photos.ts` `shrinkPhoto`, 서버의 data URL 접두사·길이 검증 |
| R-49 | 요청 본문을 메모리에서만 다룸. `drafts`에 사진 칸 없음 |
| R-50 | [올리기]·[등록] 즉시 비활성. commit이 초안을 지워 두 번째 commit은 404 |
| R-51 | load `enabled`, `startImport`의 503 |
| R-52 | 업로드 화면의 '올리는 중…'과 실패 시 상태 유지, 성공 시 초안 화면으로 이동 |
| R-53 | `startImport`가 `runImport`를 기다리지 않음. 초안마다 따로 실행 |
| R-54 | `extract.ts` 프롬프트와 스키마 `paperEnglish`, `runImport`의 사진별 동시 호출과 순서대로 이어 붙이기 |
| R-55 | 스키마 `meaningFilled`, 프롬프트 |
| R-56 | `ExtractError` 문구, 시간 제한 240초·재시도 1번, 형제 중단, `failDraft`, `failInterruptedDrafts`, 초안 화면 `failed` |
| R-57 | 홈 load `listDrafts`, 초안 줄 |
| R-58 | `drafts` 테이블 |
| R-59 | 초안 화면 폴링과 상태별 화면 |
| R-60 | 미리보기 단어 수와 행 |
| R-61 | "종이: …", "AI가 채움" |
| R-62 | `DraftItemSheet` |
| R-63 | 미리보기 Day·묶음 컨트롤, `saveDraft` |
| R-64 | `commitDraft` → `importClean`, 클라이언트 빈 행 검사 |
| R-65 | 등록 결과 화면, `commitDraft`의 초안 삭제 |
| R-66 | [버리기] 확인 시트, `deleteDraft`, `cancelImport` |
| R-67 | 편집마다 PUT, `saveDraft` |
| R-68 | 처리 중 경과 시간 |

## 6. 의존성

| 의존성 | 버전 | 이유 | 검토한 대안 |
|---|---|---|---|
| `openai` | `~7.31.0` | 공식 SDK. 재시도, 시간 제한, 중단, 오류 클래스를 제공한다. Node 22 이상 | `fetch` 직접 호출: 재시도·오류 구분을 다시 만들어야 함 |

- `devDependencies`에 넣는다. adapter-node는 `dependencies`만 외부로 두고 나머지를 번들하므로 `node build`만으로 실행된다.
- zod는 넣지 않는다. 스키마를 JSON으로 직접 쓰고, strict 모드가 형태를 보장한다.
- 그래도 외부 응답이라 응답 처리 5단계에서 칸이 문자열이 아니면 빈 칸으로, `words`가 배열이 아니면 0개로 본다. 모델이나 SDK가 바뀌어 형태가 어긋나도 서버 오류 대신 실패 문구로 끝나게 하려는 것이다.

## 7. 비기능 요구사항

- **보안**
  - 새 API는 모두 기존 인증 아래 있다.
  - API 키는 서버 환경 변수에만 있다. 응답, 로그, 화면에 키를 내보내지 않는다.
  - 큰 본문은 `BODY_SIZE_LIMIT`가 파싱 전에 막는다. 사진 개수·길이 검증은 그 안에서 형식을 지킨다.
- **비용**
  - 사진 2장 1회 추정 약 150원(PRD 6장, S-11)
  - 재시도는 1번까지다. 실패한 시도의 토큰은 로그에 없으므로 비용은 OpenAI 사용량 화면과 맞춰 본다.
- **성능**
  - 처리 시간 목표는 S-9(5분 안 미리보기)다. 사진을 동시에 처리하므로 장수가 늘어도 시간은 가장 오래 걸린 한 장을 따른다.
- **관측성**
  - `runImport` 한 줄 로그로 시간과 토큰을 남긴다. 이 ms는 서버 처리 시간이라, S-9는 폰에서 [올리기]부터 미리보기까지를 따로 잰다.
  - 실패 원인은 초안 `error`에, 예상 밖 예외는 `console.error`에 남긴다.

## 8. 테스트 전략

### 가짜 OpenAI 서버 (`tests/support/fake-openai.mjs`)

- Node `http`로 만든다. 응답은 SDK가 `output_text`를 만들 수 있게 `object: 'response'`, `status`, `output[].type = 'message'`, `content[].type = 'output_text'`, `usage`를 갖춘다.
- 시나리오는 다음 설정 전까지 모든 요청에 적용된다. SDK 재시도도 같은 응답을 받는다. 설정하면 받은 요청 기록을 비운다.
  - 종류: 성공(단어 목록), 중간 설명 메시지 + 성공, 거절, `incomplete`(이유 지정), `failed`, JSON 아님, HTTP 오류(상태, `code`)
  - 지연(ms). 클라이언트가 끊으면 응답하지 않는다
  - `perImage`: 사진(`image_url`)마다 덮어쓸 값. 장마다 다른 결과·지연·실패를 만든다
  - 오류 응답에는 `retry-after-ms: 1`을 붙여 재시도 대기를 줄인다
- 단위 테스트는 `startFakeOpenAI()`로 프로세스 안에서 띄우고, E2E는 `playwright.config.ts`의 `webServer`(포트 4174)로 띄워 `POST /__scenario`, `GET /__requests`로 다룬다. E2E 워커는 1개라 전역 시나리오가 섞이지 않는다.
- 실제 SDK가 HTTP를 거치므로 mock 없이 요청 형태와 응답 처리를 함께 검증한다.

### 단위 (vitest)

| 파일 | 검증 |
|---|---|
| `db-migrate.test.ts` | v2 DB → v3, 기존 데이터 유지, `status` CHECK |
| `repo-drafts.test.ts` | 상태 전이 표 전부. 버린·실패 초안이 되살아나지 않음. `nextClassDay`(Day만, 초안 포함, 실패·내 단어 초안 제외, 없음). `saveDraft` 409·400(Day, 묶음, 칸 형식). `commitDraft`가 보낸 내용으로 등록하고 겹친 줄을 `skipped`로 세며 초안을 지움, 내 단어 → 수업 단어 `moved`, 빈 행이면 400이고 초안이 남음, 두 번째 commit 404 |
| `extract.test.ts` | 요청: 모델, `store: false`, 추론 강도, 사진 한 장·`detail: 'high'`, 출력 한도, strict 스키마, 키 헤더. 응답: trim, `paperEnglish` 정리, 빈 영어 제거, 사용량, 중간 설명 메시지 제외. 실패 문구 전부(연결 오류는 닫힌 포트로), 500은 2번(재시도) 요청, 시간 초과(`timeout` 옵션으로 짧게), 중단은 `ExtractError`가 아님 |
| `imports.test.ts` | `startImport` 검증(키 없음 503, 사진 0·6장, 배열 아님, 접두사, 길이, Day, 묶음, 본문 없음). 성공 → ready. 장마다 따로 호출하고 늦게 끝난 장이 있어도 순서대로 이어 붙임. 한 장 실패 → 나머지를 끊고 전체 실패. 실패 → failed. DELETE 흐름(`deleteDraft` → `cancelImport`) 뒤 행 없음 |

### E2E (Playwright, 가짜 서버)

- 사진은 테스트 안의 1×1 PNG 버퍼를 `setInputFiles`로 넣는다. 앱이 JPEG로 다시 인코딩한다. 학원 단어 대신 합성·일상 단어를 쓴다.
- E2E는 DB를 공유한다. 기본 번호 시나리오는 다른 spec보다 큰 Day 990을 만든 뒤 991을 기대하고, 나머지 시나리오는 Day 951~958을 직접 넣는다.
- 시나리오
  - 홈 Day 목록 끝 링크, 수업 단어 기본 번호, 묶음 전환에 따른 번호 칸
  - 사진 5장 한도와 빼기
  - 수업 단어: 처리 중 → 자동으로 미리보기 → 사진 2장이 JPEG로 2번 요청됨 → "종이:"·"AI가 채움" → 행 고치기·빼기 → 다시 열어도 유지 → 등록 → 결과 개수 → Day 화면과 저장된 예문 → 홈에서 초안이 사라짐
  - 내 단어: Day 없이는 올리기 꺼짐, 등록하면 내 단어 묶음
  - 미리보기에서 Day·묶음 바꿔 등록. 묶음을 바꿔도 번호 유지
  - 뜻이 빈 행이 있으면 등록되지 않음
  - 실패: 초안 화면 이유, 홈 줄 '실패', 확인 시트로 버림
  - 처리 중 초안 버리기
  - 비로그인 `/api/imports` → 401
- 키가 없는 경우는 E2E 서버가 키를 갖고 있어 단위(`startImport` 503)로 확인한다.

### 수동 확인 (실제 키, 사용자 `.env`)

- Day 01 사진으로 S-6, S-7, S-9, S-11을 잰다(PRD 2장 판정 방법). 측정한 초안은 등록하지 않고 버린다.
- 아이폰에서 HEIC 사진, 카메라 촬영, 앱 닫았다 열기(S-10), 폰만으로 등록 끝내기(S-8)

## 9. 비목표 (기술)

- 스트리밍 응답, 동시 처리 개수 제한
- 여러 서버 프로세스, 여러 기기에서 같은 초안을 동시에 편집할 때의 충돌 처리 (마지막 PUT이 이긴다)
- 업로드 멱등 키. 응답만 잃고 다시 올리면 초안이 2개 생긴다(PRD R-50)
- 토큰 사용량 저장(로그 외), 초안 자동 만료, 서버 쪽 이미지 디코드 검증

## 10. 위험

| 위험 | 대응 |
|---|---|
| `gpt-6.1-sol`의 이미지 토큰 규칙·한글 손글씨 성능이 추정과 다름 | 수동 측정 후 PRD 7장 질문에 따라 추론 강도나 모델 상수 하나만 바꾼다 |
| 사진 한 장의 단어가 많아 출력 한도나 240초에 걸림 | 나눠 찍으라는 문구로 끝난다. 측정 결과에 따라 한도를 조정한다 |
| 계정 등급의 속도 제한에 동시 호출이 걸림 | 재시도 1번 뒤 "요청이 많아…" 문구로 끝난다. 측정에서 확인한다 |
| 처리 중 서버 재시작 | 시작할 때 `failed`로 바꿔 무한 대기를 막는다(R-56) |
| 아이폰이 HEIC를 그대로 넘기거나 캔버스 한도를 넘음 | `<img>` 디코드 후 축소 크기 캔버스에만 그린다. 실기기로 확인한다 |
| `.env`에 `BODY_SIZE_LIMIT`를 빠뜨림 | `npm start`에서만 413 "요청이 너무 커요"가 난다. README 준비 절차와 `.env.example`에 적는다 |
| dev 서버에서 hooks가 다시 로드되면 처리 중 초안이 `failed`가 됨 | 개발 중에만 생긴다. `finishDraft` 조건 때문에 상태가 꼬이지는 않는다 |

## 11. 구현 순서

1. 스키마 v3와 `repo.ts` 초안 함수 (단위)
2. 가짜 OpenAI 서버와 `extract.ts` (단위)
3. `imports.ts`, API 라우트, hooks `init` (단위)
4. `photos.ts`, 업로드 화면, 초안 화면(처리 중·실패·읽기 미리보기·등록), 홈
5. 미리보기 편집과 저장(R-62, R-63, R-67), 경과 시간(R-68). 일정이 밀리면 PRD 6장 순서대로 여기서 뺀다
6. E2E
7. README, AGENTS.md, `.env.example`, MVP PRD 머리말
8. 사용자가 키를 넣은 뒤 수동 측정
