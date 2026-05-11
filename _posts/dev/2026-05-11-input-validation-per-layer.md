---
title: "각 계층의 입력값 검증 책임"
date: 2026-05-11
last_modified_at: 2026-05-11
categories: [dev, architecture]
tags: [weekly paper, validation, layered-architecture, spring, bean-validation, domain-driven-design]
toc: true
comments: true
---

## Summary

- 검증 책임은 **형식 검증(Presentation) → 비즈니스 규칙 검증(Service/Domain) → 무결성 보장(Repository)** 으로 계층마다 나뉜다.
- 계층 간 신뢰 경계를 명확히 설정하면 중복 검증 없이도 안정성을 확보할 수 있다.
- 단, 계층을 직접 호출하거나 재사용하는 경우 각 계층이 독립적으로 방어해야 한다는 트레이드오프가 존재한다.

---

## Background

입력값 검증을 어디서 해야 하는지 고민하다 보면 두 가지 상반된 유혹이 생긴다.

하나는 "모든 곳에서 다 검증하자"는 방어적 접근이고, 다른 하나는 "중복이 생기니 한 곳에서만 하자"는 간결함 추구다.

전자는 코드가 장황해지고 유지보수가 어렵다. 후자는 호출 경로가 달라졌을 때 검증이 누락될 수 있다.

어느 계층이 무엇을 책임지는지 원칙을 세우면, 이 둘을 균형 있게 해결할 수 있다.

---

## 각 계층의 검증 책임

### Presentation Layer — 형식(Format) 검증

컨트롤러 계층은 외부에서 들어온 요청이 **처리 가능한 형태인지** 확인한다.

- 필수 필드 존재 여부
- 타입, 길이, 패턴 등 형식 제약

Spring에서는 `@Valid` / `@Validated`와 Bean Validation 어노테이션으로 처리한다.

```java
@PostMapping("/members")
public ResponseEntity<Void> join(@RequestBody @Valid JoinRequest request) {
    memberService.join(request);
    return ResponseEntity.ok().build();
}
```

```java
public class JoinRequest {
    @NotBlank
    private String username;

    @Email
    private String email;

    @Size(min = 8)
    private String password;
}
```

이 계층의 검증은 비즈니스 의미보다 **"API 계약(contract)을 지키는 것"** 에 가깝다. 비즈니스 규칙이 없으므로 변경에 자유롭다.

### Service / Domain Layer — 비즈니스 규칙 검증

서비스 계층은 형식적으로 올바른 값이 **비즈니스 맥락에서도 유효한지** 검증한다.

- 중복 여부 확인 (이미 가입된 이메일인지)
- 상태 조건 (이미 취소된 주문에 환불 요청 금지)
- 정책 규칙 (재고가 0이면 주문 불가)

```java
@Service
public class MemberService {

    public void join(JoinRequest request) {
        if (memberRepository.existsByEmail(request.getEmail())) {
            throw new DuplicateEmailException();
        }
        memberRepository.save(request.toEntity());
    }
}
```

이 계층에 비즈니스 규칙을 모으면 테스트가 쉽고, 규칙이 변경될 때 한 곳만 수정하면 된다.

도메인 모델이 있는 경우에는 도메인 객체 안에서 불변식(invariant)을 직접 지키게 한다.

```java
public class Order {

    public void cancel() {
        if (this.status == OrderStatus.DELIVERED) {
            throw new IllegalStateException("배송 완료된 주문은 취소할 수 없습니다.");
        }
        this.status = OrderStatus.CANCELLED;
    }
}
```

도메인 객체가 자신의 상태를 직접 지키므로, 서비스 코드에 조건문이 분산되지 않는다.

### Repository / Infrastructure Layer — 무결성 보장

DB 제약 조건(Unique, Not Null, FK)은 검증의 최후 방어선이다.

```sql
CREATE TABLE member (
    id    BIGINT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    ...
);
```

이 계층의 제약은 **버그나 예외적인 경로로 잘못된 데이터가 저장되는 것을 막기 위한 안전망**이다. 정상적인 흐름에서는 상위 계층이 이미 걸러냈기 때문에 DB 오류가 발생하면 예외 처리가 필요하다.

