---
title: "스프링(Spring) 핵심 개념 정리"
date: 2026-08-06
last_modified_at: 2026-08-13
categories: [dev, spring]
tags: [study note, spring, ioc, di, aop, mvc, transaction, spring-boot]
toc: true
comments: true
---

## Summary

- IoC는 "객체 생성과 생명주기 관리를 컨테이너에게 넘긴다"는 원칙이고, DI는 그 원칙을 구현하는 대표적인 방법이다 — 둘을 동일시하면 안 된다
- 생성자 주입을 권장하는 이유는 단순히 "베스트 프랙티스"가 아니라 불변성 보장, 순환 참조의 조기 발견, 테스트 용이성이라는 구체적인 근거 때문이다
- 싱글톤 빈 안에서 프로토타입 빈을 매번 새로 받고 싶다면 `ObjectProvider`나 스코프 프록시 없이는 불가능하다 — 의존성은 생성 시점에 한 번만 주입되기 때문이다
- Spring AOP와 `@Transactional`은 같은 메커니즘(프록시 기반 AOP) 위에서 동작한다 — 그래서 둘 다 "자기 호출(self-invocation)" 문제를 똑같이 겪는다
- `@Transactional`이 실패해도 롤백되지 않는 대부분의 사고는 체크 예외를 던지거나, `private`/자기 호출 메서드에 붙이거나, 프록시를 거치지 않고 직접 호출했을 때 발생한다
- `@SpringBootApplication`의 자동 설정은 마법이 아니라 클래스패스에 무엇이 있는지(`@ConditionalOnClass`)를 보고 조건부로 빈을 등록하는 것뿐이다

---

## IoC와 DI

**IoC(Inversion of Control, 제어의 역전)** 는 객체의 생성, 의존관계 설정, 생명주기 관리를 개발자가 직접 하지 않고 프레임워크(컨테이너)에게 넘기는 설계 원칙이다. **DI(Dependency Injection, 의존성 주입)** 는 그 IoC를 구현하는 구체적인 방법 중 하나로, 필요한 의존 객체를 외부(컨테이너)가 대신 생성해서 넣어준다.

```java
// IoC를 적용하지 않은 코드 — 객체가 스스로 의존성을 생성(제어권을 직접 가짐)
public class OrderService {
    private final PaymentClient paymentClient = new TossPaymentClient();
}

// IoC 적용 — 생성 책임이 외부(컨테이너)로 넘어감
@Service
public class OrderService {
    private final PaymentClient paymentClient;

    public OrderService(PaymentClient paymentClient) {  // 컨테이너가 주입
        this.paymentClient = paymentClient;
    }
}
```

**주입 방식 3가지와 왜 생성자 주입을 권장하는가**

| 방식 | 특징 |
|---|---|
| 필드 주입 | `@Autowired` 필드에 직접, 코드는 짧지만 `final` 불가·테스트 어려움 |
| 세터 주입 | 선택적 의존성에 적합, 객체 생성 후에도 재조립 가능 |
| 생성자 주입 | 객체 생성 시점에 모든 의존성이 강제로 채워짐 |

생성자 주입이 권장되는 이유는 세 가지다.

- **불변성**: 필드를 `private final`로 선언할 수 있어, 생성 이후 의존성이 바뀔 수 없다는 것을 컴파일러가 보장한다.
- **순환 참조의 조기 발견**: 필드/세터 주입은 컨테이너가 빈을 먼저 생성한 뒤 나중에 주입하므로 순환 참조가 있어도 일단 애플리케이션이 뜬다(런타임에야 문제가 드러남). 생성자 주입은 빈 생성 자체가 서로를 필요로 하므로, 순환 참조가 있으면 컨테이너 구동 시점에 `BeanCurrentlyInCreationException`으로 즉시 실패한다.
- **테스트 용이성**: `new OrderService(mockPaymentClient)`처럼 스프링 컨테이너 없이 순수 자바 코드로 목 객체를 주입해 테스트할 수 있다.

**`ApplicationContext`와 `BeanFactory`**

`BeanFactory`는 DI 컨테이너의 최상위 인터페이스로 빈을 지연 로딩(lazy loading)한다. `ApplicationContext`는 `BeanFactory`를 확장해 국제화(MessageSource), 이벤트 발행(ApplicationEventPublisher), 빈의 즉시 로딩(eager loading) 등 엔터프라이즈 기능을 추가한 것이다. 실무에서는 사실상 항상 `ApplicationContext`를 사용한다.

