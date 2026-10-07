# 진행 기록: 토익 학원 단어장 웹앱 MVP

- PRD: `docs/prd/2026-10-07-toeic-vocab-app.md`
- TRD: `docs/trd/2026-10-07-toeic-vocab-app.md`
- git: 브랜치 `feat/vocab-app-mvp`. 푸시·PR은 사용자 지시를 받은 뒤 한다

## 단계

| 단계 | 상태 |
|---|---|
| 1. 골격, 정규화, DB·repo 등록·조회, 인증, 홈, Day 목록 | 완료 |
| 2. 학습 세션과 학습 화면 | 완료 |
| 3. Day 01 등록 | 완료 (10-08, 111줄 → 고유 99단어, 건너뜀 12) |
| 4. 북마크·숨기기, 북마크 화면, 통합 학습 | 완료 |
| 5. 학습 기록, 수정·삭제·추가, Day 삭제·단어 수정 API | 완료 |
| 6. 알파벳순, 설정 기억, 다시 학습, 홈 화면 앱, 화면 꺼짐 방지 | 완료 |
| 코드 리뷰 | 1~3차 반영 완료 (3차 블로킹 0) |

## 요구사항

| R | 상태 | 파일 |
|---|---|---|
| R-1 | 완료 | `src/lib/server/repo.ts` (`cleanImport`), README 등록 절차 |
| R-2 | 완료 | `src/lib/domain/normalize.ts`, `src/lib/server/db.ts` (`UNIQUE`) |
| R-3 | 완료 | `src/lib/server/repo.ts` (`appendToDay`) |
| R-4 | 완료 | `src/routes/api/days/+server.ts`, `repo.importDay` |
| R-5 | 완료 | `src/routes/api/days/+server.ts`, `repo.listDays` |
| R-6 | 완료 | `src/hooks.server.ts`, `src/lib/server/auth.ts` |
| R-7 | 완료 | `src/routes/api/words/[id]/+server.ts`, `repo.updateWord` |
| R-8 | 완료 | `src/routes/api/days/[n]/+server.ts`, `repo.deleteDay` |
| R-9 | 완료 | `data/import/day01.json` (git 제외) |
| R-10~R-14 | 완료 | `src/routes/(app)/+page.svelte` |
| R-15~R-23 | 완료 | `src/lib/components/WordList.svelte`, `WordRow.svelte`, `MaskCell.svelte`, `src/routes/(app)/days/[n]/+page.svelte` |
| R-24 | 완료 | `src/routes/(app)/bookmarks/` |
| R-25~R-39 | 완료 | `src/lib/domain/session.ts`, `src/routes/(app)/study/`, `StudySheet.svelte`, `StudyCard.svelte` |
| R-40 | 완료 (실기기 확인은 HTTPS 배포 뒤) | `src/lib/client/wakeLock.ts` |
| R-41 | 완료 | `src/app.css` |
| R-42 | 완료 | `src/routes/login/`, `src/routes/api/login/+server.ts` |
| R-43 | 완료 (실기기 확인 전) | `static/manifest.webmanifest`, `static/icons/` |
| R-44 | 완료 | `.gitignore` |

## 검증

- 단위 94개, E2E 53개 통과 (WebKit 아이폰 15 프로필)
- 카드 넘김 방향: 애니메이션을 켠 상태에서 나가는 카드는 왼쪽, 들어오는 카드는 오른쪽에서 오는 것을 프레임 샘플로 확인
- S-1: Day 01 등록 응답 111줄 = 생성 99 + 건너뜀 12
- S-2, S-3, S-4: E2E로 확인
- 실기기 확인 필요: S-3(Safari 탭·홈 화면 실행), R-43, 밀기 감도

## 문서에 없지만 만든 것

- 학습 화면 헤더의 [뒤로]: TRD 4장에 추가함
- 오류 화면(`+error.svelte`), 토스트

## 코드 리뷰 1차 처리 (10-08)

