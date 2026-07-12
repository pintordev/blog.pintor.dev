---
title: "JWT(JSON Web Token)의 구조와 각 구성 요소의 역할"
date: 2026-07-06
last_modified_at: 2026-07-06
categories: [dev, security]
tags: [weekly paper, jwt, authentication, security]
toc: true
comments: true
---

## Summary

- JWT는 `Header.Payload.Signature` 세 부분을 점(`.`)으로 연결한 문자열이며, 각 부분은 Base64URL로 인코딩된다.
- **Header**는 토큰의 메타데이터(서명 알고리즘, 타입)를, **Payload**는 실제 데이터(Claim)를, **Signature**는 위변조 방지를 위한 서명을 담당한다.
- Payload는 암호화가 아니라 인코딩이므로 누구나 디코딩해 내용을 볼 수 있다 — 무결성은 보장되지만 기밀성은 보장되지 않는다.

---

## Background

분산 시스템, 마이크로서비스, SPA/모바일 환경이 확산되면서 서버가 상태(세션)를 들고 있지 않아도 되는 인증 방식이 필요해졌다. JWT(RFC 7519, 2015)는 "자기 완결적(self-contained)" 토큰이라는 개념으로 이 문제를 해결했다. 토큰 자체에 사용자 정보와 서명이 포함되어 있어, 서버는 별도 저장소를 조회하지 않고 서명 검증만으로 토큰의 유효성과 내용을 신뢰할 수 있다.

---

## 전체 구조

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
.
eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNzUxMjAwMDAwLCJleHAiOjE3NTEyMDA5MDB9
.
TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ
```

```
Header . Payload . Signature
```

각 구간은 Base64URL로 인코딩되며, 점(`.`)으로 구분된 세 세그먼트가 합쳐져 하나의 JWT 문자열이 된다.

---

## Header

토큰을 어떻게 검증해야 하는지에 대한 메타데이터를 담는다.

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

| 필드 | 역할 |
|---|---|
| `alg` | 서명에 사용된 알고리즘 (예: `HS256`, `RS256`, `ES256`) |
| `typ` | 토큰 타입. 통상 `JWT` 고정값 |
| `kid` (선택) | 키 식별자. 여러 키를 회전(rotation)할 때 어떤 공개키로 검증할지 지정 |

`alg`는 검증 로직이 신뢰하는 값이 아니라 **토큰 발급자가 주장하는 값**이라는 점이 중요하다. 서버가 `alg` 헤더 값을 그대로 믿고 검증 알고리즘을 결정하면, `alg: none`으로 서명 검증 자체를 우회하거나 RS256용 공개키를 HS256 비밀키로 오용하는 알고리즘 혼동 공격(Algorithm Confusion Attack)이 가능해진다. 따라서 서버 측에서 허용 알고리즘을 화이트리스트로 고정해야 한다.

---

## Payload

실제 전달하려는 데이터, 즉 **Claim**의 집합이다. Claim은 세 종류로 나뉜다.

### Registered Claims (등록된 표준 클레임)

RFC 7519가 정의한 예약 필드로, 필수는 아니지만 상호운용성을 위해 권장된다.

| Claim | 의미 |
|---|---|
| `iss` (Issuer) | 토큰 발급자 |
| `sub` (Subject) | 토큰의 주체 (보통 사용자 ID) |
| `aud` (Audience) | 토큰의 수신 대상 (어떤 서비스가 사용해야 하는지) |
| `exp` (Expiration Time) | 만료 시각 (Unix Timestamp) — 이후 토큰은 거부되어야 함 |
| `nbf` (Not Before) | 이 시각 이전에는 토큰이 유효하지 않음 |
| `iat` (Issued At) | 토큰 발급 시각 |
| `jti` (JWT ID) | 토큰 고유 식별자. 재사용 탐지·블랙리스트 처리에 활용 |

### Public Claims (공개 클레임)

IANA JWT Claims Registry에 등록하거나 충돌 방지를 위해 URI 형태로 정의하는 클레임 (예: `https://example.com/role`).

### Private Claims (비공개 클레임)

발급자와 소비자가 합의한 커스텀 필드 (예: `role`, `userId`, `permissions`).

```json
{
  "sub": "1234567890",
  "name": "John Doe",
  "role": "ADMIN",
  "iat": 1751200000,
  "exp": 1751200900
}
```

### 주의사항

Payload는 Base64URL **인코딩**일 뿐 암호화가 아니다. `atob()` 한 줄이면 누구나 내용을 읽을 수 있다.

- 비밀번호, 주민등록번호, 카드번호 등 민감 정보를 Payload에 절대 포함하지 않는다.
- 기밀성이 필요하면 서명(JWS)만으로는 부족하고 JWE(JSON Web Encryption)로 페이로드 자체를 암호화해야 한다.

---

## Signature

Header와 Payload가 위변조되지 않았음을 보증하는 서명 값이다.

```
signature = HMACSHA256(
  base64UrlEncode(header) + "." + base64UrlEncode(payload),
  secret
)
```

### 대칭키 방식 (HS256 등)

- 하나의 `secret`으로 서명과 검증을 모두 수행한다.
- 서명자와 검증자가 동일한 비밀키를 공유해야 하므로, 여러 서비스가 검증만 수행하는 구조(마이크로서비스)에서는 비밀키 분산 자체가 위험 요소가 된다.

### 비대칭키 방식 (RS256, ES256 등)

- 발급자는 **개인키**로 서명하고, 검증자는 **공개키**로 검증한다.
- 검증 전용 서비스에 개인키를 공유할 필요가 없어 마이크로서비스 환경에 적합하다.
- 공개키는 보통 JWKS(JSON Web Key Set) 엔드포인트로 배포해 여러 검증 서버가 조회한다.

### 서명의 역할 범위

서명은 **무결성(integrity)** 과 **발급자 인증(authenticity)** 을 보장하지만, Payload 자체를 숨기지는 않는다. "서명되었다 = 변조되지 않았다"이지, "서명되었다 = 비밀이다"가 아니라는 점을 혼동하지 않아야 한다.

---

## 검증 흐름 요약

```
1. 서버가 JWT 수신
2. Header에서 alg 확인 (서버가 허용한 알고리즘인지 화이트리스트 검사)
3. Header + Payload를 동일 알고리즘/키로 재서명
4. 재계산한 서명과 토큰의 Signature 세그먼트 비교
5. 일치하면 Payload의 exp, nbf, aud 등 클레임 검증
6. 모두 통과 시 인증 성공
```

---

## Key Point

> **JWT의 세 부분은 각각 "어떻게 검증할지(Header)", "무엇을 전달할지(Payload)", "변조되지 않았음을 증명(Signature)"으로 역할이 명확히 분리되어 있다.** 다만 서명은 무결성만 보장할 뿐 기밀성은 보장하지 않으므로 Payload에 민감 정보를 넣어서는 안 되고, Header의 `alg` 값은 서버가 스스로 검증 방식을 고정해야 알고리즘 혼동 공격을 막을 수 있다.

---

## Reference

- [RFC 7519 — JSON Web Token (JWT)](https://datatracker.ietf.org/doc/html/rfc7519) — JWT 공식 명세
- [RFC 7515 — JSON Web Signature (JWS)](https://datatracker.ietf.org/doc/html/rfc7515) — JWT 서명 구조의 기반 명세
- [jwt.io Introduction](https://jwt.io/introduction) — 구조와 클레임에 대한 시각적 설명
- [OWASP JWT Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_for_Java_Cheat_Sheet.html) — 알고리즘 혼동 등 구현 시 주의사항