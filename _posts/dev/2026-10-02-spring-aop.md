---
title: "스프링 AOP(Aspect-Oriented Programming) 정리"
date: 2026-10-02
last_modified_at: 2026-10-02
categories: [dev, spring]
tags: [study note, spring, aop, proxy]
toc: true
comments: true
---

## Summary

- AOP는 로깅, 트랜잭션, 보안 검증처럼 여러 모듈에 반복되는 **횡단 관심사**를 핵심 비즈니스 로직에서 분리하는 기법이다 — 핵심은 "어디에(Pointcut) 무엇을(Advice) 적용할지"를 코드 본체와 분리해 선언하는 것
- Spring AOP는 AspectJ와 달리 **런타임 프록시 기반**이다 — 별도 컴파일/바이트코드 조작 없이 컨테이너가 빈을 감싼 프록시 객체를 만들어 등록하는 방식이라 적용 대상이 "스프링 빈의 public 메서드 호출"로 제한된다
- 프록시 방식은 두 가지뿐이다 — 인터페이스가 있으면 **JDK Dynamic Proxy**, 없으면 **CGLIB**(상속 기반). Spring Boot는 둘 다 가능해도 기본값으로 CGLIB를 쓴다
- CGLIB는 상속으로 프록시를 만들기 때문에 `final` 클래스/메서드에는 적용이 안 되고, 두 프록시 방식 모두 **같은 객체 내부의 메서드 호출(자기 호출)**에는 적용되지 않는다 — 이 둘이 실무에서 "AOP가 조용히 무시되는" 사고의 거의 전부다
- Pointcut 표현식은 "어디에 적용할지"를 선언하는 문법일 뿐이고, 실제 부가 기능은 Advice 코드에 있다 — 표현식을 외우는 것보다 `execution`, `@annotation`, `within`이 각각 무엇을 기준으로 매칭하는지 구분하는 게 중요하다
- 하나의 조인포인트에 여러 Aspect가 걸리면 적용 순서가 모호해지므로, `@Order`로 명시하지 않으면 순서를 보장할 수 없다

---

## 횡단 관심사와 AOP

여러 클래스에 공통으로 필요한 로직(로깅, 트랜잭션, 보안 검증, 캐싱)을 **횡단 관심사(Cross-Cutting Concern)** 라 부른다. 이런 로직을 매번 메서드 안에 직접 작성하면, 본질적으로 다른 역할을 하는 코드(비즈니스 로직 vs 로깅)가 한 메서드에 뒤섞인다.

```java
// AOP 없이 — 로깅이라는 관심사가 비즈니스 로직과 뒤섞임
public class OrderService {
    public void placeOrder(Order order) {
        log.info("주문 시작: {}", order);
        long start = System.currentTimeMillis();
        orderRepository.save(order);
        log.info("주문 완료: {}ms", System.currentTimeMillis() - start);
    }
}

// AOP 적용 — 로깅 코드가 메서드에서 완전히 빠짐
public class OrderService {
    public void placeOrder(Order order) {
        orderRepository.save(order);
    }
}

@Aspect
@Component
public class LoggingAspect {
    @Around("execution(* com.example..service.*.*(..))")
    public Object log(ProceedingJoinPoint joinPoint) throws Throwable {
        log.info("시작: {}", joinPoint.getSignature());
        long start = System.currentTimeMillis();
        Object result = joinPoint.proceed();
        log.info("종료: {}ms", System.currentTimeMillis() - start);
        return result;
    }
}
```

로깅 로직은 `OrderService`뿐 아니라 `PaymentService`, `UserService` 등 애플리케이션 전반에 반복해서 나타난다. 이렇게 여러 모듈을 "가로질러(cross-cutting)" 나타나는 관심사를 하나의 모듈(Aspect)로 모아 선언적으로 적용하는 것이 AOP의 목적이다.

---

## AOP 핵심 용어

| 용어 | 의미 |
|---|---|
| **Aspect** | 횡단 관심사를 모듈화한 단위 — `@Aspect` 클래스 하나 |
| **Advice** | 실제로 실행되는 부가 기능 코드, 그리고 그 코드가 실행되는 시점(before/after/around) |
| **JoinPoint** | Advice가 적용될 수 있는 지점 — Spring AOP에서는 사실상 "메서드 실행"만 해당 |
| **Pointcut** | 여러 JoinPoint 중 실제로 Advice를 적용할 대상을 선별하는 조건식 |
| **Target** | Advice가 적용되는 실제 객체(원본 빈) |
| **Weaving** | Aspect를 Target에 실제로 적용해서 Advice가 포함된 객체(프록시)를 만드는 과정 |
| **Proxy** | Weaving의 결과물 — Target을 감싸 Advice를 끼워 넣은 객체, 컨테이너에는 이 프록시가 빈으로 등록됨 |

