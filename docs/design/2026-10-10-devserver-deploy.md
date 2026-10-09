# 설계 메모: devserver 배포

- 작성일: 2026-10-10
- 상태: 확정 (spec-review 1회, 코드 리뷰 1회 반영)
- 기준 문서: `docs/prd/2026-10-07-toeic-vocab-app.md`(이하 MVP PRD) 6장 배포 전제·7장 열린 질문, `docs/prd/2026-10-09-photo-import.md`(이하 사진 등록 PRD) 7장
- 이 메모가 바꾸는 것
  - MVP PRD 6장의 배포 대상: 홈서버(노트북) → devserver
  - MVP PRD 7장과 사진 등록 PRD 7장의 열린 질문 "배포 시점, 서브도메인, 터널 방식"을 이 메모가 닫는다. 첫 배포는 이번 라운드다

## 문제

- 앱은 Mac에서만 돈다. 폰이 Mac과 같은 와이파이에 있고 Mac이 깨어 있을 때만 쓸 수 있다.
  - 그래서 이동 중 학습(MVP PRD 1장의 핵심 사용 장면)과 학원에서 사진 등록이 안 된다.
  - 화면 꺼짐 방지(MVP PRD R-40)도 HTTPS가 필요해서 아직 동작하지 않는다.
- 원래 배포 대상인 홈서버(노트북)는 충전 고장으로 쓸 수 없다.
- 지금 배포는 손으로 하는 빌드·재시작이라 main에 머지할 때마다 같은 일을 반복해야 한다.

## 성공 기준

| ID | 기준 |
|---|---|
| D-1 | 아이폰 LTE(와이파이 끔)에서 `https://voca.hwchoi.com`에 로그인하고 Day 01을 학습한다 |
| D-2 | Mac의 Day 01 단어 수(수업 99, 내 단어 40), 북마크·숨김·학습 기록이 서버에서 같다 |
| D-3 | main에 머지하면 사람 손 없이 10분 안에 서버에 반영된다. GitHub Actions 실행 기록으로 확인한다 |
| D-4 | 학습 화면에서 화면 꺼짐 방지(MVP PRD R-40)가 동작한다 |
| D-5 | 같은 IP로 비밀번호를 10번 틀리면 11번째 시도가 429다 (E2E와 배포 뒤 한 번) |

- D-3의 10분: test 약 1분 + 빌드 약 3분 + 배포 약 1분에 여유를 둔 값이다.

## 결정

### 대상과 주소

- **서버:** devserver(`hw-dev-server`). Ubuntu 24.04, x86_64, Docker 29, Compose v5
  - Tailscale 사설망 안에서만 SSH로 닿는다. 주소와 사용자 이름은 저장소에 적지 않고 시크릿에 둔다
  - 같은 서버에서 mediledger(캡스톤)가 같은 배포 방식으로 돈다. 참고 구현: 공개 저장소 `ihyonoo/locuvera`의 `.github/workflows/deploy.yml`, `deploy/ci-deploy.sh`
- **주소:** `https://voca.hwchoi.com`. `hwchoi.com`은 Cloudflare가 네임서버이고 HTTPS는 Cloudflare가 끝낸다
- **터널:** 단어장 전용 Cloudflare Tunnel을 서버에서 `cloudflared` 명령으로 만든다(로컬 관리 터널)
  - 대시보드(Zero Trust)의 토큰 방식은 Zero Trust 가입에 카드 등록이 필요해서 쓰지 않는다
  - 만들기: `cloudflared tunnel login`(사용자가 승인 링크에서 `hwchoi.com`을 고름) → `tunnel create vocabulary` → `tunnel route dns vocabulary voca.hwchoi.com`
  - 설정은 서버 `~/project/vocabulary/cloudflared/`(gitignore)에 둔다: `config.yml`과 터널 인증서 `<터널 ID>.json`
  - `tunnel login`이 받은 계정 인증서 `cert.pem`은 터널을 만든 뒤 지운다. 실행에는 필요 없고, 영역(zone)의 터널·DNS를 바꿀 수 있는 권한이라 남기지 않는다
  - 캡스톤을 내리거나 옮겨도 단어장은 영향받지 않는다
  - `config.yml`의 `ingress`: `voca.hwchoi.com` → `http://vocabulary:3000`, 나머지는 404
