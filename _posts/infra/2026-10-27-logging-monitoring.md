---
title: "로깅과 모니터링 정리"
date: 2026-10-27
last_modified_at: 2026-10-27
categories: [infra, monitoring]
tags: [study note, logging, monitoring, observability, prometheus, grafana, elk, tracing]
toc: true
comments: true
---

## Summary

- 로깅은 "무슨 일이 있었나"(개별 이벤트), 모니터링은 "지금 상태가 어떤가"(집계된 수치)를 보는 것이다 — 둘은 대체 관계가 아니라 보완 관계다
- 관측 가능성(Observability)은 **Logs / Metrics / Traces** 세 축으로 구성되며, 각각 상세도·비용·용도가 다르다
- 로그는 **구조화(JSON)** + **레벨 구분** + **상관관계 ID(traceId)** 를 갖춰야 분산 환경에서 검색·추적이 가능하다
- 메트릭은 **Golden Signals(Latency, Traffic, Errors, Saturation)** 같은 프레임워크로 "무엇을 볼지"를 정하고, 알림은 **증상(사용자 영향) 기준**으로 건다
- Spring Boot에서는 **Actuator + Micrometer → Prometheus → Grafana** 조합이 사실상 표준 스택이다

---

## 로깅과 모니터링의 차이

| 구분 | 로깅 (Logging) | 모니터링 (Monitoring) |
|---|---|---|
| 질문 | 무슨 일이 일어났는가? | 지금 시스템은 건강한가? |
| 데이터 | 이벤트 단위의 텍스트/JSON 기록 | 시계열 수치 (CPU, 요청 수, 지연 시간 등) |
| 용량 | 크다 (요청마다 쌓임) | 작다 (집계된 값) |
| 주 용도 | 원인 분석, 감사, 디버깅 | 상태 파악, 임계치 알림, 추세 분석 |
| 시점 | 사후 분석 중심 | 실시간 감시 중심 |

일반적인 장애 대응 흐름은 **모니터링이 이상을 감지 → 알림 → 로그/트레이스로 원인 추적**이다.

---

## 관측 가능성의 세 축

```
          ┌──────── Metrics ────────┐   "에러율이 5%로 올랐다"
          │  집계된 수치 (저비용)     │
          └────────────┬────────────┘
                       ▼
          ┌──────── Traces ─────────┐   "결제 서비스 호출에서 지연됐다"
          │  요청 하나의 서비스 간 경로 │
          └────────────┬────────────┘
                       ▼
          ┌──────── Logs ───────────┐   "카드사 API 타임아웃 예외 발생"
          │  개별 이벤트 상세 (고비용)  │
          └─────────────────────────┘
```

| 축 | 설명 | 대표 도구 |
|---|---|---|
| Logs | 시간순으로 기록된 개별 이벤트 | Logback, ELK, Loki |
| Metrics | 시간에 따른 수치 집계 | Micrometer, Prometheus, CloudWatch |
| Traces | 하나의 요청이 여러 서비스를 거치는 경로와 소요 시간 | OpenTelemetry, Zipkin, Jaeger |

---

## 로깅

### 로그 레벨

| 레벨 | 용도 | 예시 |
|---|---|---|
| `ERROR` | 즉시 확인이 필요한 실패 | 결제 처리 실패, DB 연결 불가 |
| `WARN` | 당장 장애는 아니지만 주의가 필요한 상황 | 재시도 발생, 임계치 근접 |
| `INFO` | 정상적인 주요 비즈니스 흐름 | 주문 생성, 배포 시작 |
| `DEBUG` | 개발·분석용 상세 정보 | 쿼리 파라미터, 분기 판단 값 |
| `TRACE` | 가장 세밀한 흐름 추적 | 메서드 진입/종료 |

운영 환경은 보통 `INFO` 이상, 개발 환경은 `DEBUG`로 둔다. 로그 레벨은 재배포 없이 바꿀 수 있게(Actuator `loggers` 엔드포인트 등) 열어두면 장애 시 유용하다.

### SLF4J와 Logback

SLF4J는 로깅 **추상화(Facade)** 이고, Logback·Log4j2는 그 **구현체**다. 코드는 SLF4J API에만 의존하고 구현체는 교체할 수 있다. Spring Boot의 기본 구현체는 Logback이다.