---

## 중복 검증을 피하는 원칙

### 신뢰 경계(Trust Boundary)를 기준으로 검증한다

계층 간에 신뢰 경계를 설정하면 검증 위치를 명확하게 결정할 수 있다.

- **외부 경계(External boundary)**: 외부에서 들어온 입력은 무조건 검증한다. 컨트롤러가 담당.
- **내부 경계(Internal boundary)**: 한 계층이 다른 계층을 직접 신뢰하는 경우 중복 검증을 줄인다.

```
외부 요청 → [Controller: 형식 검증] → [Service: 비즈니스 규칙] → [Repository: DB 제약]
```

컨트롤러를 통과한 값은 서비스에서 형식을 다시 검증하지 않는다. 서비스는 비즈니스 규칙에만 집중한다.

### 검증 책임을 한 계층에서 중복하지 않는다

예를 들어, 이메일 중복 확인을 컨트롤러와 서비스 둘 다에서 하는 것은 불필요하다. 중복 여부는 DB 상태를 알아야 판단할 수 있으므로 **서비스 계층에서만 수행하는 것이 맞다.**

---

## 트레이드오프

### 계층을 건너뛰어 직접 호출할 때

배치 처리, 이벤트 핸들러, 내부 스케줄러가 서비스 계층을 직접 호출하는 경우, 컨트롤러의 형식 검증을 거치지 않는다.

이때는 서비스 계층도 형식 검증의 일부를 수행하거나, 입력 DTO에서 정적 팩토리 메서드를 통해 유효성을 보장해야 한다.

```java
// 안전한 생성자를 강제하는 예시
public static OrderCommand of(String productId, int quantity) {
    Assert.hasText(productId, "productId는 비어있을 수 없습니다.");
    Assert.isTrue(quantity > 0, "수량은 양수여야 합니다.");
    return new OrderCommand(productId, quantity);
}
```

### 서비스 재사용성 vs. 검증 단순화

하나의 서비스 메서드가 여러 경로(REST API, Kafka Consumer, Batch)에서 재사용된다면, 해당 서비스는 어느 경로에서 왔는지 알 수 없다. 이 경우 서비스 자체가 비즈니스 규칙 이상의 방어적 검증을 포함해야 해서 계층 간 책임이 혼탁해질 수 있다.

이를 해결하는 방법 중 하나는 **Application Service와 Domain Service를 분리**하는 것이다. 외부 요청에 특화된 Application Service가 형식 검증까지 담당하고, 핵심 Domain Service는 비즈니스 규칙만 유지한다.

### 성능: DB hit를 동반하는 검증

중복 이메일 확인처럼 DB를 조회해야 하는 검증은 서비스 계층에서 수행하더라도 추가적인 쿼리가 발생한다. 경쟁 조건(race condition)을 완전히 막으려면 DB 유니크 제약 + 예외 처리가 병행되어야 한다.

---

## 계층별 검증 요약

| 계층 | 무엇을 검증하는가 | 수단 |
|:--:|---|---|
| Presentation | 형식, 필수 필드, 타입 | Bean Validation (`@Valid`) |
| Service/Domain | 비즈니스 규칙, 상태 조건 | 조건문, 도메인 불변식 |
| Repository | 데이터 무결성 | DB 제약 조건 |

---

## Key Point

> **계층마다 검증의 "이유"가 다르다. Presentation은 형식 계약, Service/Domain은 비즈니스 규칙, Repository는 데이터 무결성을 책임진다. 신뢰 경계를 명확히 하면 중복 없이 각 계층이 자신의 책임만 지킬 수 있다.**

---

## Reference

- [Bean Validation — Jakarta EE Docs](https://jakarta.ee/specifications/bean-validation/3.0/)
- [Domain-Driven Design — Eric Evans](https://www.domainlanguage.com/ddd/)
- [Spring Validation — Spring Docs](https://docs.spring.io/spring-framework/reference/core/validation/beanvalidation.html)