- **서버 포트:** 앱 포트를 호스트에 열지 않는다. 앱에는 터널로만 들어온다

### 실행 구성 (devserver `~/project/vocabulary`)

- 저장소를 clone한 폴더다. Compose 파일과 배포 스크립트를 여기서 쓴다. `.env`와 `data/`는 gitignore 대상이라 `git` 동기화에 영향받지 않는다
- **`docker-compose.yml`** (저장소 루트)
  - 서비스 `vocabulary`(`container_name: vocabulary`)
    - 이미지 `ghcr.io/ihyonoo/toeic-vocabulary:${DEPLOY_IMAGE_TAG:-latest}`
    - `./data:/app/data`, `restart: unless-stopped`
    - 환경 변수는 `.env`에서 필요한 여섯 개만 넘긴다(`ORIGIN`, `APP_PASSWORD`, `SESSION_SECRET`, `OPENAI_API_KEY`, `BODY_SIZE_LIMIT`, `ADDRESS_HEADER`). 터널 토큰은 앱에 넘기지 않는다
    - `OPENAI_API_KEY` 말고는 `${VAR:?}`로 필수 표시한다. 빠지면 Compose가 빈 문자열로 바꿔 조용히 잘못 동작하므로(빈 `BODY_SIZE_LIMIT`은 모든 POST 413, 빈 `ADDRESS_HEADER`는 모든 접속이 터널 IP 하나) `compose up`을 실패시킨다
    - healthcheck: `node -e "fetch('http://127.0.0.1:3000/login')…"`. 실행 이미지에 curl·wget이 없어서 Node로 확인한다. `interval 30s`, `start_period 30s`, `start_interval 2s`, `retries 3`
  - 서비스 `cloudflared`: `cloudflare/cloudflared:latest`, `tunnel --config /etc/cloudflared/config.yml run`
    - `./cloudflared`를 읽기 전용으로 붙인다. 인증서 JSON이 서버 사용자 전용 권한이라 컨테이너도 uid 1000으로 돈다
    - `latest`는 처음 받을 때 고정되고, 사람이 `docker compose pull`할 때만 바뀐다
  - 두 서비스는 Compose 기본 네트워크에 있다. 터널은 서비스 이름 `vocabulary`로 앱을 찾는다
- **이미지(`Dockerfile`)**
  - 빌드 단계: `node:24-slim`에서 `npm ci` → `npm run build`
  - 실행 단계: `node:24-slim`에 `build/`와 `package.json`만 둔다. 의존성이 모두 `devDependencies`라 빌드에 번들된다. `node build`로 실행한다
  - Node 24는 현재 LTS다. 개발 환경의 Node 25는 LTS가 아니다. 기존 TRD도 배포 이미지를 24 LTS로 정했다
  - 사용자 `node`(uid 1000). 서버 사용자도 uid 1000이라 `./data` 권한이 맞는다
  - `DATABASE_PATH=/app/data/vocab.db`, `PORT=3000`
  - 10-10 devserver에서 빌드해 확인: Node 24.21에서 v1 DB → v3 마이그레이션, `/login` 200, Bearer API 200, 이미지 337MB
- **서버 `.env`**

