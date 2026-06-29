---
title: "세션 기반 인증과 토큰 기반 인증의 차이점과 각각의 보안 고려사항"
date: 2026-06-29
last_modified_at: 2026-06-29
categories: [dev, security]
tags: [weekly paper, authentication, session, jwt, security]
toc: true
comments: true
---

## Summary

- **세션 기반 인증**: 서버가 상태를 보관하고, 클라이언트는 세션 ID만 쿠키로 전달하는 Stateful 방식
- **토큰 기반 인증**: 서버가 서명한 토큰을 클라이언트가 저장·전달하는 Stateless 방식
- HTTP는 본래 무상태(stateless) 프로토콜이므로 인증 상태를 유지하기 위해 두 방식 중 하나를 선택해야 한다. 각 방식은 구조적 특성이 달라 보안 위협 표면도 다르다.

---

## Background

HTTP는 요청 간 상태를 기억하지 않는다. 로그인 후에도 매 요청마다 "이 사람이 누구인가"를 서버가 알아야 하므로, 초기 웹에서는 서버 메모리에 세션을 저장하고 쿠키로 세션 ID를 주고받는 방식이 자연스럽게 자리 잡았다.

이후 모바일 앱, SPA, 마이크로서비스 아키텍처가 확산되면서 서버 간 세션 공유 문제가 부각됐다. 이를 해결하기 위해 서버가 상태를 갖지 않는 토큰 기반 인증이 주목받았고, JWT(JSON Web Token)가 사실상 표준으로 자리 잡았다.

---

## 세션 기반 인증 (Session-Based Authentication)

### 동작 흐름

```
1. 클라이언트  →  서버: 로그인 (ID/PW)
2. 서버: 세션 생성 후 세션 저장소에 저장
3. 서버  →  클라이언트: Set-Cookie: sessionId=abc123
4. 클라이언트  →  서버: Cookie: sessionId=abc123 (이후 모든 요청)
5. 서버: 세션 저장소 조회 → 사용자 확인
```

### 특징

| 항목 | 내용 |
|---|---|
| 상태 보관 위치 | 서버 (메모리, Redis, DB 등) |
| 클라이언트 보관 | 세션 ID (쿠키) |
| 서버 부하 | 요청마다 세션 저장소 조회 |
| 수평 확장 | 세션 공유 필요 (Sticky Session 또는 중앙 저장소) |
| 로그아웃 | 서버에서 세션 즉시 삭제 → 확실한 무효화 |

### 보안 고려사항

**세션 하이재킹 (Session Hijacking)**  
공격자가 세션 ID를 탈취해 사용자처럼 행동한다. 네트워크 스니핑, XSS를 통한 쿠키 탈취가 주요 경로다.

- 대응: `Secure` 속성(HTTPS 전송만 허용), `HttpOnly` 속성(JS 접근 차단), 세션 ID 재발급(로그인 성공 직후)

**CSRF (Cross-Site Request Forgery)**  
쿠키는 브라우저가 자동으로 전송하므로, 악성 사이트에서 사용자 권한으로 요청을 위조할 수 있다.

- 대응: CSRF 토큰, `SameSite=Strict|Lax` 쿠키 속성, Referer 검증

**세션 고정 공격 (Session Fixation)**  
공격자가 미리 생성한 세션 ID를 피해자에게 사용하게 만든다.

- 대응: 로그인 성공 시 반드시 새 세션 ID 발급

**세션 만료 미설정**  
만료 없는 세션은 영구적인 취약점이 된다.

- 대응: 절대 만료(Absolute Timeout)와 유휴 만료(Idle Timeout) 모두 설정

---

## 토큰 기반 인증 (Token-Based Authentication)

### 동작 흐름

```
1. 클라이언트  →  서버: 로그인 (ID/PW)
2. 서버: 비밀키로 JWT 서명 후 발급
3. 서버  →  클라이언트: { accessToken, refreshToken }
4. 클라이언트  →  서버: Authorization: Bearer <accessToken> (이후 모든 요청)
5. 서버: 서명 검증만으로 사용자 확인 (저장소 조회 없음)
```

