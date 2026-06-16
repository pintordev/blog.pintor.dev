---
title: "[프로젝트 회고] MoNew 백엔드 프로젝트를 마치며"
date: 2026-06-16
last_modified_at: 2026-06-16
categories: [log, retrospective]
tags: [retrospective, spring-boot, spring-batch, aws, ecs, cloudwatch, mongodb, postgresql, team-project]
toc: true
comments: true
---

## 프로젝트 개요

뉴스 API를 수집하고 관심사 기반으로 구독·알림을 제공하는 백엔드 서비스 **MoNew**를 6인 팀으로 개발했다. 네이버 뉴스 API와 RSS 피드를 수집해 기사를 저장하고, 사용자가 구독한 관심사에 매칭되면 알림을 발행한다. 댓글과 좋아요, 사용자 활동 이력까지 포함하는 소셜 기능도 있다.

스택은 Spring Boot + PostgreSQL(주 DB) + MongoDB(세션·활동 이력) + AWS ECS/S3/CloudWatch. Spring Batch로 뉴스 수집·기사 백업·알림 정리·로그 업로드·데이터 정리 등 여 개의 배치 Job을 운영한다.

나는 팀장을 맡았고, 도메인으로는 **관심사(Interest)** 를 담당했다. 거기에 더해 CI/CD, 배포 인프라, 공통 패턴 설계, 성능 이슈 대응 같은 인프라성 작업을 대부분 챙겼고, 팀원들 PR을 검토하며 리뷰 코멘트와 개선 제안도 병행했다.

---

## 내가 한 것들

### 관심사 도메인 — 구독·목록 조회·유사도 검사

관심사 CRUD 전체를 담당했다. 구독·취소·목록 조회·물리 삭제 API를 구현했고, 동시 등록 시 중복 키 예외와 `clearAutomatically`로 인한 `LazyInitializationException`도 수정했다.

유사도 검사는 오탈자 경로와 동의어 경로를 분리해 구현했다. 오탈자 경로는 한글을 자모 단위로 분해해 Levenshtein 거리를 측정하고, DB 조회 전 `jamo_length` 필터로 후보를 줄인다. 동의어 경로는 suffix/prefix 그룹 기반 canonical form으로 변환한 뒤 Jaccard 유사도로 비교한다. "AI"와 "인공지능"처럼 표기가 완전히 다른 경우를 커버하기 위한 설계다. 두 경로를 하나의 거리 측정으로 합치면 임계값 조정이 어렵기 때문에 분리했다. 알림 발행 시 관심사 매칭에서 전체 조회로 생기던 N+1도 함께 개선했다.

### 인증 시스템 — MongoDB 세션 기반 AuthFilter

`AuthFilter`와 MongoDB `UserSession` 세션 인증을 구현했다. 요청 헤더에서 세션 토큰을 읽어 MongoDB를 조회하고, IP /24 서브넷 검증과 슬라이딩 만료 갱신을 처리한다. 세션 만료는 TTL 인덱스로 자동 정리되기 때문에 별도 스케줄러를 두지 않았다. 어드민 전용 hard delete 엔드포인트에는 `ADMIN_TOKEN` 헤더 인증을 별도로 추가했다.

### 공통 인프라 — CI/CD, ECS, 관측성

프로젝트 초기에 GitHub Actions 파이프라인, ECS 배포, AWS S3·MongoDB 이기종 DB 연동, Codecov 커버리지 연동을 구성했다. CI는 PR/push 워크플로우를 분리해 PR에서는 Jacoco 아티팩트만 업로드하고, push에서는 이를 재사용해 Codecov에 업로드하는 식으로 중복 테스트를 제거했다. ECS 배포는 수동 stop/start 방식에서 롤링 업데이트로 전환하고 ECR 이미지 자동 정리도 붙였다.

이후 Grafana Cloud + ECS Alloy 사이드카로 Prometheus 메트릭 수집을 연동했다. AOP 기반 컨트롤러 로깅(`ControllerLoggingAspect`)을 도입해 수동 log 코드를 제거하고 MDC requestId 전파도 통일했다. CloudWatch MeterRegistry 빈이 자동 구성보다 늦게 등록되어 메트릭이 전송되지 않는 문제는 빈을 직접 등록하는 방식으로 해결했다.

### 커서 페이지네이션 공통화

기존 `cursor + after` 구조에 `idAfter` UUID tiebreaker를 추가해 `cursor + after + idAfter` 복합 커서로 개선했다. 같은 정렬값이 여러 건일 때 순서가 불확정되는 문제를 잡기 위한 변경이다. 불필요한 count 쿼리도 함께 제거하고, 팀 전체 QueryDSL 코드를 코드 리뷰를 통해 이 패턴으로 통일하는 작업도 진행했다.