| 키 | 값 | 이유 |
|---|---|---|
| `ORIGIN` | `https://voca.hwchoi.com` | SvelteKit이 HTTPS로 판정하고 쿠키에 Secure를 붙인다 |
| `APP_PASSWORD` | Mac `.env`와 같은 값 | Mac의 Claude Code가 Bearer로 서버에 등록할 때 같은 값을 쓴다 |
| `SESSION_SECRET` | 서버에서 만든 무작위 64자 | 세션 쿠키 서명. 아래 로그인 시도 제한 참고 |
| `OPENAI_API_KEY` | Mac `.env`와 같은 값 | |
| `BODY_SIZE_LIMIT` | `20M` | 사진 등록 TRD: 사진 5장 × 4,000,000자 + JSON 여유 |
| `ADDRESS_HEADER` | `cf-connecting-ip` | 로그인 제한이 Cloudflare가 알려 준 실제 접속 IP를 쓴다. 서버에만 둔다 |

### GitHub Actions (`.github/workflows/deploy.yml`)

- 트리거: `pull_request`, main `push`, `workflow_dispatch`
- **test** (모든 트리거): `setup-node` 24 → `npm ci` → `npm run check` → `npm run test:unit`
  - 사용자가 E2E는 빼기로 했다. PR에서도 돌려 머지 전에 깨진 것을 본다
- **build** (test 통과 뒤, main의 `push`·`workflow_dispatch`만)
  - `ghcr.io/ihyonoo/toeic-vocabulary`에 `sha-<커밋>`과 `latest` 태그로 올린다
  - `GITHUB_TOKEN`(`packages: write`), `docker/setup-buildx-action`, GitHub Actions 캐시
  - 라벨 `org.opencontainers.image.source`로 패키지를 이 저장소에 연결한다
- **deploy** (build 뒤, 저장소 변수 `DEPLOY_READY == 'true'`일 때만)
  1. `tailscale/github-action`으로 사설망에 들어간다(시크릿 `TS_AUTHKEY`)
  2. `ssh-keyscan`으로 서버 호스트 키를 받아 `known_hosts`에 넣는다. Tailscale(WireGuard) 안이라 중간자 위험이 낮아 처음 받은 키를 믿는다(mediledger와 같음)
  3. 배포 전용 키(시크릿 `DEPLOY_SSH_KEY`)로 `DEPLOY_SSH_USER@DEPLOY_SSH_HOST`에 커밋 SHA만 보낸다
- **동시 실행:** 워크플로 전체에 `concurrency: ci-<ref>`를 둔다
  - main 실행은 하나씩 순서대로 돈다(`cancel-in-progress: false`). 빌드가 뒤집혀 `latest`가 옛 커밋을 가리키거나 배포 순서가 뒤바뀌지 않는다
  - PR은 ref가 달라 main을 기다리지 않고, 새 커밋이 오면 이전 PR 실행을 취소한다
- **`workflow_dispatch`:** main의 현재 커밋을 다시 테스트·빌드·배포한다. 이전 커밋을 고르는 입력은 없다

### 서버 배포 스크립트 (`deploy/ci-deploy.sh`)

- 배포 키의 `authorized_keys` 항목에 `command="/home/<사용자>/project/vocabulary/deploy/ci-deploy.sh",restrict`를 건다. 그 키로는 이 스크립트만 실행된다. 저장소에 실행 비트(100755)로 둔다
- 순서
  1. `SSH_ORIGINAL_COMMAND`가 40자리 SHA인지 확인
  2. `git fetch origin main` 뒤, SHA가 `origin/main`의 조상이고 지금 HEAD가 SHA의 조상인지 확인. 앞으로만 간다
  3. `docker pull ghcr.io/ihyonoo/toeic-vocabulary:sha-<SHA>`
  4. `git merge --ff-only <SHA>`
  5. `DEPLOY_IMAGE_TAG=sha-<SHA> docker compose up -d`
  6. 앱 컨테이너가 60초 안에 healthy가 되는지 2초마다 확인한다. 60초는 healthcheck `start_period` 30초와 시작 시간에 여유를 둔 값이다
     - 실패하면 최근 로그 50줄을 남기고 실패로 끝낸다 → Actions에 빨간불
     - 실패해도 새 컨테이너와 앞으로 간 HEAD는 그대로 둔다. 고치는 커밋이나 되돌리는 커밋을 머지해 다시 배포한다
  7. 이 앱 라벨이 붙은 쓰지 않는 이미지만 지운다(`docker image prune -af --filter label=org.opencontainers.image.source=…`). 같은 서버의 다른 프로젝트 이미지는 두고, 옛 `sha-*` 이미지는 쌓이지 않는다. 다른 프로젝트의 정리와 겹쳐 거절돼도 배포는 성공으로 끝낸다