```java
private static final Logger log = LoggerFactory.getLogger(OrderService.class);

log.info("주문 생성 orderId={}, userId={}", orderId, userId);   // 플레이스홀더 사용
log.error("결제 실패 orderId={}", orderId, exception);          // 마지막 인자로 예외 → 스택트레이스 출력
```

- 문자열 연결(`"..." + id`) 대신 **플레이스홀더(`{}`)** 를 쓴다 — 해당 레벨이 꺼져 있으면 문자열 조합 비용이 발생하지 않는다
- 예외는 `e.getMessage()`만 찍지 말고 **예외 객체 자체를 마지막 인자로** 넘겨 스택트레이스를 남긴다

### 구조화된 로깅 (Structured Logging)

사람이 읽는 텍스트 대신 **JSON**처럼 기계가 파싱할 수 있는 형식으로 남기면, 중앙 수집 시스템에서 필드 단위 검색·집계가 가능하다.

```json
{"timestamp":"2026-10-27T10:15:30Z","level":"ERROR","traceId":"abc-123","userId":42,"message":"결제 실패","orderId":1001}
```

### 상관관계 ID와 MDC

분산 환경에서는 한 요청의 로그가 여러 인스턴스·서비스에 흩어진다. 요청 진입 시 `traceId`를 발급해 **MDC(Mapped Diagnostic Context)** 에 넣어두면 모든 로그 라인에 자동으로 붙어 요청 단위로 묶어 볼 수 있다. 비동기 환경에서 MDC 전달이 끊기는 문제는 [MDC와 SecurityContext 전달 글]({% post_url 2026-07-13-mdc-security-context-propagation %})을 참고한다.

### 로깅 시 주의할 점

- **민감 정보 금지**: 비밀번호, 토큰, 주민번호, 카드번호는 마스킹하거나 남기지 않는다
- **과도한 로깅 지양**: 루프 안 로그, 대용량 페이로드 전체 출력은 I/O 부하와 저장 비용을 키운다
- **같은 예외를 여러 계층에서 중복 로깅하지 않는다**: 최종 처리 지점(예: `@ControllerAdvice`)에서 한 번만 남긴다
- **파일 롤링 설정**: 크기·날짜 기준으로 롤링하고 보관 기간을 둬 디스크가 가득 차는 것을 막는다
- **비동기 Appender**: 로깅 I/O가 요청 스레드를 막지 않도록 고려한다

### 중앙 집중식 로그 수집

인스턴스가 여러 대이거나 컨테이너가 수시로 사라지는 환경에서는 서버에 직접 접속해 로그를 보는 방식이 통하지 않는다. 로그를 한곳으로 모아야 한다.

| 스택 | 구성 | 특징 |
|---|---|---|
| ELK / EFK | Elasticsearch + Logstash(또는 Fluentd) + Kibana | 전문 검색 강력, 인덱싱 비용 큼 |
| PLG | Promtail + Loki + Grafana | 라벨만 인덱싱해 저렴, Grafana와 통합 |
| 클라우드 관리형 | CloudWatch Logs 등 | 운영 부담 적음, 사용량 비례 과금 |

컨테이너 환경에서는 애플리케이션이 **stdout/stderr로 출력**하고, 수집 에이전트가 이를 가져가는 방식이 일반적이다.

---

## 모니터링

### 메트릭의 종류

| 타입 | 설명 | 예시 |
|---|---|---|
| Counter | 증가만 하는 누적 값 | 총 요청 수, 총 에러 수 |
| Gauge | 오르내리는 현재 값 | 활성 스레드 수, 힙 사용량, 큐 길이 |
| Histogram / Summary | 값의 분포 (구간별 개수, 백분위) | 응답 시간 p95, p99 |

응답 시간은 평균이 아닌 **백분위(p95, p99)** 로 본다. 평균은 일부 느린 요청을 가려버리기 때문이다.

### 무엇을 볼 것인가: 프레임워크

| 프레임워크 | 대상 | 지표 |
|---|---|---|
| Golden Signals (Google SRE) | 서비스 전반 | **Latency**, **Traffic**, **Errors**, **Saturation** |
| RED | 요청 기반 서비스 | **R**ate, **E**rrors, **D**uration |
| USE | 인프라 리소스 | **U**tilization, **S**aturation, **E**rrors |