---

## Bean 생명주기와 스코프

**생명주기**

```
빈 생성 → 의존관계 주입 → 초기화 콜백(@PostConstruct) → 사용 → 소멸 콜백(@PreDestroy)
```

```java
@Component
public class DatabaseConnector {

    @PostConstruct
    public void connect() {
        // 의존성 주입이 끝난 뒤, 빈이 실제로 사용되기 전에 한 번 호출된다
    }

    @PreDestroy
    public void disconnect() {
        // 컨테이너가 종료(close)될 때 호출된다
    }
}
```

생성자에서 초기화 로직을 처리하지 않고 `@PostConstruct`를 따로 두는 이유는, 생성자가 호출되는 시점에는 아직 의존성 주입이 끝나지 않았을 수 있기 때문이다(특히 필드/세터 주입 조합 시). `@PostConstruct`는 모든 의존성 주입이 완료된 뒤 호출되는 것이 보장된다.

**스코프**

| 스코프 | 설명 |
|---|---|
| `singleton` (기본값) | 컨테이너당 인스턴스 1개, 모든 요청이 같은 객체를 공유 |
| `prototype` | `getBean()` 호출마다 새 인스턴스 생성 |
| `request` | HTTP 요청 1건당 1개 (웹 환경) |
| `session` | HTTP 세션 1개당 1개 (웹 환경) |

**싱글톤 빈이 상태를 가지면 안 되는 이유**: 싱글톤은 여러 스레드(여러 HTTP 요청)가 동일 인스턴스를 동시에 공유한다. 필드에 요청별 데이터를 저장하면 다른 요청이 그 값을 덮어써 레이스 컨디션이 발생한다. 그래서 싱글톤 빈은 상태가 없는(stateless) 설계가 원칙이다.

**싱글톤 안에서 프로토타입 빈을 쓸 때 생기는 문제**

```java
@Component
@Scope("singleton")
public class SingletonBean {
    private final PrototypeBean prototypeBean;  // 생성 시점에 딱 한 번만 주입됨

    public SingletonBean(PrototypeBean prototypeBean) {
        this.prototypeBean = prototypeBean;
    }
}
```

`PrototypeBean`은 매번 새 인스턴스를 만드는 것이 목적인 빈인데, `SingletonBean`은 생성 시점에 딱 한 번 주입받은 프로토타입 인스턴스를 계속 재사용하게 된다. 싱글톤 빈 자체가 컨테이너 구동 시 딱 한 번만 생성되기 때문에, 필드 주입도 그 순간에만 일어나는 것이 당연한 결과다. 매번 새 프로토타입 인스턴스가 필요하다면 `ObjectProvider<PrototypeBean>`으로 필요한 시점에 직접 `getObject()`를 호출하거나, 프록시 기반 스코프(`proxyMode = ScopedProxyMode.TARGET_CLASS`)로 호출마다 실제 빈을 다시 찾도록 우회해야 한다.

---

## AOP

**AOP(Aspect-Oriented Programming)** 는 로깅, 트랜잭션, 보안 검증처럼 여러 모듈에 반복되는 **횡단 관심사(Cross-Cutting Concern)** 를 핵심 비즈니스 로직에서 분리하는 기법이다.

**동작 원리 — 프록시 기반**

```
클라이언트 → [프록시] → 실제 객체
              ↓
          부가 기능(Advice) 실행 후 실제 메서드 호출
```

Spring AOP는 대상 빈을 감싸는 **프록시 객체**를 만들어 컨테이너에 등록한다. 클라이언트가 빈을 호출하면 실제로는 프록시가 먼저 요청을 받아 부가 기능(로깅, 트랜잭션 시작 등)을 실행한 뒤 실제 객체의 메서드를 호출한다.

| 프록시 방식 | 조건 |
|---|---|
| JDK Dynamic Proxy | 대상이 인터페이스를 구현한 경우 |
| CGLIB | 인터페이스가 없는 클래스 기반 (Spring Boot 기본값) |

**Advice 종류**

