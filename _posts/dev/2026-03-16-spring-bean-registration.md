---
title: "Spring Bean 등록 방법"
date: 2026-03-16
last_modified_at: 2026-03-16
categories: [dev, spring]
tags: [spring, bean, component-scan, configuration, dependency-injection, ioc]
toc: true
comments: true
---

## Summary

- Bean 등록 방법은 크게 **컴포넌트 스캔**, **@Bean 수동 등록**, **XML 설정** 세 가지다.
- 애플리케이션 코드는 컴포넌트 스캔, 외부 라이브러리나 조건부 설정은 `@Bean`이 적합하다.
- XML은 레거시 환경 외에는 잘 사용하지 않는다.

---

## Background

Spring 컨테이너는 Bean으로 등록된 객체를 관리하고 필요한 곳에 주입한다. Bean을 등록하는 방법이 여러 가지인 이유는 상황마다 적합한 방식이 다르기 때문이다.

---

## 1. 컴포넌트 스캔 (@Component 계열)

클래스에 애노테이션을 붙이면 Spring이 자동으로 감지해 Bean으로 등록한다.

```java
@Component      // 범용
@Service        // 서비스 레이어
@Repository     // 데이터 접근 레이어
@Controller     // MVC 컨트롤러
@RestController // REST API 컨트롤러
```

```java
@Service
public class OrderService {
    private final OrderRepository orderRepository;

    public OrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }
}
```

`@SpringBootApplication`에 포함된 `@ComponentScan`이 패키지를 탐색하며 자동 등록한다.

**장점**: 코드가 간결하고 직관적.
**단점**: 외부 라이브러리 클래스에는 적용 불가. 등록 조건을 세밀하게 제어하기 어렵다.

---

## 2. @Bean 수동 등록 (@Configuration + @Bean)

`@Configuration` 클래스 안에서 `@Bean` 메서드로 직접 Bean을 생성해 등록한다.

```java
@Configuration
public class AppConfig {

    @Bean
    public ObjectMapper objectMapper() {
        return new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

**장점**: Bean 생성 과정을 직접 제어 가능. 외부 라이브러리 객체도 Bean으로 등록 가능. 조건부 등록(`@Conditional`) 적용에 유리.
**단점**: 컴포넌트 스캔보다 코드가 많아진다.

---

## 3. XML 설정 (레거시)

Spring 초기 방식으로 XML 파일에 Bean을 직접 선언한다.

```xml
<beans>
    <bean id="orderService" class="com.example.OrderService">
        <constructor-arg ref="orderRepository"/>
    </bean>
</beans>
```

**장점**: 코드를 수정하지 않고 설정 변경 가능.
**단점**: 타입 안전성 없음. 장황하고 유지보수가 어렵다. Spring Boot 환경에서는 거의 사용하지 않는다.

---

## 비교

| 방법 | 자동화 | 외부 라이브러리 | 세밀한 제어 | 사용 빈도 |
|:--:|:--:|:--:|:--:|:--:|
| 컴포넌트 스캔 | O | X | △ | 높음 |
| @Bean 수동 등록 | X | O | O | 중간 |
| XML | X | O | O | 낮음 (레거시) |

---

## 언제 무엇을 쓰는가

- **컴포넌트 스캔**: 직접 작성한 서비스, 레포지토리, 컨트롤러
- **@Bean**: Jackson, BCryptPasswordEncoder 같은 외부 라이브러리 객체 / 생성 시 설정이 필요한 경우
- **XML**: 레거시 프로젝트 유지보수 시

---

## Key Point

> **기본은 컴포넌트 스캔, 외부 라이브러리나 세밀한 제어가 필요하면 @Bean. XML은 레거시에서만.**

---

## Reference

- [Spring Bean Overview — Spring Docs](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#beans-definition)
- [Component Scanning — Spring Docs](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#beans-classpath-scanning)