- 스크립트 전체를 함수로 감싸 맨 끝에서 한 번 호출한다. `git merge`가 스크립트 파일을 바꿔도 이번 실행에는 영향이 없다

### 되돌리기

- main에 revert 커밋을 머지한다 → 보통 배포와 같은 길로 반영된다
- DB 마이그레이션은 앞으로만 간다. 새 버전이 스키마를 올렸으면 revert만으로 DB는 돌아가지 않는다. 그런 변경은 머지 전에 Mac에서 서버 DB 사본으로 확인한다

### 로그인 시도 제한

- 인터넷에 열리면 비밀번호 하나가 앱과 API, 그리고 OpenAI 크레딧까지 지킨다
- 규칙
  - 셀 대상: 비밀번호 확인 실패. 로그인 API 실패와, 로그인 API 밖에서 `Authorization` 헤더가 있는데 인증에 실패한 요청이다
  - 쿠키는 세지 않는다. 대신 세션 쿠키를 서버만 아는 `SESSION_SECRET`으로 서명한다(`HMAC(SESSION_SECRET, 'vocab-session-v2:' + 비밀번호)`)
    - 전에는 비밀번호만으로 계산되는 값이었다. 저장소가 공개라 계산법도 공개다 → 비밀번호 후보마다 쿠키를 만들어 보내면 제한 없이 맞혀 볼 수 있었다(코드 리뷰에서 재현)
    - 바꾸면 기존 쿠키가 무효가 된다. 새 주소에서 어차피 다시 로그인한다
    - 32자보다 짧으면 앱이 시작하지 않는다. Mac 개발 환경도 `.env`에 있어야 시작한다
    - 서버 `.env` 값은 작은따옴표로 감싼다. Compose가 따옴표 없는 값의 `$`를 변수로 읽어 조용히 자르기 때문이다
  - 첫 실패부터 15분 안에 10번째 실패가 나면, 그 IP의 비밀번호 확인을 그 시각부터 15분 동안 막는다. 막힌 동안은 맞는 비밀번호도 429이고, 시도를 세지 않는다
  - 로그인 API는 본문을 다 읽은 뒤 비밀번호 확인 직전에 막혔는지 본다. 먼저 보면 본문을 늦게 보낸 요청들이 차단 전에 모두 확인받는다
  - 15분이 지나 다시 틀리면 처음부터 센다
  - 로그인 API가 성공하면 그 IP의 기록을 지운다. Bearer 성공은 지우지 않는다
  - 429 응답은 기존 오류 형식 `{ error: { code: 'too_many_attempts', message } }`이고 문구는 "로그인 시도가 너무 많아요. 15분 뒤 다시 시도해 주세요." 로그인 화면은 서버 문구를 그대로 보여 준다
  - 10번: 사람의 오타는 넉넉히 받고, 무차별 대입은 하루 1,000번 남짓으로 묶는 값이다. 15분: 흔한 잠금 시간이다
- 구현: `src/lib/server/rateLimit.ts`의 메모리 카운터. 끝난 기록은 실패를 셀 때 1분에 한 번 지운다(IP가 많아도 비용이 제곱으로 늘지 않게). 한 프로세스라 충분하고, 재시작하면 기록이 사라진다
- IP: `event.getClientAddress()`
  - 배포에서는 `ADDRESS_HEADER=cf-connecting-ip`가 Cloudflare 헤더를 읽는다
  - 이 헤더가 없는 요청에서 부르면 adapter-node가 오류를 낸다. 그래서 비밀번호를 확인하는 요청(로그인 API, `Authorization`이 있는 요청)에서만 부른다. healthcheck의 `/login` 요청은 부르지 않는다