### Spring Batch — 기사 백업, 로그 업로드

기사 백업 Job은 청크 단위로 기사를 읽어 JSON으로 직렬화하고 Gzip 압축 후 S3에 업로드한다. 기존 `@Scheduled` 방식에서 Spring Batch ItemReader/ItemWriter 파이프라인으로 마이그레이션했다. 로그 업로드는 CloudWatch Logs API에서 로그를 페이지 단위로 읽어 Gzip 압축 후 S3에 백업하는 구조다. ECS의 ephemeral 파일시스템에 의존하지 않기 위해 로컬 파일 방식에서 전환했다. 두 Job이 병렬 실행될 때 발생하는 PostgreSQL SSI 충돌은 Job 파라미터 유니크화로 처리했다.

### 성능 개선

Spring Cache(Caffeine)를 도입해 정적 enum 데이터를 TTL 1일로 캐싱했고, 기사 조회 수 동시 등록 중복은 `ON CONFLICT DO NOTHING`으로 멱등 처리했다. 부하 테스트 결과를 반영해 인덱스를 추가하고 `schema.sql`에 반영했다.

---

## 팀장으로서의 경험

Findex 때보다 팀 규모가 컸고(6인), 기간도 짧지 않았다. CLAUDE.md로 AI 협업 컨벤션을 팀에 도입한 것도 이번이 처음이었다.

사전 기간에 프로젝트를 미리 분석하고 컨벤션을 정해둔 덕에, 기본 구현 레벨에서는 진행이 막히는 일이 거의 없었다. 팀원들이 패턴을 물어보는 대신 바로 코드를 짜기 시작할 수 있는 환경이 만들어졌다는 게 체감됐다.

컨벤션 자체는 잘 지켜졌다. 다만, 인프라 지식을 런북이나 문서로 공유하는 것은 다음 프로젝트에서 반드시 챙겨야 할 부분이다.

---

## 아쉬웠던 것들

**정보 공유 자동화가 이루어지지 않았다.** 설정 파일 변경 시 자동 알림이나 노션 등에 버전 기록을 도입하는 식으로 했으면 팀원들에게 공유가 좀 더 수월했을 것 같다.

**성능 테스트가 마지막에 몰렸다.** `@Async` 분리, 커넥션 풀 튜닝, 인덱스 반영이 모두 마지막 이틀 안에 처리됐다. 부하 테스트를 중반부터 CI에 포함해뒀다면 더 여유 있게 대응할 수 있었을 것이다.

**배치 테스트가 얇았다.** 비즈니스 서비스 계층은 슬라이스 테스트로 커버했지만, 배치 Job과 이벤트 리스너는 실질적인 테스트 없이 로컬 검증에만 의존했다. 배치는 실수할 때 조용히 틀리는 영역이라 테스트가 특히 중요한데, 시간을 충분히 못 썼다.

---

## 배운 것들

`@Async` + `@TransactionalEventListener(AFTER_COMMIT)` 조합에서 스레드 풀 정책이 시스템 전체 자원 모델에 영향을 준다는 것을 배웠다. CallerRunsPolicy는 단순한 안전망이 아니다.

Spring Batch SSI 충돌을 경험하면서 Batch 메타 테이블의 동작 방식과 Job 파라미터 유니크화의 의미를 이해했다.

CloudWatch 메트릭 빈 등록 순서 디버깅을 통해 Spring 자동 구성과 `@ConditionalOnMissingBean` 우선순위를 직접 추적해봤다.

MongoDB TTL 인덱스로 세션 만료를 처리하는 방식을 알게 됐다. 배치로 만들려던 걸 인덱스 하나로 해결했다.

---

## 마치며

6명이 한 레포에서 300개가 넘는 PR을 합쳤다. 픽스가 많아서 아쉬운 것도 있지만, 좋아요 부하에서 p95 30초를 몇십ms로 끌어내린 것과 배치 파이프라인 전체를 직접 쌓은 건 기억에 남는다.

다음 프로젝트에서 챙길 것은 두 가지다. 인프라를 보다 단단하게 올리는 것. 그리고 성능 측정 과정을 개발 초입에 도입하는 것. 이번에 후반부에 대응하면서 여유가 부족함을 느꼈다.

---

*GitHub: [sb11-code-breakers/sb11-monew-team1](https://github.com/sb11-code-breakers/sb11-monew-team1)*
*배포: https://monew.dev*