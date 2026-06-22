---
title: "GitHub Actions 트리거 유형과 CI/CD 시나리오"
date: 2026-06-22
last_modified_at: 2026-06-22
categories: [dev, ci-cd]
tags: [weekly paper, github-actions, ci-cd, devops, automation, workflow]
toc: true
comments: true
---

## Summary

- **GitHub Actions 트리거**: 워크플로우를 실행하는 이벤트로, 코드 이벤트·일정·수동·외부 호출 등 크게 네 가지 축으로 분류된다.
- 트리거를 잘못 선택하면 불필요한 파이프라인이 반복 실행되거나, 반대로 필요한 시점에 자동화가 빠지는 문제가 생긴다.
- 시나리오별로 적합한 트리거를 조합하는 것이 효율적인 CI/CD 파이프라인 설계의 핵심이다.

---

## Background

GitHub Actions는 2019년 정식 출시된 GitHub 내장 CI/CD 플랫폼이다. 워크플로우는 `.github/workflows/*.yml` 파일에 정의하며, `on:` 키로 어떤 이벤트에 반응할지를 선언한다.

트리거는 단순히 "언제 실행할지"를 정하는 것이 아니다. 잘못 설정하면 PR마다 무거운 배포 파이프라인이 돌거나, main 브랜치에 머지됐는데 테스트가 한 번도 안 도는 상황이 발생한다. 각 트리거의 동작을 정확히 이해하고 시나리오에 맞게 선택해야 한다.

---

## 트리거 유형 분류

GitHub Actions의 트리거는 크게 네 가지 축으로 나뉜다.

| 분류 | 트리거 | 요약 |
|---|---|---|
| **코드 이벤트** | `push`, `pull_request`, `pull_request_target`, `create`, `delete` | Git 작업에 반응 |
| **GitHub 이벤트** | `release`, `issue_comment`, `issues`, `discussion` | GitHub 플랫폼 활동에 반응 |
| **스케줄** | `schedule` | 정해진 시간에 실행 |
| **수동/외부** | `workflow_dispatch`, `workflow_call`, `repository_dispatch`, `workflow_run` | 직접 실행하거나 다른 워크플로우·외부 시스템에서 호출 |

---

## 코드 이벤트 트리거

### push

가장 기본적인 트리거. 특정 브랜치나 태그에 커밋이 push될 때 실행된다.

```yaml
on:
  push:
    branches:
      - main
      - 'release/**'
    paths:
      - 'src/**'
      - '*.gradle'
```

`branches`로 대상 브랜치를 한정하고, `paths`로 변경된 파일이 특정 경로에 포함될 때만 실행되도록 필터링할 수 있다. `paths` 필터를 쓰지 않으면 문서 파일 수정에도 테스트 파이프라인이 돌게 된다.

**적합한 시나리오:**
- main 브랜치 머지 후 스테이징 환경에 자동 배포
- 태그 push 시 릴리즈 빌드 아티팩트 생성

---

### pull_request

PR이 열리거나(`opened`), 새 커밋이 push될 때(`synchronize`), 머지될 때(`closed`) 등 PR 생명주기 이벤트에 반응한다.

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches:
      - main
      - develop
```

`types`를 지정하지 않으면 기본값은 `[opened, synchronize, reopened]`다.

**중요한 보안 특성:** `pull_request` 트리거는 fork PR에서 실행될 때 **읽기 권한만** 가진다. `GITHUB_TOKEN`으로 PR 코멘트 작성 같은 쓰기 작업을 할 수 없다.

**적합한 시나리오:**
- PR 단계에서의 테스트, 린트, 빌드 검증
- 코드 커버리지 리포트 생성

---

### pull_request_target

`pull_request`와 동일한 이벤트에 반응하지만, **fork의 코드가 아닌 base 브랜치(main)의 코드로 실행**된다. 그 대신 `GITHUB_TOKEN`은 쓰기 권한을 가진다.

```yaml
on:
  pull_request_target:
    types: [opened, synchronize]

jobs:
  comment:
    runs-on: ubuntu-latest
    steps:
      - name: PR에 코멘트 작성
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '✅ 리뷰 요청이 접수되었습니다.'
            })
