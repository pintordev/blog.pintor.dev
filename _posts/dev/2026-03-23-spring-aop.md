---
title: "Spring AOP"
date: 2026-03-23
last_modified_at: 2026-03-23
categories: [dev, spring]
tags: [spring, aop, aspect, pointcut, advice, proxy, transaction, logging]
toc: true
comments: true
---

## Summary

- AOP는 **횡단 관심사(Cross-Cutting Concern)** 를 핵심 로직에서 분리하는 기법이다.
- 로깅, 트랜잭션, 보안처럼 여러 곳에 반복되는 코드를 한 곳에서 관리한다.
- Spring AOP는 **프록시 기반**으로 동작하며, 실제 객체를 감싸는 프록시가 부가 기능을 처리한다.

---

## Background

비즈니스 로직을 작성하다 보면 핵심과 관계없는 코드가 반복된다.

```java
public void placeOrder(Order order) {
    log.info("주문 시작: {}", order); // 로깅
    try {
        // 핵심 비즈니스 로직
        orderRepository.save(order);
        paymentService.pay(order);
    } catch (Exception e) {
        log.error("주문 실패", e);    // 로깅
        throw e;
    }
    log.info("주문 완료: {}", order); // 로깅
}
```

로깅, 트랜잭션 처리가 모든 메서드에 반복된다. 요구사항이 바뀌면 수백 개의 메서드를 수정해야 한다.

AOP는 이 **횡단 관심사를 분리**해 핵심 로직이 비즈니스에만 집중하게 한다.

---

## 핵심 개념

| 용어 | 설명 |
|:--:|---|
| **Aspect** | 횡단 관심사를 모듈화한 것. Pointcut + Advice의 조합. |
| **Pointcut** | Advice를 적용할 지점(메서드)을 선정하는 표현식 |
| **Advice** | Pointcut에서 실행할 부가 기능 (Before, After, Around 등) |
| **JoinPoint** | Advice가 적용될 수 있는 실제 실행 시점 |

---

## 코드 예시

### 로깅 Aspect

```java
@Aspect
@Component
public class LoggingAspect {

    @Around("execution(* com.example.service.*.*(..))")
    public Object logExecutionTime(ProceedingJoinPoint joinPoint) throws Throwable {
        long start = System.currentTimeMillis();
        log.info("메서드 시작: {}", joinPoint.getSignature());

        Object result = joinPoint.proceed(); // 실제 메서드 실행

        long elapsed = System.currentTimeMillis() - start;
        log.info("메서드 완료: {}ms", elapsed);
        return result;
    }
}
```

service 패키지의 모든 메서드 호출 전후에 자동으로 로그가 남는다.

### 트랜잭션 (@Transactional)

Spring의 `@Transactional`도 AOP로 구현되어 있다.

```java
@Service
public class OrderService {

    @Transactional
    public void placeOrder(Order order) {
        // 트랜잭션 시작/커밋/롤백은 AOP가 처리
        orderRepository.save(order);
        paymentService.pay(order);
    }
}
```

---

## 프록시 기반 동작

Spring AOP는 Bean을 감싸는 **프록시 객체**를 생성해 동작한다.

```
클라이언트 → 프록시 (Advice 실행) → 실제 Bean
```

```java
// 실제로는 이런 동작이 일어난다
OrderService proxy = new OrderServiceProxy(realOrderService);
proxy.placeOrder(order);
// 내부: before() → realOrderService.placeOrder() → after()
```

Spring Boot에서는 기본적으로 **CGLIB 프록시**를 사용한다.

---

## 주요 활용 사례

| 사례 | 설명 |
|---|---|
| 트랜잭션 관리 | `@Transactional` |
| 실행 시간 측정 | 메서드 전후 시간 기록 |
| 접근 제어 | 권한 확인 후 메서드 실행 |
| 예외 변환 | 특정 예외를 공통 예외로 변환 |
| 캐싱 | `@Cacheable` |

---

## Key Point

> **AOP는 로깅·트랜잭션 같은 횡단 관심사를 핵심 로직에서 분리한다. Spring은 프록시로 이를 구현하며, @Transactional이 대표적인 사례다.**

---

## Reference

- [Spring AOP — Spring Docs](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#aop)
- [Aspect Oriented Programming — Wikipedia](https://en.wikipedia.org/wiki/Aspect-oriented_programming)