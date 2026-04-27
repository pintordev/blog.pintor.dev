---
title: "JPA N+1 문제: 발생 원인과 해결 방안"
date: 2026-04-27
last_modified_at: 2026-04-27
categories: [dev, jpa]
tags: [jpa, hibernate, spring-boot, n+1, lazy-loading, eager-loading, fetch-join, batch-size, orm]
toc: true
comments: true
---

## Summary

- **N+1 문제**란 1번의 쿼리로 N개의 엔티티를 조회한 뒤, 연관 엔티티를 로딩하기 위해 N번의 추가 쿼리가 발생하는 현상이다.
- LAZY 로딩과 EAGER 로딩 모두에서 발생할 수 있다.
- 해결 방법은 **Fetch Join**, **EntityGraph**, **Batch Size**, **DTO 프로젝션** 네 가지가 대표적이다.

---

## Background

JPA를 처음 쓸 때 가장 많이 마주치는 성능 문제다.

객체 그래프를 자연스럽게 탐색하도록 설계된 ORM의 특성상, 연관 엔티티를 어느 시점에 어떻게 로딩할지를 명시적으로 제어하지 않으면 예상치 못한 쿼리가 대거 발생한다.

로컬 환경에서는 데이터가 적어 잘 드러나지 않다가, 운영 환경에서 데이터가 쌓이면서 응답 지연이나 DB 부하로 나타나는 경우가 많다.

---

## 발생 원인

`Member`(1) — `Order`(N) 관계를 예시로 본다.

```java
@Entity
public class Member {
    @Id @GeneratedValue
    private Long id;
    private String name;

    @OneToMany(mappedBy = "member", fetch = FetchType.LAZY)
    private List<Order> orders;
}
```

```java
List<Member> members = em.createQuery("SELECT m FROM Member m", Member.class)
    .getResultList();

for (Member member : members) {
    System.out.println(member.getOrders().size()); // 여기서 쿼리 발생
}
```

실행되는 쿼리:

```sql
-- 1번: 멤버 전체 조회
SELECT * FROM member;

-- N번: 각 멤버의 주문 조회
SELECT * FROM orders WHERE member_id = 1;
SELECT * FROM orders WHERE member_id = 2;
SELECT * FROM orders WHERE member_id = 3;
-- ...
```

멤버가 100명이면 총 101번의 쿼리가 발생한다.

### EAGER 로딩에서도 발생한다

`fetch = FetchType.EAGER`로 바꿔도 JPQL을 사용하면 동일하게 N+1이 발생한다. JPQL은 작성된 쿼리를 그대로 실행하고, 이후 JPA가 EAGER 설정에 따라 연관 엔티티를 별도로 로딩하기 때문이다.

---

## 해결 방법

### 1. Fetch Join

JPQL에서 `JOIN FETCH`를 사용해 연관 엔티티를 한 번의 쿼리로 함께 조회한다.

```java
List<Member> members = em.createQuery(
    "SELECT m FROM Member m JOIN FETCH m.orders", Member.class)
    .getResultList();
```

```sql
SELECT m.*, o.*
FROM member m
INNER JOIN orders o ON o.member_id = m.id;
```

쿼리 1번으로 해결된다. 가장 직접적인 방법이지만, 컬렉션 Fetch Join 시 **페이징이 불가능**하다는 한계가 있다 (`HHH90003004` 경고 발생, 메모리에서 페이징 처리).

### 2. EntityGraph

`@EntityGraph`로 즉시 로딩할 연관 필드를 지정한다. Fetch Join과 동작은 같지만 JPQL 없이 적용할 수 있다.

```java
@EntityGraph(attributePaths = {"orders"})
@Query("SELECT m FROM Member m")
List<Member> findAllWithOrders();
```

Spring Data JPA 환경에서 간결하게 쓸 수 있다. 마찬가지로 컬렉션에 적용 시 페이징 주의.

### 3. Batch Size

연관 엔티티를 IN 절로 묶어 조회하는 방식이다. N번 쿼리를 `⌈N / batchSize⌉`번으로 줄인다.

```yaml
# application.yml
spring:
  jpa:
    properties:
      hibernate:
        default_batch_fetch_size: 100
```

또는 특정 컬렉션에만 적용:

```java
@BatchSize(size = 100)
@OneToMany(mappedBy = "member", fetch = FetchType.LAZY)
private List<Order> orders;
```

```sql
-- 멤버 100명 조회 시 IN 절 1번으로 처리
SELECT * FROM orders WHERE member_id IN (1, 2, 3, ..., 100);
```

페이징과 함께 사용할 수 있어 Fetch Join의 한계를 보완한다.

### 4. DTO 프로젝션

엔티티 대신 DTO로 직접 조회하는 방식이다. 필요한 데이터만 SELECT하므로 연관 엔티티 로딩 자체가 발생하지 않는다.

```java
@Query("SELECT new com.example.MemberOrderDto(m.id, m.name, o.id) " +
       "FROM Member m JOIN m.orders o")
List<MemberOrderDto> findMemberOrders();
```

성능은 가장 좋지만 엔티티의 변경 감지, 캐시 등 JPA 기능을 활용할 수 없다.

---

## 방법 비교

| 방법 | 쿼리 수 | 페이징 | 사용 편의성 |
|:--:|:--:|:--:|:--:|
| Fetch Join | 1 | 컬렉션 불가 | 중간 |
| EntityGraph | 1 | 컬렉션 불가 | 편리 |
| Batch Size | ⌈N/size⌉ | 가능 | 설정만으로 적용 |
| DTO 프로젝션 | 1 | 가능 | 별도 DTO 필요 |

---

## Key Point

> **N+1은 ORM이 연관 엔티티를 개별 쿼리로 로딩하면서 발생한다. Fetch Join이나 Batch Size로 한 번에 조회하는 것이 핵심이다.**

---

## Reference

- [Hibernate ORM User Guide — Fetching](https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html#fetching)
- [Spring Data JPA — EntityGraph](https://docs.spring.io/spring-data/jpa/docs/current/reference/html/#jpa.entity-graph)
- [토비의 봄 TV — JPA N+1 문제](https://www.youtube.com/watch?v=ni92wUkAmQI)