```

> **주의**: `pull_request_target`에서 fork의 코드를 직접 체크아웃하면 악의적인 코드가 높은 권한으로 실행될 수 있다. fork PR의 코드를 실행해야 한다면 별도 검토가 필요하다.

**적합한 시나리오:**
- fork PR에 자동 코멘트 작성
- 외부 기여자 PR에 레이블 부착

---

## GitHub 이벤트 트리거

### release

GitHub Release가 생성(`created`), 발행(`published`), 편집(`edited`) 등의 상태가 될 때 실행된다.

```yaml
on:
  release:
    types: [published]
```

**적합한 시나리오:**
- GitHub Release 발행 시 Docker 이미지 빌드 및 레지스트리 푸시
- 릴리즈 노트 자동 생성
- npm/PyPI/Maven Central 패키지 자동 배포

```yaml
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Docker Hub에 이미지 푸시
        run: |
          docker build -t myapp:${{ github.event.release.tag_name }} .
          docker push myapp:${{ github.event.release.tag_name }}
```

---

### issue_comment

이슈 또는 PR에 댓글이 작성될 때 실행된다. 댓글 내용을 파싱해 특정 명령어에 반응하는 "챗봇형" 자동화에 활용한다.

```yaml
on:
  issue_comment:
    types: [created]

jobs:
  deploy-preview:
    if: |
      github.event.issue.pull_request &&
      github.event.comment.body == '/deploy-preview'
    runs-on: ubuntu-latest
    steps:
      - run: echo "프리뷰 환경 배포 시작"
```

`github.event.issue.pull_request`로 이슈가 아닌 PR 코멘트인지 구분할 수 있다.

**적합한 시나리오:**
- `/deploy-preview`, `/run-test` 같은 슬래시 커맨드로 특정 작업 트리거
- 리뷰어가 `/approve` 코멘트를 남기면 스테이징 배포 실행

---

## 스케줄 트리거

### schedule

cron 표현식으로 정해진 시간에 워크플로우를 실행한다. 시간은 **UTC 기준**이다.

```yaml
on:
  schedule:
    - cron: '0 1 * * *'    # 매일 UTC 01:00 (KST 10:00)
    - cron: '0 18 * * 5'   # 매주 금요일 UTC 18:00 (KST 토요일 03:00)
```

**주의사항:**
- 레포지토리에 최근 60일간 활동이 없으면 GitHub가 schedule 워크플로우를 자동으로 비활성화한다.
- 부하가 집중되는 정각(`:00`)을 피해 `:07`, `:23` 같은 비정각 시간을 권장한다.
- 스케줄은 정확하지 않다. GitHub Actions 부하에 따라 수분~수십 분 지연될 수 있다.

**적합한 시나리오:**
- 야간 회귀 테스트 전체 실행 (오래 걸려서 PR마다 돌리기 어려운 E2E 테스트)
- 매일 의존성 취약점 스캔 (`npm audit`, `trivy`)
- 주간 리포트 생성 및 슬랙 전송
- 데이터베이스 백업 검증

---

## 수동 / 외부 호출 트리거

### workflow_dispatch

GitHub UI, CLI, API를 통해 수동으로 워크플로우를 실행한다. `inputs`로 실행 시 파라미터를 받을 수 있다.

```yaml
on:
  workflow_dispatch:
    inputs:
      environment:
        description: '배포 대상 환경'
        required: true
        type: choice
        options:
          - staging
          - production
      version:
        description: '배포할 버전 태그'
        required: true
        type: string
      dry_run:
        description: '실제 배포 없이 검증만 실행'
        type: boolean
        default: false
```

GitHub UI에서 실행하면 드롭다운, 텍스트 입력, 체크박스 형태로 입력 폼이 나타난다.

**적합한 시나리오:**
- 운영자가 직접 승인 후 실행하는 프로덕션 배포
- 특정 환경에 대한 롤백 실행
- 온디맨드 데이터 마이그레이션

---

### workflow_call

다른 워크플로우에서 호출할 수 있는 재사용 가능한 워크플로우를 정의한다.

```yaml
# .github/workflows/reusable-test.yml
on:
  workflow_call:
    inputs:
      java-version:
        required: false
        type: string
        default: '21'
    secrets:
      DATABASE_URL:
        required: true

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: ${{ inputs.java-version }}
      - run: ./gradlew test
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

