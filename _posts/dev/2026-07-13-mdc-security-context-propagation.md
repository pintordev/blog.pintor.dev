---
title: "비동기 환경에서 MDC와 SecurityContext를 스레드 간 전달하는 방법"
date: 2026-07-13
last_modified_at: 2026-07-13
categories: [dev, concurrency]
tags: [weekly paper, concurrency, mdc, logback, spring-security, async, thread-local]
toc: true
comments: true
---

## Summary

- **MDC(Mapped Diagnostic Context)**와 **SecurityContext**는 모두 `ThreadLocal` 기반이라, 요청을 처리하던 스레드가 바뀌는 순간(비동기 실행, 스레드풀 위임) 값이 사라진다.
- 해결의 핵심은 **작업을 제출하는 시점에 컨텍스트를 캡처**하고, **실행하는 스레드에서 복원**하는 것이다.
- Spring에서는 `TaskDecorator`로 이 캡처/복원 로직을 표준화할 수 있고, WebFlux 환경에서는 ThreadLocal 대신 Reactor `Context`를 사용해야 한다.

---

## Background

Logback의 MDC와 Spring Security의 `SecurityContextHolder`는 둘 다 `ThreadLocal`을 저장소로 사용한다. 요청이 들어오면 필터 체인에서 `traceId`나 인증 정보를 현재 스레드의 `ThreadLocal`에 저장해두고, 이후 로직에서 별도 전달 없이 어디서든 꺼내 쓸 수 있게 하는 구조다.

```java
MDC.put("traceId", "abc-123");
log.info("주문 처리 시작"); // 로그에 traceId=abc-123 자동 포함

Authentication auth = SecurityContextHolder.getContext().getAuthentication();
```

문제는 `ThreadLocal`이 이름 그대로 **스레드에 종속된 저장소**라는 점이다. `@Async`, `CompletableFuture.supplyAsync`, `ExecutorService.submit` 등으로 작업이 다른 스레드에 위임되면, 그 스레드는 원래 스레드의 `ThreadLocal` 값을 전혀 알지 못한다.

```java
@Async
public void sendNotification() {
    log.info("알림 발송"); // traceId가 사라짐 — 다른 스레드이기 때문
    Authentication auth = SecurityContextHolder.getContext().getAuthentication(); // null
}
```

로그 추적이 끊기고, 인증 정보가 없어 `AccessDeniedException`이 발생하는 등 실무에서 자주 겪는 문제의 원인이 바로 이것이다.

---

## 해결 방법 1: 수동으로 캡처 후 복원

가장 원초적인 방법은 작업을 제출하기 직전에 현재 컨텍스트를 복사해두고, 새 스레드에서 실행 시작 시 복원한 뒤 종료 시 정리하는 것이다.

```java
Map<String, String> contextMap = MDC.getCopyOfContextMap();
SecurityContext securityContext = SecurityContextHolder.getContext();

executor.submit(() -> {
    try {
        if (contextMap != null) {
            MDC.setContextMap(contextMap);
        }
        SecurityContextHolder.setContext(securityContext);

        // 실제 작업 수행
        doWork();
    } finally {
        MDC.clear();
        SecurityContextHolder.clearContext();
    }
});
```

동작 원리는 명확하지만, 비동기 호출이 있는 모든 곳에 이 보일러플레이트를 반복해야 한다는 단점이 있다.

---

## 해결 방법 2: Spring TaskDecorator

Spring은 `ThreadPoolTaskExecutor`에 `TaskDecorator`를 등록해 작업 제출/실행 시점의 래핑 로직을 한 곳에 모을 수 있게 해준다.

```java
public class ContextCopyingTaskDecorator implements TaskDecorator {

    @Override
    public Runnable decorate(Runnable runnable) {
        Map<String, String> contextMap = MDC.getCopyOfContextMap();
        SecurityContext securityContext = SecurityContextHolder.getContext();

        return () -> {
            try {
                if (contextMap != null) {
                    MDC.setContextMap(contextMap);
                }
                SecurityContextHolder.setContext(securityContext);
                runnable.run();
            } finally {
                MDC.clear();
                SecurityContextHolder.clearContext();
            }
        };
    }
}
```

```java
@Bean
public Executor taskExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(8);
    executor.setMaxPoolSize(16);
    executor.setTaskDecorator(new ContextCopyingTaskDecorator());
    executor.initialize();
    return executor;
}
```

`@Async`가 이 executor를 사용하도록 지정하면, 개발자는 매번 캡처/복원 코드를 작성할 필요 없이 `@Async` 메서드 안에서도 MDC와 SecurityContext를 그대로 사용할 수 있다.

---

## 해결 방법 3: SecurityContextHolder의 전략 모드

`SecurityContextHolder`는 내부적으로 `ThreadLocal` 외에 다른 전략도 지원한다.

```java
SecurityContextHolder.setStrategyName(SecurityContextHolder.MODE_INHERITABLETHREADLOCAL);
```