**"JoinPoint가 사실상 메서드 실행뿐"인 이유** AspectJ는 필드 접근, 생성자 호출, 예외 핸들러 실행 등 다양한 지점을 JoinPoint로 삼을 수 있다. 반면 Spring AOP는 프록시 기반이라 프록시가 가로챌 수 있는 지점, 즉 **스프링 빈의 public 메서드 호출**만 JoinPoint가 될 수 있다. 이 차이가 아래 Weaving 시점 비교의 근본 원인이다.

---

## Weaving 시점 — Spring AOP vs AspectJ

| 방식 | Weaving 시점 | 적용 범위 | 성능 |
|---|---|---|---|
| Spring AOP | 런타임(컨테이너 구동 시 프록시 생성) | 스프링 빈의 public 메서드만 | 프록시 호출 오버헤드 있음, 설정 간단 |
| AspectJ (컴파일 타임) | `.java` 컴파일 시 바이트코드에 직접 삽입 | 모든 객체(스프링 빈 아니어도), private 메서드·생성자·필드까지 | 오버헤드 없음(프록시 자체가 없음), 별도 컴파일러(ajc) 필요 |
| AspectJ (로드 타임, LTW) | 클래스로더가 클래스를 로딩하는 시점에 바이트코드 조작 | 컴파일 타임과 동일 범위 | 별도 javaagent 설정 필요 |

**왜 대부분 Spring AOP만으로 충분한가** 로깅, 트랜잭션, 캐싱, 인가 검증 같은 실무 횡단 관심사는 대부분 "서비스 계층의 public 메서드 호출을 가로채는" 수준으로 해결된다. private 메서드나 필드 접근까지 가로채야 하는 요구는 드물고, 그런 요구가 있다면 설계 자체(왜 private 메서드에 관심사를 걸어야 하는가)를 먼저 의심해볼 만하다. 그래서 스프링 프로젝트에서는 설정이 간단한 Spring AOP(프록시 기반)가 사실상 기본값이고, AspectJ 전체 기능이 필요한 경우는 드물다.

---

## 동작 원리 — 프록시 기반

```
클라이언트 → [프록시] → 실제 객체(Target)
              ↓
     부가 기능(Advice) 실행 후 Target의 실제 메서드 호출
```

Spring AOP는 Pointcut에 매칭되는 빈을 감싸는 **프록시 객체**를 만들어 그 프록시를 컨테이너에 빈으로 등록한다. 클라이언트가 의존성 주입을 통해 받는 객체는 Target이 아니라 이 프록시이고, 프록시가 먼저 요청을 가로채 Advice를 실행한 뒤 Target의 메서드를 호출한다. 이 프록시 생성은 `BeanPostProcessor`의 구현체(`AnnotationAwareAspectJAutoProxyCreator`)가 빈 초기화 시점에 개입해서 수행한다.

### JDK Dynamic Proxy vs CGLIB

| 프록시 방식 | 조건 | 생성 방식 |
|---|---|---|
| JDK Dynamic Proxy | Target이 인터페이스를 구현한 경우 | 같은 인터페이스를 구현하는 새 클래스를 런타임에 생성 |
| CGLIB | 인터페이스 유무 무관 (Spring Boot 기본값) | Target 클래스를 **상속**한 서브클래스 생성, 메서드를 오버라이드 |

```java
public interface PaymentClient {
    void pay(Order order);
}

@Service
public class TossPaymentClient implements PaymentClient {
    public void pay(Order order) { ... }
}
```

위처럼 인터페이스가 있어도 Spring Boot는 기본적으로 CGLIB를 택한다(`spring.aop.proxy-target-class=true`가 기본값). JDK Dynamic Proxy를 강제하려면 이 설정을 `false`로 바꿔야 한다.

**CGLIB가 가진 제약이 실무 사고로 이어지는 경우**

```java
@Service
public final class OrderService { // CGLIB가 상속할 수 없음 — AOP 적용 자체가 실패
    @Transactional
    public final void placeOrder(Order order) { ... } // final 메서드는 오버라이드 불가 — 트랜잭션이 조용히 무시됨
}
```

CGLIB는 상속으로 프록시를 만들기 때문에, 클래스가 `final`이면 상속할 서브클래스를 만들 수 없어 프록시 생성 자체가 실패하거나(스프링 부트는 명시적으로 예외를 던진다), 클래스는 괜찮아도 메서드가 `final`이면 그 메서드만 오버라이드가 안 돼 **해당 메서드에는 Advice가 적용되지 않는다**. 후자가 더 위험한데, 애플리케이션 기동은 멀쩡히 되고 `@Transactional`이나 `@Cacheable`이 아무 에러 없이 무시되기 때문이다.