```yaml
# .github/workflows/ci.yml — 호출하는 쪽
on:
  pull_request:

jobs:
  run-tests:
    uses: ./.github/workflows/reusable-test.yml
    with:
      java-version: '21'
    secrets:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

**적합한 시나리오:**
- 여러 레포지토리가 공통 테스트/빌드 절차를 공유
- 모노레포에서 서비스별로 같은 파이프라인 재사용
- 조직 수준의 보안 스캔 워크플로우 표준화

---

### repository_dispatch

외부 시스템에서 GitHub API를 통해 워크플로우를 트리거한다. `event_type`으로 어떤 이벤트인지 구분하고 `client_payload`로 데이터를 전달한다.

```yaml
on:
  repository_dispatch:
    types: [deploy-triggered, data-updated]
```

외부 시스템에서 호출하는 방법:

```bash
curl -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/owner/repo/dispatches \
  -d '{
    "event_type": "deploy-triggered",
    "client_payload": {
      "version": "v1.2.3",
      "environment": "production"
    }
  }'
```

워크플로우 안에서 payload에 접근:

```yaml
- run: echo "버전 ${{ github.event.client_payload.version }} 배포"
```

**적합한 시나리오:**
- 사내 배포 시스템이 GitHub Actions 파이프라인을 트리거
- 다른 레포지토리의 워크플로우 완료 후 연쇄 배포
- Webhook 기반 외부 이벤트 연동

---

### workflow_run

다른 워크플로우가 완료(`completed`), 시작(`requested`), 진행 중(`in_progress`)이 될 때 실행된다.

```yaml
on:
  workflow_run:
    workflows: ['CI']
    types: [completed]
    branches: [main]

jobs:
  deploy:
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - run: echo "CI 성공 → 자동 배포"
```

`conclusion`으로 선행 워크플로우의 성공/실패 여부를 판단할 수 있다.

**`workflow_run` vs `needs`의 차이:**

| | `needs` | `workflow_run` |
|---|---|---|
| 범위 | 같은 워크플로우 파일 내 | 다른 워크플로우 파일 |
| 권한 | 동일 | `workflow_run`은 높은 권한 가능 |
| 용도 | Job 의존성 | 워크플로우 의존성 |

**적합한 시나리오:**
- CI 워크플로우 성공 후 CD 워크플로우 자동 실행 (파일을 분리하고 싶을 때)
- fork PR의 CI 완료 후 쓰기 권한이 필요한 작업 실행 (커버리지 코멘트 등)

---

## 트리거 조합 예시: 실제 CI/CD 파이프라인

실무에서는 여러 트리거를 조합해 파이프라인을 구성한다.

```
[개발자 PR 생성]
      ↓
pull_request → CI 워크플로우 (테스트, 린트, 빌드)

[PR 머지 → main]
      ↓
push(main) → 스테이징 자동 배포

[밤마다]
      ↓
schedule → E2E 전체 회귀 테스트

[릴리즈 발행]
      ↓
release(published) → 프로덕션 배포, Docker 이미지 푸시

[긴급 롤백 필요]
      ↓
workflow_dispatch → 운영자가 버전 선택 후 수동 실행
```

---

## Key Point

> **트리거는 "언제 실행할지"가 아니라 "어떤 사건에 책임을 질지"를 선언하는 것이다. `pull_request`는 코드 품질 게이트, `push`(main)는 배포 기점, `schedule`은 정기 점검, `workflow_dispatch`는 사람의 판단이 필요한 시점, `release`는 공식 배포 시점 — 각 트리거가 담당하는 책임 영역이 겹치지 않도록 설계해야 파이프라인이 예측 가능해진다.**

---

## Reference

- [GitHub Docs — Events that trigger workflows](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows) — 전체 트리거 목록 및 상세 설명
- [GitHub Docs — Reusing workflows](https://docs.github.com/en/actions/sharing-automations/reusing-workflows) — `workflow_call` 상세 가이드
- [GitHub Docs — repository_dispatch](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event) — 외부 API 호출 방법
- [GitHub Docs — Security hardening with pull_request_target](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#understanding-the-risk-of-script-injections) — `pull_request_target` 보안 주의사항