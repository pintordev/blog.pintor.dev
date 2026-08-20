---
title: "스프링(Spring) 핵심 개념 정리"
date: 2026-08-06
last_modified_at: 2026-08-20
categories: [dev, spring]
tags: [study note, spring, ioc, di, aop, mvc, transaction, spring-boot, spring-security]
toc: true
comments: true
---

## Summary

- 라이브러리와 프레임워크의 차이는 기능의 많고 적음이 아니라 **누가 실행 흐름을 주도하는가**다 — 그 주도권이 컨테이너로 넘어간 것이 바로 IoC(제어의 역전)다
- IoC는 "객체 생성과 생명주기 관리를 컨테이너에게 넘긴다"는 원칙이고, DI는 그 원칙을 구현하는 대표적인 방법이다 — 둘을 동일시하면 안 된다
- 생성자 주입을 권장하는 이유는 단순히 "베스트 프랙티스"가 아니라 불변성 보장, 순환 참조의 조기 발견, 테스트 용이성이라는 구체적인 근거 때문이다 — 다만 "테스트 용이성"은 필드 주입이 테스트 불가능하다는 뜻이 아니라, 프레임워크의 리플렉션 지원 없이도 테스트가 가능한가의 차이다
- 싱글톤 빈 안에서 프로토타입 빈을 매번 새로 받고 싶다면 `ObjectProvider`나 스코프 프록시 없이는 불가능하다 — 의존성은 생성 시점에 한 번만 주입되기 때문이다
- Spring AOP와 `@Transactional`은 같은 메커니즘(프록시 기반 AOP) 위에서 동작한다 — 그래서 둘 다 "자기 호출(self-invocation)" 문제를 똑같이 겪는다
- `@Transactional`이 실패해도 롤백되지 않는 대부분의 사고는 체크 예외를 던지거나, `private`/자기 호출 메서드에 붙이거나, 프록시를 거치지 않고 직접 호출했을 때 발생한다
- `@SpringBootApplication`의 자동 설정은 마법이 아니라 클래스패스에 무엇이 있는지(`@ConditionalOnClass`)를 보고 조건부로 빈을 등록하는 것뿐이다
- Spring Security의 인증 정보(`SecurityContextHolder`)는 기본적으로 스레드 로컬 기반이라, 서버가 여러 대면 세션 클러스터링이나 무상태(stateless) 토큰 인증으로 그 상태를 서버 간에 공유해야 한다

---

## 프레임워크와 스프링

**프레임워크는 왜 쓰는가** 프레임워크는 애플리케이션의 전체 구조와 실행 흐름을 미리 정해두고, 개발자는 그 틀 안의 정해진 지점에 자신의 코드를 채워 넣는 방식으로 동작한다. 이런 틀을 쓰는 이유는 결국 **품질 보장**이다 — 인증, 트랜잭션, 예외 처리, 동시성 제어처럼 잘못 구현하면 위험한 영역을, 이미 수많은 사용 사례를 거치며 검증된 코드에 위임할 수 있어서 개발자가 매번 바닥부터 설계할 때보다 실수할 여지가 줄어든다. 팀 단위로 보면, 같은 프레임워크의 관례를 따르는 것만으로 코드 구조가 사람마다 크게 갈리지 않아 협업 비용도 낮아진다.

**라이브러리 vs 프레임워크 — 주도권이 어디 있는가** 둘을 가르는 기준은 기능의 많고 적음이 아니라 **누가 실행 흐름을 주도하는가**다. 라이브러리를 쓸 때는 개발자의 코드가 주도권을 쥐고 필요한 시점에 라이브러리 함수를 직접 호출한다. 프레임워크를 쓸 때는 반대로 프레임워크가 실행 흐름을 쥐고 있고, 개발자가 작성한 코드는 프레임워크가 정해둔 지점(콜백, 어노테이션이 붙은 메서드 등)에서 프레임워크에 의해 호출된다. "누가 누구를 호출하는가"가 뒤집힌 이 현상이 바로 다음 섹션에서 다룰 **IoC(제어의 역전)** 다 — 스프링이 프레임워크인 이유도 결국 이 주도권이 개발자가 아니라 컨테이너에 있기 때문이다.

