---
title: "프레임워크와 라이브러리의 차이"
date: 2026-03-09
last_modified_at: 2026-03-09
categories: [dev, spring]
tags: [spring-framework, framework, library, ioc, java]
toc: true
comments: true
---

## Summary

- **라이브러리**: 내 코드가 라이브러리를 호출한다. 제어의 주체는 **나**.
- **프레임워크**: 프레임워크가 내 코드를 호출한다. 제어의 주체는 **프레임워크**.
- 이 차이를 **IoC(제어의 역전)** 라고 한다.

---

## Background

라이브러리와 프레임워크는 모두 "남이 만든 코드를 가져다 쓴다"는 점에서 비슷해 보인다.

하지만 막상 Spring을 처음 쓰면 이상한 느낌이 든다. 내가 `main()`을 실행하지 않아도 코드가 돌아가고, 내가 객체를 `new`로 만들지 않아도 어디선가 주입이 된다.

그 차이의 핵심이 바로 **제어 흐름의 주체**다.

---

## 라이브러리

개발자가 필요할 때 직접 호출해서 사용하는 도구다. 프로그램의 흐름은 개발자가 작성한 코드가 주도한다.

```java
// Jackson 라이브러리 사용 예시
// → 내 코드가 ObjectMapper를 직접 생성하고 호출한다
ObjectMapper mapper = new ObjectMapper();
String json = mapper.writeValueAsString(user);
```

- `ObjectMapper`를 언제 만들고, 언제 호출할지는 내가 결정한다.
- 라이브러리는 그저 내 호출을 기다린다.

---

## 프레임워크

프레임워크가 애플리케이션의 전체 흐름을 주도하고, 개발자가 작성한 코드를 적절한 시점에 대신 호출한다.

```java
// Spring MVC 예시
// → 내가 handle()을 호출하지 않는다
// → HTTP 요청이 오면 Spring이 알아서 호출한다
@RestController
public class UserController {

    @GetMapping("/users/{id}")
    public User getUser(@PathVariable Long id) {
        return userService.findById(id);
    }
}
```

- `getUser()`를 언제 호출할지는 Spring이 결정한다.
- 개발자는 "어떤 요청에 어떤 로직을 실행할지"만 정의한다.

---

## IoC (Inversion of Control)

라이브러리 → 프레임워크로 갈 때 뒤집히는 것이 바로 제어권이다.

| 구분 | 제어 주체 | 호출 방향 |
|:--:|:--:|:--:|
| 라이브러리 | 개발자 | 내 코드 → 라이브러리 |
| 프레임워크 | 프레임워크 | 프레임워크 → 내 코드 |

Spring에서 IoC는 주로 **DI(의존성 주입)** 로 구현된다. 객체의 생성과 의존 관계 연결을 Spring 컨테이너가 담당한다.

```java
@Service
public class OrderService {
    // 내가 new OrderRepository()를 하지 않는다
    // Spring이 알아서 주입해준다
    private final OrderRepository orderRepository;

    public OrderService(OrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }
}
```

---

## Spring Framework vs Java 라이브러리 비교

| 구분 | Spring Framework | Jackson / Gson |
|:--:|:--:|:--:|
| 종류 | 프레임워크 | 라이브러리 |
| 제어 주체 | Spring | 개발자 |
| 객체 생성 | Spring 컨테이너 | 개발자가 직접 |
| 흐름 제어 | Spring이 주도 | 개발자가 주도 |

---

## Key Point

> **라이브러리는 내가 호출하고, 프레임워크는 나를 호출한다. 제어의 역전(IoC)이 둘의 핵심 차이다.**

---

## Reference

- [Inversion of Control — Martin Fowler](https://martinfowler.com/bliki/InversionOfControl.html)
- [Spring IoC Container — Spring Docs](https://docs.spring.io/spring-framework/docs/current/reference/html/core.html#beans)