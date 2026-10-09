#!/usr/bin/env bash
# 배포 키의 authorized_keys forced-command로만 실행된다
# GitHub Actions가 보낸 명령은 실행되지 않고 SSH_ORIGINAL_COMMAND(커밋 SHA)로만 들어온다
# 함수로 감싸 맨 끝에서 한 번 호출한다
# git merge가 이 파일을 바꿔도 이번 실행에는 영향이 없다
set -euo pipefail

readonly IMAGE=ghcr.io/ihyonoo/toeic-vocabulary

main() {
	local sha="${SSH_ORIGINAL_COMMAND:-}"
	if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
		echo "[deploy] 40자리 커밋 SHA가 필요하다" >&2
		exit 1
	fi
	cd "$HOME/project/vocabulary"
	echo "[deploy] $(date -Iseconds) start $sha"

	# main에 있는 커밋이고, 지금보다 앞으로만 간다
	git fetch -q origin main
	git cat-file -e "$sha^{commit}"
	git merge-base --is-ancestor "$sha" origin/main
	git merge-base --is-ancestor HEAD "$sha"

	export DEPLOY_IMAGE_TAG="sha-$sha"
	docker pull -q "$IMAGE:$DEPLOY_IMAGE_TAG"
	git merge -q --ff-only "$sha"
	docker compose up -d

	# 60초 안에 healthy가 아니면 Actions에 실패로 알린다
	for _ in $(seq 1 30); do
		if [[ "$(docker inspect -f '{{.State.Health.Status}}' vocabulary)" == healthy ]]; then
			# 이 앱의 옛 이미지만 지운다 (같은 서버의 다른 프로젝트 이미지는 두고)
			# 다른 프로젝트의 정리와 겹쳐 거절돼도 배포는 성공이다
			docker image prune -af --filter "label=org.opencontainers.image.source=https://github.com/ihyonoo/toeic-vocabulary" >/dev/null || true
			echo "[deploy] $(date -Iseconds) done"
			return 0
		fi
		sleep 2
	done
	echo "[deploy] 앱이 60초 안에 healthy가 되지 않았다" >&2
	docker compose logs --tail 50 vocabulary >&2
	exit 1
}

main