**Spring Framework의 단점 — 러닝 커브** 이런 이점의 대가로 스프링은 학습 곡선이 가파르다. `@Autowired` 하나만 붙이면 동작하는 것처럼 보이지만, 그 뒤에는 컴포넌트 스캔, 빈 등록, 프록시 생성 같은 여러 단계가 숨어 있다. 이 내부 동작을 모른 채 어노테이션만 따라 붙이면, 스캔 범위를 벗어난 빈이 주입되지 않거나 AOP가 조용히 무시되는 등 원인을 추적하기 어려운 문제를 만나기 쉽다. 스프링을 안다는 것은 어노테이션 목록을 외우는 게 아니라, 그 뒤에서 컨테이너가 실제로 무엇을 하는지를 아는 것에 가깝다.

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

**IoC 컨테이너란?** 빈의 생성, 의존관계 설정, 생명주기 관리를 실제로 수행하는 주체를 가리킨다. 스프링에서는 `BeanFactory`/`ApplicationContext`의 구현체가 곧 IoC 컨테이너이며, 애플리케이션이 뜰 때 이 컨테이너가 설정 정보(어노테이션, 자바 설정 클래스 등)를 읽어 빈을 생성하고 관리한다.

**빈을 등록하는 방법**

| 방법 | 설명 |
|---|---|
| 컴포넌트 스캔 | `@Component`(및 `@Service`, `@Repository`, `@Controller` 등 특수화된 애노테이션)가 붙은 클래스를 `@ComponentScan` 범위 안에서 자동으로 찾아 등록 |
| 자바 설정 | `@Configuration` 클래스 안에 `@Bean` 메서드를 선언해 반환값을 직접 빈으로 등록 |
| XML 설정 | `<bean>` 태그로 등록하는 레거시 방식, 최신 스프링에서는 거의 쓰지 않는다 |

컴포넌트 스캔은 개발자가 만든 클래스를 간결하게 등록할 때, 자바 설정은 외부 라이브러리 클래스처럼 직접 `@Component`를 붙일 수 없는 대상을 빈으로 등록하거나 생성 로직을 세밀하게 제어해야 할 때 쓴다.

**빈과 컴포넌트의 차이** `@Component`는 "이 클래스를 빈으로 등록해달라"는 마커 애노테이션 중 하나일 뿐이고, **빈(Bean)** 은 그 결과로 컨테이너가 실제로 관리하는 객체 인스턴스를 가리키는 더 넓은 개념이다. `@Configuration` 클래스의 `@Bean` 메서드로 등록된 객체도 빈이지만 `@Component`는 아니다 — 즉 모든 컴포넌트는 빈이 되지만, 모든 빈이 컴포넌트인 것은 아니다.

**DI를 왜 쓰는가** 구현체를 코드 안에서 직접 `new`로 생성하면, 그 클래스는 특정 구현체에 강하게 결합된다. 구현체를 다른 것으로 바꾸려면(OCP) 그 클래스 내부를 직접 고쳐야 하고, 테스트에서 실제 구현체 대신 목(mock)으로 바꿔치기하기도 어렵다. DI는 필요한 의존성을 인터페이스로만 선언하고 실제 구현체를 무엇으로 채울지는 컨테이너에 맡기므로, 클래스는 구현체가 아니라 추상화에만 의존하게 되고 구현체 교체나 목 대체가 코드 수정 없이 가능해진다.

**주입 방식 3가지와 왜 생성자 주입을 권장하는가**

| 방식 | 특징 |
|---|---|
| 필드 주입 | `@Autowired` 필드에 직접, 코드는 짧지만 `final` 불가·테스트 어려움 |
| 세터 주입 | 선택적 의존성에 적합, 객체 생성 후에도 재조립 가능 |
| 생성자 주입 | 객체 생성 시점에 모든 의존성이 강제로 채워짐 |