또한 CGLIB는 기본 생성자가 필요하다(스프링이 proxy 서브클래스를 objenesis로 생성하긴 하지만, 생성자 주입 자체와는 별개로 과거 버전에서는 기본 생성자 제약이 있었다). 최신 스프링(objenesis 사용)에서는 이 문제가 대부분 해소되었지만, 레거시 환경에서 마주칠 수 있다.

---

## Pointcut 표현식

Pointcut은 "어떤 JoinPoint에 Advice를 적용할지"를 선언하는 조건식이다.

| 지시자 | 기준 | 예시 |
|---|---|---|
| `execution` | 메서드 시그니처(접근 제어자, 반환 타입, 패키지, 클래스, 메서드명, 파라미터) | `execution(* com.example..service.*.*(..))` |
| `within` | 특정 타입(클래스/패키지) 내부의 모든 메서드 | `within(com.example.service..*)` |
| `@annotation` | 메서드에 특정 애노테이션이 붙어 있는지 | `@annotation(org.springframework.transaction.annotation.Transactional)` |
| `@within` / `@target` | 클래스에 특정 애노테이션이 붙어 있는지 | `@within(com.example.annotation.Loggable)` |
| `args` | 런타임 파라미터의 타입 | `args(com.example.Order, ..)` |
| `bean` | 빈 이름 패턴 | `bean(*Service)` |

**`execution` 표현식 뜯어보기**

```
execution(* com.example..service.*.*(..))
          │ │                │  │  └ 파라미터: 0개 이상(와일드카드)
          │ │                │  └ 메서드명: 전체
          │ │                └ 클래스명: 전체
          │ └ 패키지: com.example 이하 모든 하위 패키지의 service 패키지
          └ 반환 타입: 전체
```

**왜 `execution` 대신 `@annotation`을 쓰는 경우가 많은가** `execution`은 패키지 구조나 클래스명 같은 "위치"에 의존하기 때문에 패키지를 리팩터링하면 Pointcut도 같이 깨진다. `@annotation`은 "이 메서드에 `@Transactional`이 붙어 있는가"처럼 의도를 직접 표현하므로 구조 변경에 영향을 덜 받는다. 실제로 스프링이 제공하는 `@Transactional`, `@Cacheable`, `@Async` 같은 애노테이션 기반 AOP도 내부적으로 `@annotation` 방식 Pointcut을 쓴다.

---

## Advice 종류와 실행 순서

| 종류 | 시점 | 비고 |
|---|---|---|
| `@Before` | 메서드 실행 전 | Target 실행을 막을 수 없음 |
| `@AfterReturning` | 메서드가 정상 반환된 후 | 반환값을 `returning` 속성으로 받을 수 있음 |
| `@AfterThrowing` | 메서드가 예외를 던진 후 | 예외를 `throwing` 속성으로 받을 수 있음(흡수는 못 함) |
| `@After` | 정상/예외 여부와 무관하게 항상 | `finally`와 동일한 성격 |
| `@Around` | 메서드 실행 전후 모두 제어 | 가장 강력 — `ProceedingJoinPoint.proceed()`를 직접 호출해야 Target이 실행됨 |

```java
@Aspect
@Component
public class TimingAspect {

    @Around("@annotation(com.example.annotation.Timed)")
    public Object measure(ProceedingJoinPoint joinPoint) throws Throwable {
        long start = System.nanoTime();
        try {
            return joinPoint.proceed();          // 호출하지 않으면 Target 메서드가 아예 실행되지 않는다
        } finally {
            log.info("{}ms 소요", (System.nanoTime() - start) / 1_000_000);
        }
    }
}
```

`@Around`만 `proceed()`를 명시적으로 호출해야 한다는 점에서 다른 Advice와 다르다. 이걸 빼먹으면 Target 메서드 자체가 실행되지 않는, 흔한 실수 중 하나다.

**여러 Aspect가 겹칠 때의 순서** 하나의 메서드에 로깅 Aspect와 트랜잭션 Aspect가 동시에 적용된다면, 어느 것이 먼저 실행될지는 기본적으로 보장되지 않는다(스프링 버전·빈 등록 순서에 따라 달라질 수 있음). `@Order` 애노테이션으로 명시적으로 순서를 지정해야 한다 — 숫자가 작을수록 먼저 적용(바깥쪽 레이어)된다.