| 지적 | 처리 |
|---|---|
| 퍼센트 인코딩 경로(`/%61pi/...`)로 API 인증 우회 (블로킹) | 수용. `event.route.id`로 판정, E2E 추가 |
| 카드 숨기기 연타 시 보지 못한 카드까지 숨김 | 수용. 직전 숨기기 뒤 `TAP_MAX_MS` 동안 무시 |
| 저장 중 수정 시트를 닫으면 성공을 실패로 안내 | 수용. 대상 행을 요청 전에 잡아 둠 |
| S-4 E2E가 빈 검사로 통과할 수 있음 | 수용. 첫 카드 대기, 남긴 단어가 보였는지도 확인 |
| 프로토타입 키, 큰 Day 번호, `next`의 탭 문자 | 수용. `Object.hasOwn`, `Number.isSafeInteger`, URL 파싱 판정 |
| 카드 북마크 실패 시 현재 값을 뒤집음 | 수용. 그사이 다시 누르지 않았을 때만 되돌림 (목록도 같게) |
| 화면 꺼짐 방지를 받기 전에 떠나면 해제 안 됨 | 수용 |
| 연속 삭제가 둘 다 실패하면 되돌린 행 위치가 어긋남 | 보류. 화면 순서만 틀리고 새로고침하면 맞는다. 실사용에서 문제가 되면 고친다 |
| Day 삭제 후 재등록 시 기록·북마크 손실 | 수용(문서). README 등록 절차에 경고 추가 |
| 테스트에 Day 01 단어 45개 사용 (R-44) | 수용. 일상 단어로 교체, AGENTS.md에 규칙 추가 |
| 시트 오류 분기, 저장 중 표시, 아이콘 크기, 밀기 기준 너비, 상수 위치, 주석 형식, 안 쓰는 `wordKey`·`.visually-hidden` | 수용 |
| TRD와 실제 구조가 다름 (화면 인증 위치, 디렉터리, 애니메이션, 빈 상태 등) | 수용. TRD 갱신 |
| `main`에서 작업 중 | 사용자 지시 대기. 커밋 전에 브랜치 계획을 확인받는다 |
| 진행 기록이 낡음 | 반박. 리뷰 시점 이후 갱신됨 |

## 코드 리뷰 2차 처리 (1차 수정 부분, 블로킹 0)

| 지적 | 처리 |
|---|---|
| 북마크·숨김 토글: 두 요청이 모두 실패하거나 늦게 도착하면 화면과 서버가 어긋남 | 수용. `client/flags.ts`로 요청을 줄 세우고, 마지막 요청 실패 시 서버 확인 값으로 되돌림. E2E 3가지 순서 |
| `safeNext`: 점 경로(`/.//evil.com`)가 `//evil.com`이 됨, 잘못된 URL에서 예외로 500 | 수용. 결과 재검사, 파싱 실패 시 `/` |
| 수정 저장 중 시트를 닫거나 다시 열면 오류가 사라지거나 다른 시트에 뜸 | 수용. 시트를 열 때마다 번호를 매겨 구분 (단어 추가도 같게) |
| 수정 응답이 그사이 바꾼 북마크를 덮어씀 | 수용. 글자 칸만 반영 |
| 넘김 애니메이션이 반대쪽에서 들어올 수 있음 | 수용. 시작 위치를 반영한 뒤 전환. 마지막 카드에서 끝날 때 `busy`가 굳던 회귀를 E2E가 잡아 함께 고침 |
| 매우 큰 Day 번호에서 교재순 정렬 키가 넘침 | 수용. `(day, position)` 두 열로 정렬 |
| TRD의 `wordKey` 시그니처, 401 문구, 목록 숨김 처리 | 수용. TRD 갱신 |
| 화면 꺼짐 방지 E2E가 고친 분기를 늘 거치지는 않음 | 수용. 잠금을 테스트가 직접 주도록 바꿈 |

## 코드 리뷰 3차 처리 (2차 수정 부분, 블로킹 0)

| 지적 | 처리 |
|---|---|
| 수정 시트를 다시 열어 입력하는 중 이전 저장 응답이 오면 입력이 덮이고 오류 문구가 사라짐 | 수용. 시트가 열리는 순간에만 초기화. E2E로 재현 후 수정 |
| 큰 Day 번호 정렬, 다시 열기·단어 추가 시트에 회귀 테스트 없음 | 수용. 단위 1개, E2E 2개 추가 |
| 같은 단어의 글자 수정은 줄 세우지 않아 응답 순서가 뒤집히면 어긋남 | 보류. 응답 순서가 실제로 뒤집혀야 생기고, 새로고침하면 맞는다. 실사용에서 보이면 `flags.ts`처럼 줄 세운다 |
| 카드가 넘어가는 중 화면을 떠나면 처리되지 않은 예외 | 수용. 카드가 없으면 멈춘다 |
| TRD 디렉터리에 `client/flags.ts` 없음 | 수용 |