- 한계: 통신사 NAT처럼 IP를 여럿이 쓰면 남의 실패로 막힐 수 있고, IPv6 주소를 바꿔 가며 피할 수 있다. 1인 앱이라 받아들인다

### 첫 배포 순서

| 순서 | 누가 | 할 일 |
|---|---|---|
| 1 | 사용자 + Claude | Claude가 서버에서 `cloudflared tunnel login`을 띄우고, 사용자가 승인 링크에서 `hwchoi.com`을 Authorize. Claude가 터널 생성, DNS 연결, `config.yml` 작성, `cert.pem` 삭제 |
| 2 | 사용자 | Tailscale 재사용·임시 인증 키를 만들어 `! gh secret set TS_AUTHKEY -R ihyonoo/toeic-vocabulary` |
| 3 | Claude | 서버에 clone, 서버 `.env` 작성(Mac `.env` 값을 화면에 내지 않고 옮김), 배포 키 생성과 `authorized_keys` 등록, 시크릿 `DEPLOY_SSH_KEY`·`DEPLOY_SSH_HOST`·`DEPLOY_SSH_USER`. 개인 키는 넣은 뒤 지운다. Claude는 사용자의 개인 SSH 설정(Tailscale)으로 서버에 들어간다 |
| 4 | 사용자 | 이 브랜치 PR 머지. `DEPLOY_READY`가 없어 test·build만 돈다 |
| 5 | 사용자 | GitHub 패키지 `toeic-vocabulary`를 공개로 바꾼다. 새 GHCR 패키지는 비공개로 시작하고, 서버는 로그인 없이 받는다(mediledger와 같음) |
| 6 | Claude | Mac 서버를 끈다 → `data/vocab.db`를 서버로 복사(WAL을 쓰지 않아 파일 하나) → 서버에서 `PRAGMA integrity_check`와 Day·단어 수 확인 → 서버 clone을 main으로 `git pull`(배포 스크립트가 생김) → `DEPLOY_READY=true` → `workflow_dispatch` |
| 7 | Claude | D-2, D-3, D-5 확인 |
| 8 | 사용자 | 아이폰에서 새 주소로 홈 화면 아이콘을 다시 추가하고 로그인한다. 기기에 저장한 보기 모드·학습 설정은 주소마다 따로라 다시 고른다. D-1, D-4 확인 |

- 6단계에서 Mac 서버를 끈 뒤 배포가 끝날 때까지(약 5분) 앱을 쓸 수 없다. 받아들인다

### 배포 뒤 단어 등록 (Claude Code 경로)

- 원본은 서버 DB 하나다. Mac은 개발용이고 개발 DB는 Mac의 `data/`에 따로 둔다
- Claude Code 등록은 `https://voca.hwchoi.com/api/...`로 보낸다(README 등록 절차를 바꾼다). Mac `.env`의 `ORIGIN`은 로컬 개발 주소로 남긴다

## 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| mediledger 터널에 호스트 이름 추가 | 캡스톤 설정·네트워크에 묶여, 캡스톤을 내리면 단어장도 멈춤 |
| 대시보드(Zero Trust)에서 만든 토큰 방식 터널 | Zero Trust 가입에 카드 등록이 필요함. 사용자가 원하지 않음 |
| devserver에서 직접 빌드 | 배포마다 서버가 빌드하고, 되돌릴 때도 다시 빌드해야 함. 테스트한 산출물을 그대로 배포하는 GHCR 방식이 이미 서버에 있음 |
| GitHub self-hosted runner | 공개 저장소에서 외부 PR이 서버에서 코드를 실행할 위험이 있음 |
| 서버에서 GHCR 로그인(PAT) | 서버에 토큰이 하나 더 생김. 공개 저장소의 이미지라 공개로 둬도 잃는 것이 없음 |
| CI에서 E2E까지 실행 | 사용자가 타입·단위만 택함 |
| 수동 배포 버튼 | 사용자가 머지 시 자동 배포를 택함 |
| 이전 SHA를 골라 다시 배포하는 되돌리기 | 배포 스크립트가 앞으로만 가는 검사를 함. revert 커밋 머지로 같은 일을 함 |
| Cloudflare 규칙으로 로그인 제한 | 앱 밖 설정이라 코드와 함께 테스트할 수 없음 |
| 서버를 빈 DB로 시작 | Day 01 단어·북마크·숨김·학습 기록을 다시 만들어야 함 |