`InheritableThreadLocal`은 **자식 스레드를 생성하는 시점**에 부모 스레드의 값을 복사한다. 하지만 스레드풀은 스레드를 매번 새로 만들지 않고 재사용하므로, "작업 제출 시점의 부모 스레드"와 "실제로 값을 물려줄 자식 스레드"가 일치하지 않는다. 즉, 스레드풀 환경에서는 이 모드가 기대한 대로 동작하지 않을 수 있어 주의가 필요하다. 스레드풀을 쓰지 않는 단순한 `new Thread()` 생성 환경에서만 신뢰할 수 있다.

---

## 해결 방법 4: TransmittableThreadLocal (TTL)

Alibaba의 `TransmittableThreadLocal` 라이브러리는 스레드풀 환경에서도 안전하게 컨텍스트를 전파하도록 설계되었다. 스레드풀의 `Runnable`/`Callable`을 감싸는 전용 Executor 래퍼(`TtlExecutors`)를 제공해, "작업 제출 시점" 값을 캡처했다가 "작업 실행 시점"에 자동 복원하고 종료 후 원래 값으로 되돌린다.

```java
ExecutorService executorService = Executors.newFixedThreadPool(8);
ExecutorService ttlExecutor = TtlExecutors.getTtlExecutorService(executorService);

TransmittableThreadLocal<String> context = new TransmittableThreadLocal<>();
context.set("traceId-abc");

ttlExecutor.submit(() -> {
    System.out.println(context.get()); // "traceId-abc" — 스레드풀이어도 정상 전파
});
```

`InheritableThreadLocal`과 달리 스레드 재사용 문제를 해결했기 때문에, 대규모 스레드풀 기반 서비스에서 컨텍스트 전파가 필요할 때 널리 쓰인다.

---

## 해결 방법 5: WebFlux 환경 — Reactor Context

리액티브 스택(WebFlux)에서는 하나의 요청 처리가 여러 스레드를 오가며 논블로킹으로 실행되기 때문에 `ThreadLocal` 기반 접근 자체가 성립하지 않는다. 대신 Reactor가 제공하는 **Context**를 사용해야 한다.

```java
Mono<String> handle() {
    return Mono.deferContextual(ctx -> {
        String traceId = ctx.get("traceId");
        return Mono.just("처리 완료: " + traceId);
    })
    .contextWrite(Context.of("traceId", "abc-123"));
}
```

Reactor Context는 실행 스레드가 아니라 **구독 체인(subscription chain)**에 값을 실어 전달하므로, 스레드가 바뀌어도 값이 유지된다. Spring Security 5 이상에서는 WebFlux용 `ReactiveSecurityContextHolder`가 이 방식으로 인증 정보를 제공한다.

```java
ReactiveSecurityContextHolder.getContext()
    .map(SecurityContext::getAuthentication);
```

---

## 전략 비교

| 방법 | 적용 환경 | 스레드풀 재사용 안전성 | 구현 복잡도 |
|---|---|---|---|
| 수동 캡처/복원 | 모든 동기/비동기 코드 | O (직접 관리) | 낮음, 반복 필요 |
| Spring `TaskDecorator` | `@Async`, `ThreadPoolTaskExecutor` | O | 중간, 1회 설정으로 재사용 |
| `InheritableThreadLocal` | `new Thread()` 직접 생성 | X (스레드풀에서 오동작) | 낮음 |
| `TransmittableThreadLocal` | 스레드풀 전반 | O | 중간, 외부 라이브러리 필요 |
| Reactor `Context` | WebFlux(리액티브) | 해당 없음(스레드 개념과 무관) | 리액티브 코드 스타일 학습 필요 |

---

## Key Point

> **MDC와 SecurityContext는 모두 ThreadLocal에 의존하므로, "요청을 처리하는 스레드가 바뀌는 모든 지점"에서 값이 끊긴다는 것을 전제로 설계해야 한다. 동기 스레드풀 환경이라면 Spring의 TaskDecorator나 TransmittableThreadLocal로 캡처/복원을 표준화하고, 리액티브 스택이라면 애초에 ThreadLocal을 버리고 Reactor Context로 전환하는 것이 정답이다.**

---

## Reference

- [Spring Framework: TaskDecorator](https://docs.spring.io/spring-framework/reference/integration/scheduling.html) — 비동기 작업 실행 전후 후킹
- [Logback MDC 공식 문서](https://logback.qos.ch/manual/mdc.html) — MDC 개념 및 API
- [Alibaba TransmittableThreadLocal](https://github.com/alibaba/transmittable-thread-local) — 스레드풀 환경 컨텍스트 전파 라이브러리
- [Project Reactor: Context](https://projectreactor.io/docs/core/release/reference/#context) — 리액티브 스트림에서의 컨텍스트 전파
- [Spring Security Reactive: ReactiveSecurityContextHolder](https://docs.spring.io/spring-security/reference/reactive/authentication/index.html) — WebFlux 환경의 인증 컨텍스트 접근