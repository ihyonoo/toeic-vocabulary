# 단어장

토익 학원 종이 단어를 아이폰에서 외우는 1인용 웹앱. SvelteKit 2 + Node 내장 SQLite.

## 명령

| 목적 | 명령 |
|---|---|
| 타입 검사 | `npm run check` |
| 단위 테스트 | `npm run test:unit` |
| E2E | `npm run test:e2e` (빌드 후 4173 포트, `test-results/e2e.db`) |
| 개발 서버 | `npm run dev` |
| 실행 | `npm run build && npm start` (`.env` 필요) |

- 처음 E2E 전에 `npx playwright install webkit`

## 문서

- 요구사항 `docs/prd/`, 설계 `docs/trd/`, 이후 변경의 설계 메모 `docs/design/`, 진행 상황 `docs/progress/`
- 설계 메모가 PRD·TRD와 다르면 메모가 우선한다 (PRD·TRD 머리말에 표시)
- 진행 상황은 `docs/progress/2026-10-07-toeic-vocab-app.md` 하나에 이어 쓴다
- 단어 등록 절차는 `README.md`의 "단어 등록"

## 규칙

- 버전을 올리지 마라: SvelteKit 3, TypeScript 7, vitest 5. 각각 생태계 미검증, Kit 2 피어 범위 밖, Node 25 `engines` 제외
- 네이티브 모듈을 쓰지 마라. 배포 서버가 x86 리눅스다. DB는 `node:sqlite`만 쓴다
- 앱 코드의 DB 접근은 `src/lib/server/repo.ts`에만 둔다. 여러 문장이면 `tx()`로 감싼다
- 단위 테스트는 상태를 만들거나 확인할 때 `db.prepare`로 SQL을 직접 써도 된다
- 스키마 변경은 `db.ts`의 `MIGRATIONS`에 버전을 추가한다. 기존 항목을 고치지 마라
- 학습 진행 로직은 `src/lib/domain/session.ts` 순수 함수로 두고 단위 테스트로 고정한다
- 단위 테스트는 `openDb(':memory:')`로 실제 DB를 쓴다. mock을 쓰지 마라
- 예외: 마이그레이션 테스트는 이전 버전 DB를 만들어야 해서 임시 파일 DB를 쓴다 (`tests/unit/db-migrate.test.ts`)
- 제스처 임계값과 카드 넘김 시간은 `src/lib/components/gesture.ts` 상수만 고친다
- 로그인이 필요한 화면은 `src/routes/(app)/` 아래에 둔다. 화면 인증은 그 그룹의 `+layout.server.ts`가 한다
- 테스트에 학원 단어를 쓰지 마라. 합성 단어(`word001`)나 일상 단어를 쓴다

## 경고

- `data/`, `.env`는 커밋 금지. 공개 저장소이고 단어 데이터는 학원 자료다
- `node build`는 `ORIGIN`이 없으면 HTTP 요청을 https로 판정한다 → 쿠키에 Secure가 붙어 로그인이 유지되지 않는다
- 폼 액션을 만들지 마라. 출처가 `ORIGIN`과 다르면 SvelteKit이 403을 낸다. 로그인도 JSON API다
- `text/plain`, 폼 형식 본문은 API 핸들러 전에 SvelteKit이 403으로 막는다
- API 인증은 `event.route.id`로 판정한다. `event.url.pathname`은 `/%61pi/...` 같은 퍼센트 인코딩으로 우회된다
- 전역 `ssr = false`다. 보기 모드가 localStorage에만 있어 SSR하면 가린 칸이 잠깐 드러난다
- Playwright에는 터치 밀기 API가 없다. E2E의 밀기는 `page.mouse` 드래그, 실제 터치는 실기기로 확인한다
- E2E는 DB를 공유한다. 테스트마다 다른 Day 번호를 쓴다