## 비목표

- DB 백업 (사용자가 백업 없음을 택함. 서버 디스크가 죽으면 데이터가 사라진다)
- CI의 E2E
- 스테이징 환경, 롤백 버튼, 이전 이미지 보관
- 모니터링·알림 (실패는 Actions 화면에서 본다)
- Cloudflare Access 같은 앞단 인증 (MVP PRD에서 기각)
- `cloudflared` 자동 갱신, 컨테이너 로그 정리 설정(Docker 기본값을 따른다)
- Tailscale 인증 키 자동 갱신. 키는 최대 90일에 만료된다. 만료되면 deploy 단계가 실패로 보이고, 새 키로 `TS_AUTHKEY`를 바꾼다
- Mac 개발 환경 변경 (`npm run dev`, `npm start`는 그대로)
- 홈서버(노트북) 배포

## 가정

| 가정 | 틀리면 |
|---|---|
| tailnet ACL이 새 CI 노드의 devserver 22번 포트 접속을 허용한다 (mediledger CI가 같은 경로로 접속함) | deploy 단계에서 SSH가 막힌다. 키에 mediledger 키와 같은 태그를 붙이거나 ACL을 고친다 |
| devserver의 SSH가 OpenSSH이고 `authorized_keys` forced-command가 먹는다 (mediledger 배포 키가 같은 방식으로 등록돼 있음) | 배포 키가 셸을 얻거나 거부된다. 3단계에서 키로 SHA가 아닌 명령을 보내 거부되는지 확인한다 |
| `hwchoi.com`이 사용자의 Cloudflare 계정에 있다 | 터널에 공개 호스트 이름을 붙일 수 없다 |
| Cloudflare가 터널 요청에 `CF-Connecting-IP`를 붙인다 | 비밀번호 확인 요청이 500이 된다. 7단계 로그인으로 확인한다 |
| 처리 중인 사진 등록이 있을 때 배포하면 그 초안은 실패가 된다 (사진 등록 TRD) | 다시 올리면 된다. 배포 시점은 사용자가 머지하는 때다 |

## 영향 범위

- 새 파일: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `deploy/ci-deploy.sh`, `.github/workflows/deploy.yml`, `src/lib/server/rateLimit.ts`, `tests/unit/rate-limit.test.ts`
- 바뀌는 파일
  - `src/hooks.server.ts`: `Authorization` 실패 집계·차단, `SESSION_SECRET` 시작 검사
  - `src/lib/server/auth.ts`, `env.ts`: 세션 쿠키를 `SESSION_SECRET`으로 서명
  - `src/routes/api/login/+server.ts`: 로그인 실패 집계·차단·성공 시 초기화
  - `tests/e2e/login.spec.ts`: 로그인 연타 429
  - `playwright.config.ts`: 앱 서버에 `ADDRESS_HEADER=x-forwarded-for`, 모든 요청에 기본 `x-forwarded-for`. 제한 테스트만 다른 IP를 써서 그 IP가 막혀도 다른 테스트의 로그인은 막히지 않는다
  - `.env.example`: 배포 전용 키 안내
  - `README.md`: 배포·되돌리기, 등록 대상 주소, 실행 안내. `AGENTS.md`: 배포 규칙·경고
  - MVP PRD·사진 등록 PRD 머리말, 진행 기록