### Spring Boot 스택: Actuator + Micrometer + Prometheus + Grafana

```
[Spring Boot App]                      [Prometheus]            [Grafana]
 Actuator + Micrometer  ──(scrape)──▶  시계열 저장·쿼리  ──▶  대시보드·알림
 /actuator/prometheus   ◀─ HTTP pull ─
```

- **Actuator**: 헬스 체크, 메트릭, 로거 등 운영용 엔드포인트를 제공한다
- **Micrometer**: 메트릭 수집 **추상화 계층**(로깅의 SLF4J와 같은 역할)으로, Prometheus·Datadog·CloudWatch 등 백엔드를 교체할 수 있다
- **Prometheus**: 대상의 `/actuator/prometheus`를 주기적으로 **Pull** 방식으로 긁어 시계열 DB에 저장하고 PromQL로 조회한다
- **Grafana**: 여러 데이터 소스를 시각화하고 알림을 설정한다

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, info, prometheus
```

```java
// 커스텀 메트릭 예시
Counter.builder("order.created").tag("type", "online").register(registry).increment();
```

> Actuator 엔드포인트는 내부 정보를 노출하므로 **외부 공개를 막고** 필요한 것만 `include`하며, 인증이나 네트워크 수준 제한을 둔다.
{: .prompt-warning }

### 헬스 체크

| 종류 | 의미 | 실패 시 |
|---|---|---|
| Liveness | 프로세스가 살아 있는가 | 컨테이너 재시작 |
| Readiness | 트래픽을 받을 준비가 됐는가 | 로드밸런서·Service 대상에서 제외 |

쿠버네티스 환경에서 두 개를 구분하지 않으면, 일시적인 DB 지연 때문에 멀쩡한 Pod가 연쇄 재시작되는 문제가 생길 수 있다.

### 알림 (Alerting)

- **증상 기준으로 알린다**: "CPU 80%"보다 "에러율 5% 초과", "p99 응답 3초 초과"처럼 **사용자 영향**을 기준으로 한다
- **조치 가능한 알림만 보낸다**: 알림이 너무 많으면 무뎌진다(Alert Fatigue)
- **일시적 스파이크 방지**: "5분 이상 지속 시"처럼 지속 시간 조건을 둔다
- 심각도별로 채널을 나눈다 (예: 즉시 호출 vs 슬랙 알림)

SLI(측정 지표) → SLO(목표치) → 에러 버짓(허용 실패량) 관점으로 기준을 잡으면 알림 임계치를 근거 있게 정할 수 있다.

---

## 분산 추적 (Distributed Tracing)

마이크로서비스에서는 요청 하나가 여러 서비스를 거치므로 로그·메트릭만으로 병목 위치를 찾기 어렵다. 분산 추적은 요청에 **Trace ID**를 부여하고 각 구간을 **Span**으로 기록해 호출 경로와 소요 시간을 보여준다.

```
Trace (traceId=abc-123)
 └─ Span: API Gateway          120ms
     └─ Span: 주문 서비스        100ms
         ├─ Span: DB 조회         10ms
         └─ Span: 결제 서비스      80ms   ← 병목
```

- 서비스 간 호출 시 HTTP 헤더(W3C `traceparent` 등)로 Trace ID를 **전파**한다
- Spring Boot 3부터 Micrometer Tracing + OpenTelemetry로 구성하며, 이 `traceId`가 MDC에 들어가 로그와도 연결된다 → 트레이스에서 느린 Span을 찾고, 같은 `traceId`로 로그를 조회하는 흐름이 가능하다

---

## Reference

- [Spring Boot Reference — Logging](https://docs.spring.io/spring-boot/reference/features/logging.html)
- [Spring Boot Reference — Actuator](https://docs.spring.io/spring-boot/reference/actuator/index.html)
- [Micrometer Documentation](https://docs.micrometer.io/micrometer/reference/)
- [Prometheus Documentation — Overview](https://prometheus.io/docs/introduction/overview/)
- [Google SRE Book — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [SLF4J Manual](https://www.slf4j.org/manual.html)
