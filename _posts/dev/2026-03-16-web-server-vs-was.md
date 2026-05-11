---
title: "웹 서버(Web Server)와 WAS"
date: 2026-03-16
last_modified_at: 2026-03-16
categories: [dev, spring]
tags: [weekly paper, web-server, was, tomcat, nginx, apache, spring-boot, servlet]
toc: true
comments: true
---

## Summary

- **웹 서버**: 정적 콘텐츠(HTML, CSS, 이미지)를 제공한다. Nginx, Apache.
- **WAS**: 동적 콘텐츠 처리와 비즈니스 로직 실행이 가능하다. Tomcat, JBoss.
- Spring Boot의 **내장 톰캣은 WAS**다. 정적 파일도 처리하지만 본질은 서블릿 컨테이너다.

---

## Background

웹 애플리케이션을 배포하면 클라이언트 요청은 크게 두 종류다. 이미지나 CSS 같은 정적 파일 요청과, 로그인·주문 처리처럼 서버 로직이 필요한 동적 요청이다.

이 두 가지를 처리하는 역할을 구분한 것이 웹 서버와 WAS다.

---

## 웹 서버 (Web Server)

HTTP 요청을 받아 **정적 파일을 그대로 반환**하는 서버다.

- 파일 시스템에 있는 HTML, CSS, JS, 이미지를 읽어서 응답
- 프로그램 실행 능력 없음
- 대표: **Nginx**, **Apache HTTP Server**

```
클라이언트 → GET /logo.png → 웹 서버 → logo.png 파일 반환
```

빠르고 가볍다. 수만 개의 동시 연결을 효율적으로 처리한다.

---

## WAS (Web Application Server)

HTTP 요청을 받아 **프로그램을 실행하고 동적으로 응답을 생성**하는 서버다.

- 서블릿/JSP 실행, DB 연동, 비즈니스 로직 처리
- 정적 파일도 처리할 수 있지만 웹 서버보다 비효율적
- 대표: **Apache Tomcat**, JBoss, WebLogic

```
클라이언트 → POST /orders → WAS → 주문 처리 로직 실행 → JSON 응답 생성
```

---

## 비교

| 구분 | 웹 서버 | WAS |
|:--:|:--:|:--:|
| 처리 내용 | 정적 콘텐츠 | 동적 콘텐츠 + 정적 |
| 프로그램 실행 | 불가 | 가능 |
| 대표 제품 | Nginx, Apache | Tomcat, JBoss |
| 성능 | 정적 파일에 최적화 | 동적 처리에 최적화 |

---

## 실무 구성

대규모 서비스에서는 웹 서버와 WAS를 함께 사용한다.

```
클라이언트
    ↓
  Nginx (웹 서버)
  ├─ 정적 파일 → 직접 응답
  └─ 동적 요청 → 프록시 → Tomcat (WAS)
```

- Nginx가 앞단에서 정적 파일을 처리하고 부하를 분산
- Tomcat은 동적 요청에만 집중

---

## Spring Boot의 내장 톰캣

Spring Boot는 Tomcat을 내장하고 있어 별도 WAS 설치 없이 실행된다.

```java
// Spring Boot main 실행 시 내장 톰캣이 함께 시작됨
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

내장 톰캣은 **WAS**다. `DispatcherServlet`을 서블릿으로 등록하고, HTTP 요청을 받아 Spring MVC로 전달하는 서블릿 컨테이너 역할을 한다.

정적 파일(`resources/static/`) 처리도 가능하지만, 운영 환경에서는 Nginx를 앞에 두고 정적 파일은 Nginx가 처리하는 구성을 많이 쓴다.

---

## Key Point

> **웹 서버는 파일을 반환하고, WAS는 프로그램을 실행한다. Spring Boot 내장 톰캣은 WAS이며, 서블릿 컨테이너로서 동작한다.**

---

## Reference

- [Apache Tomcat — Apache Docs](https://tomcat.apache.org/tomcat-10.1-doc/index.html)
- [Spring Boot Embedded Web Servers — Spring Docs](https://docs.spring.io/spring-boot/docs/current/reference/html/howto.html#howto.webserver)