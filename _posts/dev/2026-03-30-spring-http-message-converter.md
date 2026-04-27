---
title: "Spring @RestController의 HTTP 요청 처리 흐름"
date: 2026-03-30
last_modified_at: 2026-03-30
categories: [dev, spring]
tags: [spring, rest-controller, dispatcher-servlet, http-message-converter, jackson, mvc]
toc: true
comments: true
---

## Summary

- HTTP 요청은 **DispatcherServlet → HandlerMapping → HandlerAdapter → Controller** 순서로 처리된다.
- **HttpMessageConverter**는 두 시점에 동작한다: 요청 바디 역직렬화(`@RequestBody`)와 응답 바디 직렬화(`@ResponseBody`).
- JSON 변환은 기본적으로 **MappingJackson2HttpMessageConverter**가 담당한다.

---

## Background

`@RestController`로 API를 만들면 JSON이 자동으로 오고간다. 하지만 내부에서 어떤 과정을 거쳐 Java 객체가 JSON이 되고, JSON이 Java 객체가 되는지 이해하면 Content-Type 오류나 직렬화 문제를 훨씬 쉽게 해결할 수 있다.

---

## 전체 처리 흐름

```
HTTP 요청
    ↓
[1] DispatcherServlet
    ↓
[2] HandlerMapping → 처리할 컨트롤러 메서드 결정
    ↓
[3] HandlerAdapter
    ↓
    [3-1] HttpMessageConverter (요청 바디 역직렬화 - @RequestBody)
    ↓
[4] Controller 메서드 실행
    ↓
[5] HandlerAdapter
    ↓
    [5-1] HttpMessageConverter (응답 직렬화 - @ResponseBody)
    ↓
HTTP 응답
```

---

## 각 단계 설명

### [1] DispatcherServlet

모든 HTTP 요청의 진입점이다. 서블릿 컨테이너(톰캣)에서 요청을 받아 처리 흐름을 시작한다.

### [2] HandlerMapping

요청 URL과 HTTP 메서드를 기반으로 어떤 컨트롤러 메서드가 처리할지 결정한다.

```
GET /users/123 → UserController.getUser(Long id)
```

### [3] HandlerAdapter + HttpMessageConverter (요청)

컨트롤러를 실행하기 전에 요청 바디를 Java 객체로 변환한다.

```java
@PostMapping("/users")
public User createUser(@RequestBody CreateUserRequest request) { ... }
```

`Content-Type: application/json` 헤더를 확인하고, 적절한 `HttpMessageConverter`를 선택해 JSON → `CreateUserRequest` 객체로 역직렬화한다.

### [4] Controller 메서드 실행

순수한 Java 코드로 비즈니스 로직이 실행된다. 결과 객체를 반환한다.

```java
@GetMapping("/users/{id}")
public User getUser(@PathVariable Long id) {
    return userService.findById(id); // User 객체 반환
}
```

### [5] HandlerAdapter + HttpMessageConverter (응답)

`@ResponseBody`(또는 `@RestController`)가 있으면 반환된 객체를 HTTP 응답 바디로 변환한다.

클라이언트의 `Accept` 헤더를 확인하고(`Accept: application/json`), 적절한 `HttpMessageConverter`가 `User` 객체 → JSON 직렬화 → 응답 바디에 쓴다.

---

## HttpMessageConverter

Spring이 기본으로 등록하는 주요 컨버터들:

| 컨버터 | 처리 타입 |
|---|---|
| `MappingJackson2HttpMessageConverter` | `application/json` |
| `StringHttpMessageConverter` | `text/plain`, `text/html` |
| `ByteArrayHttpMessageConverter` | `application/octet-stream` |
| `FormHttpMessageConverter` | `application/x-www-form-urlencoded` |

JSON 변환은 Jackson 라이브러리 기반의 `MappingJackson2HttpMessageConverter`가 담당한다.

---

## Content-Type과 Accept

- **요청 시** `Content-Type`: 내가 보내는 데이터 형식 → 역직렬화할 컨버터 선택
- **응답 시** `Accept`: 내가 원하는 응답 형식 → 직렬화할 컨버터 선택

```http
POST /users HTTP/1.1
Content-Type: application/json   ← 요청 바디가 JSON임을 알림
Accept: application/json         ← JSON 응답을 원함
```

---

## Key Point

> **HttpMessageConverter는 요청 시 @RequestBody 역직렬화, 응답 시 @ResponseBody 직렬화 두 시점에 동작한다. JSON은 Jackson 기반의 MappingJackson2HttpMessageConverter가 처리한다.**

---

## Reference

- [HttpMessageConverter — Spring Docs](https://docs.spring.io/spring-framework/docs/current/reference/html/web.html#mvc-config-message-converters)
- [DispatcherServlet — Spring Docs](https://docs.spring.io/spring-framework/docs/current/reference/html/web.html#mvc-servlet)