```java
@Aspect
@Order(1)  // 가장 바깥쪽 — 가장 먼저 시작, 가장 나중에 끝남
public class LoggingAspect { ... }

@Aspect
@Order(2)
public class TransactionAspect { ... }
```

---

## 자기 호출(Self-Invocation) 문제

```java
@Service
public class OrderService {

    public void placeOrder(Order order) {
        this.sendNotification(order);  // 프록시를 거치지 않은 직접 호출
    }

    @Async
    public void sendNotification(Order order) { ... }
}
```

클라이언트가 `orderService.placeOrder()`를 호출하면 이 호출은 프록시를 거친다. 하지만 `placeOrder()` 내부에서 `this.sendNotification()`을 호출하는 것은 **원본 객체(Target) 내부에서 직접** 일어나는 호출이라 프록시를 거치지 않는다. JDK Dynamic Proxy든 CGLIB든, 프록시가 개입할 수 있는 지점은 "외부에서 프록시로 들어오는 호출"뿐이기 때문이다. 그 결과 `@Async`, `@Transactional`, `@Cacheable` 같은 AOP 기반 어노테이션이 자기 호출된 메서드에서는 조용히 무시된다.

**해결책**

1. **다른 빈으로 분리**: `sendNotification()`을 별도 빈(`NotificationService`)으로 옮기고 주입받아 호출 — 가장 권장되는 방법. 책임 분리라는 설계 관점에서도 자연스럽다.
2. **`AopContext.currentProxy()`로 프록시 자신을 가져와 호출**:
   ```java
   @EnableAspectJAutoProxy(exposeProxy = true)  // 먼저 프록시 노출을 활성화해야 함
   ...
   ((OrderService) AopContext.currentProxy()).sendNotification(order);
   ```
   동작은 하지만 AOP 내부 구현(`ThreadLocal`에 프록시를 노출하는 방식)에 코드가 직접 의존하게 돼 결합도가 높아진다. 1번 방법이 불가능할 때의 차선책으로만 쓴다.

---

## 실전 활용 — 스프링이 AOP로 만든 기능들

| 기능 | 활용 |
|---|---|
| `@Transactional` | 메서드 실행 전후로 트랜잭션 시작/커밋/롤백 |
| `@Cacheable` / `@CacheEvict` | 메서드 실행 전 캐시 조회, 없을 때만 실제 메서드 실행 후 결과 캐싱 |
| `@Async` | 메서드 호출을 별도 스레드로 위임 |
| `@Retryable` (Spring Retry) | 예외 발생 시 지정한 횟수만큼 메서드 재시도 |
| `@PreAuthorize` / `@PostAuthorize` | 메서드 실행 전후로 권한 검사 |

이들은 전부 "어노테이션을 보고 프록시가 부가 기능을 끼워 넣는다"는 동일한 메커니즘 위에 있다. 그래서 **자기 호출 문제, `final` 클래스/메서드 문제도 전부 동일하게 적용된다** — `@Transactional`이 롤백되지 않거나 `@Cacheable`이 캐싱을 안 하는 사고의 상당수가 AOP 동작 원리를 모른 채 자기 호출을 하거나 `final`을 붙인 데서 비롯된다.

---

## 한계와 주의점

- **public 메서드만 가능**: 프록시는 외부에서 들어오는 호출만 가로챌 수 있으므로 `private`, `protected`, 패키지 프라이빗 메서드에는 Advice가 적용되지 않는다.
- **자기 호출 무시**: 위에서 다룬 대로, 같은 클래스 내부의 `this.method()` 호출에는 적용되지 않는다.
- **CGLIB 제약**: `final` 클래스/메서드에는 적용 불가.
- **프록시 타입 캐스팅**: JDK Dynamic Proxy는 인터페이스 타입으로만 캐스팅 가능하고, Target의 구체 클래스 타입으로 캐스팅하면 `ClassCastException`이 발생한다. CGLIB는 구체 클래스를 상속하므로 이 문제가 없다.
- **성능**: 메서드 호출마다 프록시를 거치는 오버헤드가 있지만, 대부분의 비즈니스 로직에서는 무시할 수준이다. 매우 빈번히 호출되는 저수준 유틸리티 메서드에 AOP를 거는 것은 피하는 게 좋다.

---

## Reference

- [Spring Framework Documentation — AOP](https://docs.spring.io/spring-framework/reference/core/aop.html)
- [Spring Framework Documentation — AOP APIs (Proxying mechanisms)](https://docs.spring.io/spring-framework/reference/core/aop-api/proxying.html)
- [AspectJ Documentation](https://www.eclipse.org/aspectj/doc/released/progguide/index.html)
- [스프링(Spring) 핵심 개념 정리](/dev/spring-overview)