| 종류 | 시점 |
|---|---|
| `@Before` | 메서드 실행 전 |
| `@AfterReturning` | 메서드 정상 반환 후 |
| `@AfterThrowing` | 메서드가 예외를 던진 후 |
| `@After` | 정상/예외 여부와 무관하게 항상 |
| `@Around` | 메서드 실행 전후 모두 제어 (가장 강력, `ProceedingJoinPoint.proceed()` 직접 호출) |

**자기 호출(Self-Invocation) 문제**

```java
@Service
public class OrderService {

    public void placeOrder() {
        this.sendNotification();  // 프록시를 거치지 않은 직접 호출
    }

    @Async
    public void sendNotification() { ... }
}
```

`placeOrder()`가 `this.sendNotification()`을 호출하면, 이 호출은 컨테이너가 등록한 프록시를 거치지 않고 **원본 객체 내부에서 직접** 일어난다. 클라이언트가 `orderService.placeOrder()`를 호출할 때만 프록시가 개입하고, 그 이후 객체 내부에서 벌어지는 `this.xxx()` 호출은 프록시의 개입 없이 원본 메서드가 그대로 실행되기 때문이다. 그 결과 `@Async`, `@Transactional`, `@Cacheable` 등 AOP 기반 어노테이션이 자기 호출된 메서드에서는 조용히 무시된다. 해결책은 호출을 다른 빈으로 분리하거나(`NotificationService`를 별도 빈으로 만들어 주입받기), `AopContext.currentProxy()`로 프록시 자신을 명시적으로 가져와 호출하는 것이다.

---

## 스프링 MVC 요청 처리 흐름

```
클라이언트 요청
    ↓
DispatcherServlet (Front Controller)
    ↓
HandlerMapping — 어떤 컨트롤러가 처리할지 탐색
    ↓
HandlerAdapter — 실제 컨트롤러 메서드 호출
    ↓
Controller — 비즈니스 로직 실행, Model에 데이터 담기
    ↓
ViewResolver — 논리적 뷰 이름 → 실제 View 객체로 변환
    ↓
View — 최종 응답 렌더링
    ↓
클라이언트 응답
```

`DispatcherServlet`은 모든 요청이 거쳐 가는 단일 진입점(Front Controller 패턴)이다. 요청 URL과 매핑된 컨트롤러를 `HandlerMapping`이 찾고, `HandlerAdapter`가 그 컨트롤러의 실제 메서드 시그니처(파라미터 바인딩, 반환 타입 처리 방식 등)에 맞게 호출한다.

**`@Controller` vs `@RestController`**

```java
@Controller
public class PageController {
    @GetMapping("/hello")
    public String hello() {
        return "hello";  // ViewResolver가 "hello"라는 이름의 뷰 템플릿을 찾음
    }
}

@RestController  // = @Controller + @ResponseBody
public class ApiController {
    @GetMapping("/api/hello")
    public String hello() {
        return "hello";  // 문자열 자체가 응답 바디로 직렬화됨 (HttpMessageConverter)
    }
}
```

`@RestController`는 클래스의 모든 메서드에 `@ResponseBody`가 적용된 것과 같다. 반환값이 뷰 이름이 아니라 응답 바디 자체로 처리되며, 이 변환은 `HttpMessageConverter`가 담당한다.

**예외 처리 — `@ExceptionHandler`와 `@ControllerAdvice`**

```java
@RestControllerAdvice  // 전역 예외 처리기
public class GlobalExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> handleIllegalArgument(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(e.getMessage());
    }
}
```

각 컨트롤러마다 try-catch를 반복하지 않고, 예외 타입별 처리 로직을 한 곳에 모아 애플리케이션 전역에 적용할 수 있다.

---

## 트랜잭션 관리

`@Transactional`도 AOP 프록시 기반으로 동작한다. 메서드 호출 시 프록시가 트랜잭션을 시작하고, 메서드가 정상 종료되면 커밋, 예외가 발생하면 롤백한 뒤 트랜잭션을 종료한다. **AOP 챕터의 자기 호출 문제가 `@Transactional`에도 그대로 적용된다** — 같은 클래스 내부에서 `this.method()`로 호출하면 프록시를 거치지 않아 트랜잭션이 아예 적용되지 않는다.

**전파 속성(Propagation)**