생성자 주입이 권장되는 이유는 세 가지다.

- **불변성**: 필드를 `private final`로 선언할 수 있어, 생성 이후 의존성이 바뀔 수 없다는 것을 컴파일러가 보장한다.
- **순환 참조의 조기 발견**: 필드/세터 주입은 컨테이너가 빈을 먼저 생성한 뒤 나중에 주입하므로 순환 참조가 있어도 일단 애플리케이션이 뜬다(런타임에야 문제가 드러남). 생성자 주입은 빈 생성 자체가 서로를 필요로 하므로, 순환 참조가 있으면 컨테이너 구동 시점에 `BeanCurrentlyInCreationException`으로 즉시 실패한다.
- **테스트 용이성**: "생성자 주입만 테스트가 가능하다"는 말은 아니다 — 실무에서 필드 주입된 클래스도 Mockito의 `@InjectMocks`가 리플렉션으로 필드에 목 객체를 꽂아주는 방식으로 흔히 테스트된다. 차이는 **그 테스트가 프레임워크의 리플렉션 지원에 의존하는가**에 있다. 생성자 주입은 `new OrderService(mockPaymentClient)`처럼 스프링이나 Mockito 없이도 순수 자바 코드로 목 객체를 넘겨 인스턴스를 만들 수 있지만, 필드 주입은 `private` 필드에 값을 넣어줄 public 생성자·세터가 없어 리플렉션(`ReflectionTestUtils`, `@InjectMocks`) 없이는 목 객체를 넣을 방법이 없다.

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

**더 정확한 순서 — `BeanPostProcessor`와 `Aware` 인터페이스까지 포함하면**

```
생성자 호출
  → 필드/세터 의존성 주입
  → Aware 인터페이스 콜백(BeanNameAware, ApplicationContextAware 등 — 컨테이너 자신의 정보가 필요할 때)
  → BeanPostProcessor.postProcessBeforeInitialization()
  → 초기화 콜백(@PostConstruct → InitializingBean.afterPropertiesSet() → 커스텀 init-method 순)
  → BeanPostProcessor.postProcessAfterInitialization()
  → 빈 사용
  → 소멸 콜백(@PreDestroy → DisposableBean.destroy() → 커스텀 destroy-method 순)
```

`BeanPostProcessor`는 컨테이너가 관리하는 모든 빈의 초기화 전후에 개입할 수 있는 확장 지점이다 — `@Autowired` 처리나 AOP 프록시 생성도 내부적으로는 특정 `BeanPostProcessor` 구현체가 이 시점에 끼어들어 수행하는 것이다.

**초기화 콜백을 거는 세 가지 방법**

| 방법 | 예시 |
|---|---|
| 애노테이션 | `@PostConstruct` / `@PreDestroy` |
| 인터페이스 구현 | `InitializingBean.afterPropertiesSet()` / `DisposableBean.destroy()` |
| 설정에 명시 | `@Bean(initMethod = "init", destroyMethod = "close")` |

셋 다 같은 목적을 위한 것이지만, 인터페이스 구현 방식은 클래스가 스프링 인터페이스에 직접 의존하게 되어 결합도가 올라간다는 단점이 있어 실무에서는 `@PostConstruct`/`@PreDestroy`를 가장 많이 쓴다. 외부 라이브러리 클래스처럼 애노테이션을 붙일 수 없는 대상은 `@Bean(initMethod = ...)`로 지정한다.

**스코프**

| 스코프 | 설명 |
|---|---|
| `singleton` (기본값) | 컨테이너당 인스턴스 1개, 모든 요청이 같은 객체를 공유 |
| `prototype` | `getBean()` 호출마다 새 인스턴스 생성 |
| `request` | HTTP 요청 1건당 1개 (웹 환경) |
| `session` | HTTP 세션 1개당 1개 (웹 환경) |
| `application` | 서블릿 컨텍스트 1개당 1개 — 사실상 싱글톤과 유사하지만 웹 환경에 한정 |
| `websocket` | WebSocket 세션 1개당 1개 |

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

