---
title: "Spring Framework의 탄생 배경"
date: 2026-03-09
last_modified_at: 2026-03-09
categories: [dev, spring]
tags: [spring-framework, java, ejb, di, ioc, pojo]
toc: true
comments: true
---

## Summary

- Spring은 **EJB의 복잡성**을 해결하기 위해 탄생했다.
- 핵심 목표는 **POJO 기반의 가볍고 테스트하기 쉬운 자바 개발 환경** 제공이다.
- DI, AOP, PSA를 통해 객체 간 결합도를 낮추고 유연한 설계를 가능하게 한다.

---

## Background

2000년대 초반 Java 엔터프라이즈 개발의 표준은 **EJB(Enterprise JavaBeans)** 였다.

EJB는 트랜잭션, 보안, 분산 컴포넌트 등 복잡한 기업용 기능을 제공했지만, 실제 사용에는 심각한 문제가 있었다.

- EJB 컨테이너에 종속적인 코드 → 테스트가 거의 불가능
- XML 설정 파일이 방대하고 복잡
- 단순한 기능 하나에도 수십 개의 인터페이스 구현 필요
- 배포와 실행 자체가 무거운 WAS를 필요로 함

2002년 Rod Johnson이 저서 *Expert One-on-One J2EE Design and Development*에서 EJB 없이도 엔터프라이즈 수준의 개발이 가능하다는 것을 실증했고, 이 코드가 Spring Framework의 출발점이 되었다.

---

## EJB의 문제점

### 강한 컨테이너 종속성

EJB 컴포넌트는 반드시 EJB 컨테이너 위에서 실행해야 했다. 단순한 비즈니스 로직 하나를 테스트하려면 컨테이너를 구동해야 했다.

```java
// EJB 방식: 컨테이너 없이는 테스트 불가
public class OrderBean implements SessionBean {
    private SessionContext ctx; // 컨테이너가 주입

    public void ejbCreate() { }
    public void ejbRemove() { }
    public void ejbActivate() { }
    public void ejbPassivate() { }
    public void setSessionContext(SessionContext ctx) {
        this.ctx = ctx;
    }

    public void placeOrder(String item) {
        // 실제 비즈니스 로직
    }
}
```

### 침투적 설계

비즈니스 코드가 EJB 인터페이스를 직접 구현해야 했다. 순수한 비즈니스 로직과 인프라 코드가 뒤섞였다.

---

## Spring이 해결한 것

### POJO 기반 개발

Spring은 특정 인터페이스나 클래스를 강제하지 않는다. 평범한 자바 객체(POJO)로 개발하고, 스프링이 필요한 기능을 덧붙인다.

```java
// Spring 방식: 순수한 POJO
public class OrderService {
    private final OrderRepository orderRepository;

    public OrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public void placeOrder(String item) {
        // 순수한 비즈니스 로직
    }
}
```

컨테이너 없이 단위 테스트가 가능하다.

### DI (Dependency Injection)

객체가 필요한 의존성을 직접 생성하지 않고, 외부(Spring 컨테이너)에서 주입받는다. 결합도가 낮아지고 교체와 테스트가 쉬워진다.

### AOP (Aspect Oriented Programming)

로깅, 트랜잭션, 보안 같은 횡단 관심사를 비즈니스 로직에서 분리한다. 핵심 코드가 단순해진다.

### PSA (Portable Service Abstraction)

JDBC, JPA, 트랜잭션 등 다양한 기술에 일관된 추상화 계층을 제공한다. 구현 기술이 바뀌어도 코드 변경이 최소화된다.

---

## Key Point

> **Spring은 EJB의 복잡성과 종속성에 지친 자바 개발자들을 위해 탄생했다. POJO로 돌아가 테스트 가능하고 유연한 설계를 가능하게 하는 것이 핵심이다.**

---

## Reference

- [Spring Framework Overview — Spring Docs](https://docs.spring.io/spring-framework/docs/current/reference/html/overview.html)
- [Expert One-on-One J2EE Design and Development — Rod Johnson](https://www.wiley.com/en-us/Expert+One+on+One+J2EE+Design+and+Development-p-9780764543852)