---
title: "SOAP에서 REST로의 전환"
date: 2026-03-30
last_modified_at: 2026-03-30
categories: [dev, web]
tags: [weekly paper, soap, rest, api, http, xml, json, web-service]
toc: true
comments: true
---

## Summary

- **SOAP**: XML 기반의 엄격한 프로토콜. 계약 중심, 무겁고 복잡하다.
- **REST**: HTTP를 그대로 활용하는 아키텍처 스타일. 가볍고 유연하다.
- REST로 전환한 핵심 이유는 **단순성**과 **웹 친화성**이다.

---

## Background

2000년대 초반 웹 서비스의 표준은 **SOAP**이었다. 기업 간 시스템 통합에 많이 쓰였지만, 인터넷 서비스가 빠르게 성장하면서 SOAP의 복잡성이 발목을 잡기 시작했다.

2000년 Roy Fielding이 REST를 제안하면서 점차 SOAP를 대체해갔고, 현재 대부분의 웹 API는 REST 방식을 따른다.

---

## SOAP (Simple Object Access Protocol)

XML 기반의 메시지 프로토콜이다. WSDL로 서비스 인터페이스를 명세하고, 엄격한 규약에 따라 통신한다.

```xml
<!-- SOAP 요청 예시 -->
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <getUser xmlns="http://example.com/">
      <userId>123</userId>
    </getUser>
  </soap:Body>
</soap:Envelope>
```

### 특징

- **프로토콜**: HTTP, SMTP 등 여러 전송 프로토콜 위에서 동작
- **형식**: XML 고정
- **계약**: WSDL로 인터페이스를 명시적으로 정의
- **표준화**: WS-Security, WS-Transaction 등 풍부한 표준 스펙

---

## REST (Representational State Transfer)

HTTP 프로토콜을 그대로 활용하는 아키텍처 스타일이다. URL로 자원을 표현하고, HTTP 메서드로 행위를 나타낸다.

```
GET    /users/123       → 사용자 조회
POST   /users           → 사용자 생성
PUT    /users/123       → 사용자 수정
DELETE /users/123       → 사용자 삭제
```

```json
// REST 응답 예시
{
  "id": 123,
  "name": "Alice",
  "email": "alice@example.com"
}
```

### 특징

- **프로토콜**: HTTP 전용
- **형식**: JSON, XML 등 자유
- **무상태(Stateless)**: 각 요청이 독립적
- **캐싱**: HTTP 캐싱을 그대로 활용

---

## SOAP에서 REST로 전환한 이유

| 이유 | 설명 |
|---|---|
| **단순성** | XML 봉투, WSDL 없이 HTTP만으로 통신 가능 |
| **가벼운 페이로드** | JSON이 XML보다 훨씬 간결 |
| **웹 친화성** | 브라우저, 모바일에서 바로 사용 가능 |
| **개발 생산성** | 별도 클라이언트 생성 도구 불필요 |
| **확장성** | 무상태 설계로 수평 확장이 쉬움 |

---

## 장단점 비교

| 구분 | SOAP | REST |
|:--:|:--:|:--:|
| 복잡도 | 높음 | 낮음 |
| 페이로드 | XML (무거움) | JSON (가벼움) |
| 표준화 | 엄격 | 느슨함 |
| 보안 | WS-Security | HTTPS + OAuth |
| 트랜잭션 | WS-Transaction 지원 | 별도 구현 필요 |
| 적합한 상황 | 금융·기업 B2B 통합 | 웹·모바일 API |

---

## Key Point

> **REST는 HTTP를 그대로 활용해 단순하고 가볍다. SOAP의 엄격한 계약과 XML 복잡성을 버리고 개발 생산성을 택한 것이 전환의 핵심 이유다.**

---

## Reference

- [REST — Roy Fielding 논문](https://ics.uci.edu/~fielding/pubs/dissertation/rest_arch_style.htm)
- [SOAP — W3C](https://www.w3.org/TR/soap/)