**싱글톤 안에서 `request` 스코프 빈을 쓸 때도 같은 문제가 생기는가?** 그렇다 — 원리는 프로토타입과 같다. 싱글톤 빈은 컨테이너 구동 시 단 한 번 생성되는데, 그 시점에는 아직 어떤 HTTP 요청도 들어오지 않은 상태라 `request` 스코프 빈을 만들 수조차 없다. 그래서 `request`/`session` 스코프 빈을 싱글톤에 주입하려면 마찬가지로 `proxyMode = ScopedProxyMode.TARGET_CLASS`로 스코프 프록시를 걸어야 한다 — 싱글톤은 실제 빈 대신 프록시를 주입받아 두고, 메서드가 호출되는 시점(실제 요청이 들어온 시점)마다 프록시가 현재 요청에 해당하는 진짜 빈을 찾아 위임한다.

---

## AOP

**AOP(Aspect-Oriented Programming)** 는 로깅, 트랜잭션, 보안 검증처럼 여러 모듈에 반복되는 **횡단 관심사(Cross-Cutting Concern)** 를 핵심 비즈니스 로직에서 분리하는 기법이다.

**구체적으로 어떤 걸 "관심사"라고 부르는가**

```java
// AOP를 적용하지 않으면 — 로깅이라는 관심사가 메서드마다 흩어짐
public class OrderService {
    public void placeOrder(Order order) {
        log.info("주문 시작: {}", order);                                   // ← 로깅 관심사
        long start = System.currentTimeMillis();                            // ← 로깅 관심사
        orderRepository.save(order);                                        // ← 진짜 비즈니스 로직
        log.info("주문 완료: {}ms", System.currentTimeMillis() - start);    // ← 로깅 관심사
    }
}

// AOP 적용 — 로깅 코드가 메서드에서 완전히 빠짐
public class OrderService {
    public void placeOrder(Order order) {
        orderRepository.save(order);  // 비즈니스 로직만 남음
    }
}

@Aspect
public class LoggingAspect {
    @Around("execution(* com.example..service.*.*(..))")  // 여러 서비스 메서드에 공통 적용
    public Object log(ProceedingJoinPoint joinPoint) throws Throwable { ... }
}
```

로깅 로직 자체가 "관심사"이고, 이 관심사가 `OrderService`뿐 아니라 `PaymentService`, `UserService` 등 여러 모듈에 반복돼 나타난다는 점에서 **횡단(cross-cutting)** 관심사라 부른다.

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

**두 방식의 실제 차이** JDK Dynamic Proxy는 대상 인터페이스를 구현하는 새 클래스를 런타임에 만들어, 원본과 같은 인터페이스 타입으로 동작한다. CGLIB는 대상 클래스를 **상속**한 서브클래스를 만들어 메서드를 오버라이드하는 방식으로 동작한다 — 그래서 `final` 클래스는 상속할 수 없어 프록시를 만들 수 없고, `final` 메서드는 오버라이드가 안 되므로 그 메서드에는 어드바이스가 적용되지 않는다. Spring Boot는 인터페이스 유무와 무관하게 CGLIB를 기본으로 쓰므로, `@Transactional`이 붙은 클래스나 메서드를 `final`로 선언하면 트랜잭션이 조용히 적용되지 않는 실수를 할 수 있다.

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

## 빌드 도구 — Maven vs Gradle

둘 다 의존성 관리와 빌드 생명주기(컴파일 → 테스트 → 패키징 → 배포)를 자동화하는 도구지만, 설계 철학이 다르다.

| 항목 | Maven | Gradle |
|---|---|---|
| 설정 방식 | XML(`pom.xml`), 선언적 | Groovy/Kotlin DSL(`build.gradle`), 선언적 + 스크립트 가능 |
| 빌드 방식 | 정해진 생명주기(phase)를 순서대로 실행 | 태스크(task) 그래프 기반, 필요한 태스크만 선택적으로 실행 |
| 성능 | 매 빌드마다 처음부터 다시 실행하는 경향 | 증분 빌드(incremental build) + 빌드 캐시로 변경분만 다시 빌드 |
| 유연성 | 관례를 따르면 편하지만 커스터마이징이 상대적으로 번거로움(플러그인 작성이 XML 기반) | 스크립트로 빌드 로직을 직접 제어하기 쉬움 |

