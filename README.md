# 단어장

토익 학원에서 종이로 받은 단어를 아이폰에서 외우는 1인용 웹앱입니다.

- Day별 단어 목록: 수업 단어(학원 종이)와 내 단어(직접 정리) 두 묶음, 영어만/뜻만/둘 다 보기와 가린 칸 터치
- 목록에서 단어를 누르면 그 단어부터 카드로 넘겨 보기 (학습 기록에는 남지 않음)
- 카드 학습: 교재순·랜덤·알파벳순, 반복 1·2·3회·계속, 묶음 선택, 좌우로 밀어 넘기기, 눌러서 예문 보기
- 북마크, 숨기기(이미 아는 단어), 통합 학습, 북마크 학습
- 사진으로 등록: 종이 사진을 올리면 OpenAI가 단어를 뽑고, 미리보기에서 고친 뒤 Day에 등록

요구사항과 설계는 `docs/prd/`, `docs/trd/`, 이후 변경은 `docs/design/`에 있습니다.

## 준비

Node 22.13 이상이 필요합니다.

```
npm install
cp .env.example .env   # APP_PASSWORD, OPENAI_API_KEY를 채운다
```

| 변수 | 설명 |
|---|---|
| `APP_PASSWORD` | 로그인과 API 인증 비밀번호 |
| `SESSION_SECRET` | 세션 쿠키 서명용 무작위 값(`openssl rand -hex 32`). 없으면 시작하지 않는다 |
| `ORIGIN` | 접속 주소. `npm start`에 필수 (`http://macbook.local:3000`) |
| `DATABASE_PATH` | SQLite 파일 (기본 `data/vocab.db`) |
| `PORT` | 기본 3000 |
| `OPENAI_API_KEY` | 사진 등록용. 없으면 사진 등록만 막힌다 |
| `BODY_SIZE_LIMIT` | 요청 본문 한도. `20M`으로 둔다. 빠뜨리면 `npm start`에서 사진 업로드가 413 "요청이 너무 커요"로 실패한다 |

## 사용

- 주소: `https://voca.hwchoi.com` (devserver 배포, 아래 "배포")
- 아이폰 Safari의 공유 → "홈 화면에 추가"를 누르면 앱처럼 전체 화면으로 열립니다

## 로컬 실행 (개발)

```
npm run build
npm start
```

- 개발 DB는 Mac의 `data/`에 따로 있습니다. 실제 단어는 서버에 있습니다
- 폰과 Mac 모두 `http://macbook.local:3000`으로 접속합니다. 폰은 Mac과 같은 와이파이에 있어야 합니다
- 다른 주소(예: `localhost`)로 접속하면 로그인이 유지되지 않습니다. `ORIGIN`과 같은 주소를 쓰세요

## 배포

설계는 `docs/design/2026-10-10-devserver-deploy.md`에 있습니다.

- main에 머지하면 GitHub Actions가 단위 테스트 → 이미지 빌드(`ghcr.io/ihyonoo/toeic-vocabulary`) → devserver 배포를 합니다
- 배포는 저장소 변수 `DEPLOY_READY`가 `true`일 때만 합니다
- 같은 커밋을 다시 배포하려면 Actions의 "CI and Deploy"를 `workflow_dispatch`로 실행합니다
- 되돌리려면 main에 revert 커밋을 머지합니다. DB 마이그레이션은 되돌아가지 않습니다
- 서버 구성: devserver `~/project/vocabulary`(이 저장소 clone)에서 `docker-compose.yml`로 앱과 `cloudflared`를 띄웁니다
  - 서버 `.env`: `ORIGIN=https://voca.hwchoi.com`, `APP_PASSWORD`, `SESSION_SECRET`, `OPENAI_API_KEY`, `BODY_SIZE_LIMIT=20M`, `ADDRESS_HEADER=cf-connecting-ip`
  - `OPENAI_API_KEY` 말고는 필수다. 빠지면 `docker compose up`이 실패한다
  - 값은 작은따옴표로 감싼다. Compose는 따옴표 없는 값의 `$`를 변수로 읽어 값을 자른다
  - DB: `~/project/vocabulary/data/vocab.db`
  - 터널: 서버에서 `cloudflared` 명령으로 만든 터널 `vocabulary`. 설정은 `~/project/vocabulary/cloudflared/`의 `config.yml`과 터널 인증서 JSON(gitignore)
    - 호스트 이름을 바꾸려면 `config.yml`의 `ingress`를 고치고 `cloudflared tunnel route dns vocabulary <새 이름>` 뒤 `docker compose restart cloudflared`
    - 터널 관리 명령에는 `cloudflared tunnel login`으로 받는 `cert.pem`이 필요하다. 쓰고 나면 지운다
  - 로그: `docker compose logs vocabulary`
- 저장소 시크릿: `TS_AUTHKEY`(Tailscale 인증 키, 최대 90일 만료), `DEPLOY_SSH_KEY`, `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`
  - Tailscale 키가 만료되면 deploy 단계가 실패합니다. 새 키로 `gh secret set TS_AUTHKEY`
- 배포 키는 서버 `authorized_keys`에서 `deploy/ci-deploy.sh`만 실행하도록 묶여 있습니다

## 사진으로 등록 (앱)

1. 홈 Day 목록 끝의 '사진으로 등록'에서 사진 1~5장을 쌓는다. 쌓인 순서가 종이 순서다
2. 묶음과 Day 번호를 정하고 올린다
   - 수업 단어: 등록된 Day와 처리 중·확인 대기인 수업 단어 초안 중 가장 큰 번호 + 1이 기본값
   - 내 단어: 번호를 직접 넣는다
3. 서버가 사진마다 OpenAI(`gpt-6.1-sol`)를 불러 단어·품사·뜻·예문·해석을 만든다. 앱을 닫아도 계속 처리되고, 홈의 '사진 등록' 영역에 초안이 남는다
4. 미리보기에서 고치고 등록한다. 등록 규칙은 아래 Claude 경로와 같다
   - "종이: …"는 AI가 철자를 고친 행의 원래 철자, "AI가 채움"은 종이에 없던 뜻
- 서버 로그의 `[import]` 줄에 처리 시간과 토큰 수가 남는다. 비용은 OpenAI 사용량 화면과 맞춰 본다

## 단어 등록 (Claude Code)

종이 사진을 Claude Code 대화에 첨부하면 Claude가 아래 절차로 등록합니다. 등록 대상은 서버(`https://voca.hwchoi.com`)입니다. Mac `.env`의 `ORIGIN`은 로컬 개발 주소라 쓰지 않습니다.

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
     - 앱에 처리 중이거나 확인 대기인 사진 초안이 있으면 그 번호와 겹칠 수 있다. 사용자에게 확인한다
   - 내 단어: 매번 사용자에게 번호를 묻는다 (기본값 없음)
4. 등록한다
   ```
   set -a; source .env; set +a
   curl -sS -X POST "https://voca.hwchoi.com/api/days" -H "Authorization: Bearer $APP_PASSWORD" \
     -H 'content-type: application/json' --data @data/import/dayNN.json
   ```
5. 응답을 종이와 대조해 사용자에게 보고한다
   - `created + linked + skipped + moved` = 종이 줄 수
   - `created + linked + moved` = 고유 단어 수
   - `moved`: 같은 Day의 내 단어였다가 종이에 나와 수업 단어로 옮긴 단어. 사용자에게 알린다
6. 고칠 때
   - 단어 id 찾기: `GET /api/days/{n}` (묶음과 id가 담긴 단어 목록, 주소는 4와 같다)
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
