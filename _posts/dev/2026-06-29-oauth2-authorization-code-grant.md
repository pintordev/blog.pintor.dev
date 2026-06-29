---
title: "OAuth 2.0의 주요 컴포넌트와 Authorization Code Grant 흐름"
date: 2026-06-29
last_modified_at: 2026-06-29
categories: [dev, security]
tags: [weekly paper, oauth2, authentication, authorization, security]
toc: true
comments: true
---

## Summary

- **OAuth 2.0**: 제3자 애플리케이션이 사용자 자격증명 없이 리소스에 접근할 수 있도록 위임하는 권한 부여 프레임워크
- **Authorization Code Grant**: 가장 안전한 OAuth 2.0 흐름으로, 백채널(서버-서버)에서 Access Token을 교환해 토큰 노출을 최소화한다
- Resource Owner가 Client에게 직접 비밀번호를 주는 대신, Authorization Server를 통해 제한된 범위의 접근 권한만 위임하는 것이 핵심이다.

---

## Background

전통적으로 제3자 앱이 사용자 데이터에 접근하려면 사용자의 ID/PW를 직접 받아야 했다. 이는 비밀번호 노출, 과도한 권한, 권한 철회 불가 등 심각한 문제를 안고 있었다.

OAuth 2.0(RFC 6749, 2012)은 이를 해결하기 위해 "인증(Authentication)"이 아닌 "권한 위임(Authorization)"에 집중한 표준 프레임워크를 정의했다. 사용자는 자신의 비밀번호를 노출하지 않고, 특정 범위(Scope)의 접근 권한만 제3자 앱에 위임할 수 있다.

> OAuth 2.0은 인증 프로토콜이 아니다. 권한 위임 프로토콜이다. 인증이 필요하다면 OAuth 2.0 위에 구축된 OpenID Connect(OIDC)를 사용해야 한다.

---

## 주요 컴포넌트

OAuth 2.0은 네 가지 역할(Role)로 구성된다.

| 역할 | 설명 | 예시 |
|---|---|---|
| **Resource Owner** | 보호된 리소스의 소유자. 보통 사용자 | 구글 계정 사용자 |
| **Client** | Resource Owner 대신 리소스에 접근하려는 애플리케이션 | "구글로 로그인" 버튼이 있는 서드파티 앱 |
| **Authorization Server** | 사용자 인증 후 Access Token을 발급하는 서버 | accounts.google.com |
| **Resource Server** | Access Token을 검증하고 보호된 리소스를 제공하는 서버 | googleapis.com (Gmail, Drive 등) |

### 주요 용어

- **Access Token**: Resource Server에 접근할 때 사용하는 단기 토큰
- **Refresh Token**: Access Token 만료 시 재발급에 사용하는 장기 토큰 (Authorization Server에만 제출)
- **Scope**: 접근 권한의 범위 (e.g., `read:email`, `write:calendar`)
- **Authorization Code**: Access Token 교환에 사용하는 일회성 단기 코드 (프론트채널 경유)
- **Client ID / Client Secret**: Client를 식별하는 공개 ID와 비밀 키

---

## Authorization Code Grant 흐름

서버사이드 렌더링 웹 앱이나 백엔드를 가진 SPA에 가장 적합한 흐름이다. 브라우저(프론트채널)를 통해 Authorization Code만 전달하고, 실제 토큰 교환은 서버-서버 간(백채널)에서 이루어져 Access Token이 브라우저에 노출되지 않는다.

### 흐름 다이어그램

```
Resource Owner (브라우저)          Client (앱 서버)          Authorization Server
       |                                 |                            |
       |-- ① 로그인 버튼 클릭 ---------->|                            |
       |                                 |-- ② Authorization Request ->|
       |<--------------------------------|  (redirect_uri, scope,      |
       |                                 |   state, code_challenge)    |
       |-- ③ 사용자 로그인 & 동의 ---------------------------------->|
       |<------------------------------------------------ ④ redirect--|
       |   (Authorization Code + state)                               |
       |-- ⑤ Code 전달 ----------->|                                  |
       |                            |-- ⑥ Token Request ------------->|
       |                            |   (code, redirect_uri,          |
       |                            |    code_verifier, client_secret)|
       |                            |<---------- ⑦ Token Response ----|
       |                            |   (access_token, refresh_token) |
       |<-- ⑧ 로그인 완료 ----------|                                  |
```

### 단계별 설명

**① 사용자가 로그인 시작**  
"구글로 로그인" 버튼 클릭 등 Client 앱에서 인증 흐름을 시작한다.

**② Authorization Request (프론트채널)**  
Client는 사용자 브라우저를 Authorization Server로 리다이렉트한다.

```
https://auth.example.com/authorize?
  response_type=code
  &client_id=CLIENT_ID
  &redirect_uri=https://app.example.com/callback
  &scope=read:profile read:email
  &state=RANDOM_STATE_VALUE
  &code_challenge=CODE_CHALLENGE          ← PKCE
  &code_challenge_method=S256             ← PKCE
```

- `state`: CSRF 방지용 랜덤 값. 응답에서 동일한 값이 반환되는지 검증한다.
- `code_challenge` / `code_challenge_method`: PKCE 파라미터 (후술)