**왜 Gradle이 더 빠르다고 하는가** Maven은 빌드할 때마다 정해진 생명주기 전체를 다시 실행하는 경향이 있는 반면, Gradle은 이전 빌드 이후 무엇이 바뀌었는지 추적해 변경되지 않은 모듈·태스크는 건너뛰거나 캐시된 결과를 재사용한다. 모듈이 많은 멀티 모듈 프로젝트일수록 이 차이가 체감된다.

**그럼 뭘 써야 하는가** 최근 스프링 부트 프로젝트는 Gradle을 기본값처럼 많이 쓰지만, Maven의 XML 방식이 IDE 지원이나 팀 관례상 더 익숙한 조직도 여전히 많다. 학습 곡선은 Maven이 상대적으로 낮고(선언적 XML), Gradle은 스크립트 문법(Groovy/Kotlin)까지 익혀야 해 진입장벽이 조금 더 높다.

---

## 톰캣과 내장 WAS

**WAS(Web Application Server)는 왜 필요한가** 웹 서버(Nginx, Apache 등)는 정적 파일을 응답하는 데는 강하지만 자바 코드를 실행할 수는 없다. WAS는 서블릿(Servlet) 컨테이너 역할을 해서, HTTP 요청을 받아 그에 맞는 서블릿(스프링 MVC에서는 `DispatcherServlet`)을 실행하고 그 결과를 다시 HTTP 응답으로 돌려준다. 톰캣(Tomcat)은 그중 가장 널리 쓰이는 서블릿 컨테이너 구현체다.

**스프링 부트는 왜 톰캣을 내장하는가** 과거에는 WAR 파일로 패키징해 별도로 설치된 톰캣에 배포하는 방식이 일반적이었다. 스프링 부트는 톰캣을 라이브러리 형태로 애플리케이션 안에 내장(embedded)해, `java -jar`만으로 웹 서버가 뜨는 독립 실행형 애플리케이션을 만든다. 배포 환경에 별도로 WAS를 설치·설정할 필요가 없어지고, 애플리케이션과 WAS 버전이 항상 함께 관리되므로 버전 불일치 문제도 줄어든다. 필요하면 `spring-boot-starter-web`의 기본 톰캣 대신 Jetty나 Undertow 같은 다른 내장 WAS로 교체할 수도 있다.

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

## 프로파일(Profile)과 환경별 설정

개발(dev), 테스트(test), 운영(prod) 환경마다 DB 접속 정보, 외부 API 키, 로그 레벨 같은 설정값이 다르다. `@Profile`은 특정 프로파일이 활성화된 경우에만 해당 빈을 등록하도록 조건을 거는 애노테이션이다.

```java
@Configuration
@Profile("prod")
public class ProdDataSourceConfig {
    @Bean
    public DataSource dataSource() { ... }  // 운영 환경에서만 등록
}
```

설정 파일도 `application-{profile}.yml`(예: `application-dev.yml`, `application-prod.yml`)로 프로파일별로 분리하고, `spring.profiles.active=prod`로 어떤 프로파일을 활성화할지 지정한다. 활성화되지 않은 프로파일의 `@Profile` 빈은 컨테이너에 아예 등록되지 않으므로, 운영 환경에만 필요한 설정값(예: 실제 결제 API 키)이 개발 환경 코드에 섞여 들어갈 위험을 줄일 수 있다.

---

## Spring Actuator

운영 중인 애플리케이션의 내부 상태(헬스 체크, 메트릭, 환경 변수, 로그 레벨 등)를 HTTP 엔드포인트로 노출해주는 모듈이다. `spring-boot-starter-actuator`를 추가하면 `/actuator/health`(애플리케이션과 연결된 DB·디스크 등의 상태), `/actuator/metrics`(JVM 메모리, HTTP 요청 수 등 지표) 같은 엔드포인트를 바로 쓸 수 있다.

