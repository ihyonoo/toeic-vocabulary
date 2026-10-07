# 단어장

토익 학원에서 종이로 받은 단어를 아이폰에서 외우는 1인용 웹앱입니다.

- Day별 단어 목록: 수업 단어(학원 종이)와 내 단어(직접 정리) 두 묶음, 영어만/뜻만/둘 다 보기와 가린 칸 터치
- 목록에서 단어를 누르면 그 단어부터 카드로 넘겨 보기 (학습 기록에는 남지 않음)
- 카드 학습: 교재순·랜덤·알파벳순, 반복 1·2·3회·계속, 묶음 선택, 좌우로 밀어 넘기기, 눌러서 예문 보기
- 북마크, 숨기기(이미 아는 단어), 통합 학습, 북마크 학습

요구사항과 설계는 `docs/prd/`, `docs/trd/`, 이후 변경은 `docs/design/`에 있습니다.

## 준비

Node 22.13 이상이 필요합니다.

```
npm install
cp .env.example .env   # APP_PASSWORD를 채운다
```

| 변수 | 설명 |
|---|---|
| `APP_PASSWORD` | 로그인과 API 인증 비밀번호 |
| `ORIGIN` | 접속 주소. `npm start`에 필수 (`http://macbook.local:3000`) |
| `DATABASE_PATH` | SQLite 파일 (기본 `data/vocab.db`) |
| `PORT` | 기본 3000 |

## 실행

```
npm run build
npm start
```

- 폰과 Mac 모두 `http://macbook.local:3000`으로 접속합니다. 폰은 Mac과 같은 와이파이에 있어야 합니다
- 다른 주소(예: `localhost`)로 접속하면 로그인이 유지되지 않습니다. `ORIGIN`과 같은 주소를 쓰세요
- 아이폰 Safari의 공유 → "홈 화면에 추가"를 누르면 앱처럼 전체 화면으로 열립니다

## 단어 등록

종이 사진을 Claude Code 대화에 첨부하면 Claude가 아래 절차로 등록합니다.

1. 묶음을 정한다
   - 학원이 나눠 준 인쇄물이면 수업 단어(`"section": "class"`, 생략 가능)
   - 사용자가 직접 정리한 노트면 내 단어(`"section": "mine"`)
   - 애매하면 사용자에게 묻는다
2. 종이 순서대로 `data/import/dayNN.json`을 만든다
   ```json
   { "day": 2, "section": "mine", "words": [{ "english": "apple", "meaning": "사과", "pos": "명사", "example": "...", "exampleKo": "..." }] }
   ```
   - 품사: 숙어·구는 `구`, 뜻 항목의 품사가 다르면 `동사, 명사`처럼 뜻 순서대로
   - 종이에서 겹치는 줄도 그대로 넣는다. 중복은 서버가 처리한다
3. Day 번호를 정한다
   - 수업 단어: 사용자가 정한 번호, 없으면 `GET /api/days`의 가장 큰 번호 + 1
   - 내 단어: 매번 사용자에게 번호를 묻는다 (기본값 없음)
4. 등록한다
   ```
   set -a; source .env; set +a
   curl -sS -X POST "$ORIGIN/api/days" -H "Authorization: Bearer $APP_PASSWORD" \
     -H 'content-type: application/json' --data @data/import/dayNN.json
   ```
5. 응답을 종이와 대조해 사용자에게 보고한다
   - `created + linked + skipped + moved` = 종이 줄 수
   - `created + linked + moved` = 고유 단어 수
   - `moved`: 같은 Day의 내 단어였다가 종이에 나와 수업 단어로 옮긴 단어. 사용자에게 알린다
6. 고칠 때
   - 단어 id 찾기: `GET /api/days/{n}` (묶음과 id가 담긴 단어 목록)
   - 예문·품사: `PATCH /api/words/{id}`
   - 묶음을 잘못 넣었을 때: `PATCH /api/days/{n}/words/{id}` 본문 `{ "section": "class" | "mine" }`
   - Day를 잘못 넣었을 때: `DELETE /api/days/{n}` 뒤 다시 등록
     - 그 Day의 내 단어와 학습 기록, 그 Day에만 있던 단어의 북마크·숨김도 함께 지워진다. 학습을 시작하기 전에만 쓴다

## 테스트

```
npm run check
npm run test:unit
npx playwright install webkit   # 처음 한 번
npm run test:e2e
```