**③ 사용자 인증 및 동의**  
Authorization Server가 사용자 로그인 화면과 권한 동의 화면을 제공한다. 사용자가 동의하면 다음 단계로 진행한다.

**④ Authorization Code 전달 (프론트채널)**  
Authorization Server가 브라우저를 `redirect_uri`로 리다이렉트한다.

```
https://app.example.com/callback?
  code=AUTHORIZATION_CODE
  &state=RANDOM_STATE_VALUE
```

Authorization Code는 **단기(수 분), 일회성**이다. 브라우저 URL에 잠시 노출되지만 즉시 교환에 사용한다.

**⑤ Code 전달**  
브라우저가 받은 Authorization Code를 Client 앱 서버로 전달한다.

**⑥ Token Request (백채널)**  
Client 서버가 Authorization Server에 직접 HTTPS 요청을 보낸다. 브라우저를 거치지 않는다.

```http
POST /token HTTP/1.1
Host: auth.example.com
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTHORIZATION_CODE
&redirect_uri=https://app.example.com/callback
&client_id=CLIENT_ID
&client_secret=CLIENT_SECRET
&code_verifier=CODE_VERIFIER   ← PKCE
```

**⑦ Token Response**  
검증 성공 시 Authorization Server가 토큰을 응답한다.

```json
{
  "access_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "tGzv3JOk...",
  "scope": "read:profile read:email"
}
```

**⑧ 로그인 완료**  
Client는 Access Token으로 Resource Server API를 호출한다.

---

## PKCE (Proof Key for Code Exchange)

원래 모바일 앱(Client Secret 보관 불가)을 위한 확장이었으나, 현재는 **모든 환경에서 권고**된다(RFC 7636, OAuth 2.1).

### 동작 원리

```
Client가 준비:
  code_verifier  = 랜덤 문자열 (43~128자)
  code_challenge = BASE64URL(SHA256(code_verifier))

② Authorization Request에 code_challenge 포함
⑥ Token Request에 code_verifier 포함
   → Authorization Server가 SHA256(code_verifier) == code_challenge 검증
```

Authorization Code가 탈취되더라도 `code_verifier` 없이는 토큰 교환이 불가능하다.

---

## 보안 고려사항

**state 파라미터 검증 누락 (CSRF)**  
Authorization Code 응답의 `state` 값이 요청 시 생성한 값과 일치하는지 반드시 검증해야 한다. 누락 시 공격자가 피해자의 계정에 자신의 Authorization Code를 바인딩하는 CSRF 공격이 가능하다.

**redirect_uri 검증 미흡**  
Authorization Server가 `redirect_uri`를 정확히 비교하지 않으면 공격자가 임의 URI로 Authorization Code를 탈취할 수 있다.

- 대응: Authorization Server에서 등록된 URI와 완전 일치(exact match) 검증

**Authorization Code 재사용**  
Authorization Code는 일회성이어야 한다. 서버가 동일한 Code의 재사용을 탐지하면 해당 Code로 발급된 모든 토큰을 즉시 철회해야 한다(RFC 6749 §4.1.2).

**Client Secret 노출**  
브라우저/모바일 앱에 Client Secret을 포함하면 누구나 추출할 수 있다. 이 경우 PKCE만으로 보안을 유지해야 한다.

**Access Token 수명**  
Access Token은 수명을 짧게 유지하고, 갱신은 Refresh Token으로 처리한다. Refresh Token은 서버에 안전하게 보관하고, 사용 시마다 Rotation을 적용한다.

---

## 다른 Grant Type과의 비교

| Grant Type | 사용 환경 | 특징 |
|---|---|---|
| **Authorization Code** | 서버사이드 앱, SPA (+ PKCE) | 가장 안전, 백채널 토큰 교환 |
| Implicit | (현재 비권고) | Access Token이 프론트채널 노출 → 보안 취약 |
| Client Credentials | 서버-서버 (사용자 없음) | Machine-to-Machine 인증 |
| Device Code | TV, CLI 등 브라우저 없는 환경 | 별도 기기에서 인증 |
| Resource Owner Password | (현재 비권고) | 사용자 ID/PW를 Client가 직접 처리 → OAuth 목적 훼손 |

---

## Key Point

> **Authorization Code Grant의 핵심은 채널 분리다.** Authorization Code는 브라우저(프론트채널)를 통해 전달하되, Access Token은 반드시 서버-서버 간 백채널에서만 교환한다. 여기에 PKCE로 Code 탈취 위험을 막고, state로 CSRF를 방어하면 현재 권고되는 가장 견고한 OAuth 2.0 흐름이 완성된다.

---

## Reference

- [RFC 6749 — The OAuth 2.0 Authorization Framework](https://datatracker.ietf.org/doc/html/rfc6749) — OAuth 2.0 공식 명세
- [RFC 7636 — PKCE for OAuth Public Clients](https://datatracker.ietf.org/doc/html/rfc7636) — PKCE 명세
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1) — Implicit·ROPC 제거, PKCE 의무화 등 보안 강화 초안
- [OWASP OAuth Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html) — OAuth 2.0 보안 권고 사항
- [Auth0 — Which OAuth 2.0 Flow Should I Use?](https://auth0.com/docs/get-started/authentication-and-authorization-flow/which-oauth-2-0-flow-should-i-use) — Grant Type 선택 가이드