**왜 필요한가** 애플리케이션이 살아있는지, 정상 응답이 가능한 상태인지를 코드 안을 들여다보지 않고도 외부에서 표준화된 방식으로 확인할 수 있어야 로드 밸런서의 헬스 체크나 쿠버네티스의 liveness/readiness probe, 모니터링 시스템(Prometheus 연동 등)과 연결할 수 있다.

**보안 유의점** 기본 설정 그대로 배포하면 환경 변수, 빈 목록, 스레드 덤프 같은 민감한 정보까지 외부에 노출될 수 있다. 운영 환경에서는 노출할 엔드포인트를 `management.endpoints.web.exposure.include`로 최소한(`health`, `info` 등)으로 제한하고, Spring Security로 `/actuator/**` 경로에 별도 인증을 걸어야 한다.

---

## Spring Security

**요청이 들어올 때 동작하는 방식** Spring Security는 `DispatcherServlet`에 요청이 도달하기 **전에** 서블릿 필터 체인(`SecurityFilterChain`)을 거치도록 등록된다. 이 필터 체인 안에서 인증(로그인 정보 검증), 인가(요청 경로별 권한 검사) 필터들이 순서대로 요청을 가로챈다. 인증에 성공하면 그 결과(`Authentication` 객체)를 `SecurityContext`에 담아 `SecurityContextHolder`에 저장해두고, 이후 컨트롤러나 서비스 로직에서 "현재 로그인한 사용자가 누구인지"를 이 컨텍스트를 통해 꺼내 쓸 수 있다.

**서버가 여러 대일 때는 어떻게 동작하는가** `SecurityContextHolder`는 기본적으로 `ThreadLocal` 기반이라 한 요청을 처리하는 스레드 안에서만 유효하고, 다른 서버 인스턴스와는 공유되지 않는다. 세션 기반 인증(로그인 시 서버가 세션을 만들고 클라이언트는 세션 ID만 들고 다니는 방식)을 여러 서버로 확장하려면, 요청이 항상 같은 서버로만 가도록 고정하는 **스티키 세션(sticky session)** 을 쓰거나, 세션 자체를 Redis 같은 외부 저장소로 옮겨 모든 서버가 공유하는 **세션 클러스터링**이 필요하다. 반면 **토큰 기반 인증(JWT 등)** 은 인증 정보 자체를 클라이언트가 들고 있는 토큰 안에 담아 서버가 상태를 전혀 들고 있지 않으므로(stateless), 서버가 몇 대든 어떤 서버가 요청을 받아도 토큰만 검증하면 인증이 끝난다 — 그래서 수평 확장이 잦은 서비스는 세션보다 토큰 기반 인증을 선호하는 경우가 많다.

---

## Reference

- [Spring Framework Documentation — Core Technologies (IoC Container)](https://docs.spring.io/spring-framework/reference/core/beans.html)
- [Spring Framework Documentation — AOP](https://docs.spring.io/spring-framework/reference/core/aop.html)
- [Spring Framework Documentation — Transaction Management](https://docs.spring.io/spring-framework/reference/data-access/transaction.html)
- [Spring Boot Documentation — Auto-configuration](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html)
- [Spring Boot Documentation — Profiles](https://docs.spring.io/spring-boot/reference/features/profiles.html)
- [Spring Boot Documentation — Actuator](https://docs.spring.io/spring-boot/reference/actuator/index.html)
- [Spring Security Documentation — Architecture](https://docs.spring.io/spring-security/reference/servlet/architecture.html)
- [Apache Tomcat Documentation](https://tomcat.apache.org/tomcat-10.1-doc/index.html)
- [Gradle vs Maven Comparison — Gradle Docs](https://docs.gradle.org/current/userguide/gradle_vs_maven.html)
- [트랜잭션 격리 수준과 MVCC 정리](/dev/transaction-isolation-mvcc)