### JWT 구조

```
Header.Payload.Signature
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMSIsImV4cCI6MTc1MH0.abc123
```

- **Header**: 알고리즘 정보 (e.g., HS256)
- **Payload**: 클레임 (사용자 ID, 권한, 만료 시각 등) — Base64로 인코딩, 암호화 아님
- **Signature**: Header + Payload를 비밀키로 서명

### 특징

| 항목 | 내용 |
|---|---|
| 상태 보관 위치 | 클라이언트 (localStorage, 쿠키 등) |
| 서버 부하 | 서명 검증만 수행, 저장소 조회 없음 |
| 수평 확장 | 용이 (서버 간 공유 상태 없음) |
| 로그아웃 | 토큰 만료 전까지 서버 측 무효화 어려움 |

### 보안 고려사항

**토큰 탈취**  
탈취된 토큰은 만료 전까지 유효하다. 세션처럼 서버에서 즉시 무효화할 수 없다.

- 대응: Access Token 수명을 짧게 (5~15분), Refresh Token으로 재발급, Refresh Token Rotation

**저장 위치 딜레마**

| 저장소 | XSS 취약 | CSRF 취약 |
|---|---|---|
| localStorage | O (JS로 접근 가능) | X |
| 메모리 (변수) | X | X (페이지 새로고침 시 사라짐) |
| HttpOnly 쿠키 | X | O |

HttpOnly 쿠키에 저장하되 `SameSite` 속성으로 CSRF를 방어하는 것이 현재 가장 일반적인 권고다.

**알고리즘 혼동 공격 (Algorithm Confusion)**  
`alg: none`을 헤더에 담아 서명 검증을 우회하거나, RS256 키를 HS256의 비밀키로 오용하는 공격이 있었다.

- 대응: 라이브러리에서 허용 알고리즘 명시적으로 제한, `alg: none` 비허용

**Payload 노출**  
JWT Payload는 Base64 디코딩만으로 내용 확인이 가능하다. 암호화가 아니다.

- 대응: 민감 정보(주민번호, 카드번호 등)를 Payload에 절대 포함하지 않기. 필요하면 JWE(JSON Web Encryption) 사용

**Refresh Token 관리**  
Refresh Token이 탈취되면 장기간 접근이 가능하다.

- 대응: Refresh Token Rotation (사용 시마다 새 토큰 발급 + 이전 토큰 무효화), DB에 저장해 검증

---

## 비교 요약

| 비교 항목 | 세션 기반 | 토큰 기반 |
|---|---|---|
| 상태 | Stateful | Stateless |
| 서버 확장성 | 낮음 (세션 공유 필요) | 높음 |
| 즉각적 무효화 | 가능 (세션 삭제) | 어려움 (만료 대기) |
| 주요 위협 | 세션 하이재킹, CSRF | 토큰 탈취, XSS, 알고리즘 혼동 |
| 적합한 환경 | 전통적인 서버 렌더링 웹 | SPA, 모바일, 마이크로서비스 |
| 서버 저장소 | 필요 (Redis 등) | 불필요 (서명 검증만) |

---

## Key Point

> **세션은 "서버가 기억한다", 토큰은 "클라이언트가 증명한다".** 세션은 즉각적인 무효화가 강점이지만 수평 확장이 어렵고, JWT는 Stateless로 확장이 쉽지만 탈취된 토큰을 만료 전에 막기가 구조적으로 어렵다. 어떤 방식을 선택하든 핵심은 동일하다 — 전송은 HTTPS, 저장은 HttpOnly 쿠키, 수명은 짧게, 갱신은 Rotation으로.

---

## Reference

- [RFC 7519 — JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519) — JWT 공식 명세
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — 세션 보안 권고 사항 총정리
- [OWASP JWT Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html) — JWT 취약점 및 대응
- [PortSwigger — JWT Attacks](https://portswigger.net/web-security/jwt) — 알고리즘 혼동 공격 등 실습 기반 설명