| 속성 | 동작 |
|---|---|
| `REQUIRED` (기본값) | 기존 트랜잭션이 있으면 참여, 없으면 새로 시작 |
| `REQUIRES_NEW` | 항상 새 트랜잭션 시작, 기존 트랜잭션은 잠시 보류(suspend) |
| `NESTED` | 기존 트랜잭션 안에 중첩된 savepoint 생성, 부분 롤백 가능 |
| `MANDATORY` | 기존 트랜잭션이 반드시 있어야 하며 없으면 예외 |
| `SUPPORTS` | 기존 트랜잭션이 있으면 참여, 없으면 트랜잭션 없이 실행 |
| `NOT_SUPPORTED` | 트랜잭션 없이 실행, 기존 트랜잭션은 보류 |
| `NEVER` | 트랜잭션이 있으면 예외 |

격리 수준(Isolation Level)과 관련 이상 현상(dirty read, non-repeatable read, phantom read)은 [트랜잭션 격리 수준과 MVCC 정리](/dev/transaction-isolation-mvcc)에서 자세히 다뤘다.

**롤백이 안 되는 흔한 사고**

```java
@Transactional
public void placeOrder() throws Exception {
    orderRepository.save(order);
    throw new Exception("결제 실패");  // 체크 예외 — 기본 설정으론 롤백되지 않는다!
}
```

스프링의 `@Transactional`은 기본적으로 **언체크 예외(`RuntimeException`과 그 하위)** 에만 롤백하고, **체크 예외**는 정상 커밋 대상으로 간주한다. 체크 예외에도 롤백을 적용하려면 `@Transactional(rollbackFor = Exception.class)`를 명시해야 한다. 그 외에 흔히 롤백이 안 되는 원인은 앞서 본 자기 호출(프록시를 거치지 않음), 그리고 예외를 메서드 내부에서 잡아 삼켜버리고 밖으로 던지지 않는 경우다.

---

## 스프링 부트 자동 설정

`@SpringBootApplication`은 세 개의 어노테이션이 합쳐진 메타 어노테이션이다.

```java
@SpringBootConfiguration  // 사실상 @Configuration
@EnableAutoConfiguration  // 클래스패스를 스캔해 조건부로 빈을 자동 등록
@ComponentScan           // 현재 패키지 하위를 스캔해 @Component 계열을 빈으로 등록
public @interface SpringBootApplication { ... }
```

**자동 설정의 핵심은 `@ConditionalOnClass` 같은 조건부 등록이다.**

```java
@Configuration
@ConditionalOnClass(DataSource.class)          // 클래스패스에 DataSource가 있을 때만
@ConditionalOnMissingBean(DataSource.class)    // 개발자가 직접 DataSource 빈을 등록 안 했을 때만
public class DataSourceAutoConfiguration {
    @Bean
    public DataSource dataSource() { ... }
}
```

예를 들어 `spring-boot-starter-data-jpa` 의존성을 추가하면 클래스패스에 `DataSource`, `EntityManager` 관련 클래스가 들어오고, 스프링 부트는 이를 감지해 관련 자동 설정 클래스들을 활성화한다. 반대로 개발자가 직접 `DataSource` 빈을 정의해두면 `@ConditionalOnMissingBean`에 걸려 자동 설정이 양보한다. **"의존성만 추가하면 알아서 동작한다"는 스프링 부트의 특징은 마법이 아니라, 클래스패스 유무와 기존 빈 등록 여부를 조건으로 삼는 조건부 빈 등록 메커니즘일 뿐이다.**

**스타터(Starter)**: `spring-boot-starter-web`처럼 특정 기능에 필요한 라이브러리 묶음을 의존성 하나로 가져오는 것이다. 버전 호환성 관리를 스프링 부트가 대신 해주므로, 개발자가 개별 라이브러리 버전을 직접 맞출 필요가 없다.

---

## Reference

- [Spring Framework Documentation — Core Technologies (IoC Container)](https://docs.spring.io/spring-framework/reference/core/beans.html)
- [Spring Framework Documentation — AOP](https://docs.spring.io/spring-framework/reference/core/aop.html)
- [Spring Framework Documentation — Transaction Management](https://docs.spring.io/spring-framework/reference/data-access/transaction.html)
- [Spring Boot Documentation — Auto-configuration](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html)
- [트랜잭션 격리 수준과 MVCC 정리](/dev/transaction-isolation-mvcc)