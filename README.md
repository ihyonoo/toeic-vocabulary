# 단어장

토익 학원에서 종이로 받은 단어를 아이폰에서 외우는 1인용 웹앱입니다.

- Day별 단어 목록, 영어만/뜻만/둘 다 보기와 가린 칸 터치
- 카드 학습: 교재순·랜덤·알파벳순, 반복 1·2·3회·계속, 좌우로 밀어 넘기기, 눌러서 예문 보기
- 북마크, 숨기기(이미 아는 단어), 통합 학습, 북마크 학습

요구사항과 설계는 `docs/prd/`, `docs/trd/`에 있습니다.

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

1. 종이 순서대로 `data/import/dayNN.json`을 만든다
   ```json
   { "day": 2, "words": [{ "english": "technician", "meaning": "기술자", "pos": "명사", "example": "...", "exampleKo": "..." }] }
   ```
   - 품사: 숙어·구는 `구`, 뜻 항목의 품사가 다르면 `동사, 명사`처럼 뜻 순서대로
   - 종이에서 겹치는 줄도 그대로 넣는다. 중복은 서버가 처리한다
2. Day 번호는 사용자가 정한 번호, 없으면 `GET /api/days`의 가장 큰 번호 + 1
3. 등록한다
   ```
   set -a; source .env; set +a
   curl -sS -X POST "$ORIGIN/api/days" -H "Authorization: Bearer $APP_PASSWORD" \
     -H 'content-type: application/json' --data @data/import/dayNN.json
   ```
4. 응답을 종이와 대조해 사용자에게 보고한다
   - `created + linked + skipped` = 종이 줄 수
   - `created + linked` = 고유 단어 수
5. 고칠 때
   - 예문·품사: `PATCH /api/words/{id}`
   - Day를 잘못 넣었을 때: `DELETE /api/days/{n}` 뒤 다시 등록
     - 그 Day의 학습 기록과, 그 Day에만 있던 단어의 북마크·숨김도 함께 지워진다. 학습을 시작하기 전에만 쓴다

## 테스트

```
npm run check
npm run test:unit
npx playwright install webkit   # 처음 한 번
npm run test:e2e
```
