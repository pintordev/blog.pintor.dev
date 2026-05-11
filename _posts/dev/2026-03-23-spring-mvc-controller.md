---
title: "Spring MVC의 @Controller와 @RestController"
date: 2026-03-23
last_modified_at: 2026-03-23
categories: [dev, spring]
tags: [weekly paper, spring, mvc, controller, rest-controller, dispatcher-servlet, view-resolver, http-message-converter]
toc: true
comments: true
---

## Summary

- `@Controller`는 뷰 이름을 반환하고, **ViewResolver**가 HTML을 렌더링한다.
- `@RestController`는 객체를 반환하고, **HttpMessageConverter**가 JSON 등으로 직렬화한다.
- `@RestController = @Controller + @ResponseBody`다.

---

## Background

Spring MVC에서 요청을 처리하는 핵심 컨트롤러 애노테이션이 두 가지다.

웹 페이지(HTML)를 반환하는 전통적인 웹 애플리케이션에는 `@Controller`, REST API 서버에는 `@RestController`를 사용한다. 동작 방식이 다르기 때문에 차이를 이해하는 것이 중요하다.

---

## 공통 요청 처리 흐름

두 방식 모두 앞단의 처리 흐름은 같다.

```
HTTP 요청
    ↓
DispatcherServlet (프론트 컨트롤러)
    ↓
HandlerMapping (어떤 컨트롤러가 처리할지 결정)
    ↓
HandlerAdapter (컨트롤러 실행)
    ↓
Controller 메서드 실행
    ↓
[여기서 분기]
```

---

## @Controller: 뷰 반환

```java
@Controller
public class PageController {

    @GetMapping("/hello")
    public String hello(Model model) {
        model.addAttribute("name", "Spring");
        return "hello"; // 뷰 이름 반환
    }
}
```

컨트롤러가 String을 반환하면 이를 **뷰 이름**으로 해석한다.

```
Controller → "hello" 반환
    ↓
ViewResolver → templates/hello.html 찾아서 렌더링
    ↓
HTML 응답
```

특정 메서드에 `@ResponseBody`를 붙이면 해당 메서드만 JSON으로 응답할 수 있다.

---

## @RestController: JSON 반환

```java
@RestController
public class UserController {

    @GetMapping("/users/{id}")
    public User getUser(@PathVariable Long id) {
        return userService.findById(id); // 객체 반환
    }
}
```

`@RestController`는 `@Controller + @ResponseBody`다. 반환한 객체를 ViewResolver로 보내지 않고 **HttpMessageConverter**가 직접 직렬화한다.

```
Controller → User 객체 반환
    ↓
HttpMessageConverter (MappingJackson2HttpMessageConverter)
    ↓
JSON 직렬화
    ↓
HTTP 응답 바디
```

---

## 비교

| 구분 | @Controller | @RestController |
|:--:|:--:|:--:|
| 반환값 | 뷰 이름 (String) | 객체 |
| 처리 | ViewResolver | HttpMessageConverter |
| 응답 | HTML | JSON / XML 등 |
| 용도 | 서버 사이드 렌더링 | REST API |

---

## @ResponseBody

`@Controller`에서도 메서드 단위로 `@ResponseBody`를 붙이면 JSON 응답이 가능하다.

```java
@Controller
public class MixedController {

    @GetMapping("/page")
    public String page() {
        return "page"; // HTML
    }

    @GetMapping("/api/data")
    @ResponseBody
    public Data data() {
        return new Data(); // JSON
    }
}
```

`@RestController`는 이 `@ResponseBody`를 클래스 전체에 적용한 것과 같다.

---

## Key Point

> **@Controller는 ViewResolver로 HTML을 렌더링하고, @RestController는 HttpMessageConverter로 JSON을 반환한다. REST API 서버라면 @RestController를 사용한다.**

---

## Reference

- [Spring MVC — Spring Docs](https://docs.spring.io/spring-framework/docs/current/reference/html/web.html#mvc)
- [@RestController — Spring Docs](https://docs.spring.io/spring-framework/docs/current/reference/html/web.html#mvc-ann-restcontroller)