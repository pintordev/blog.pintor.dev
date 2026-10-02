---
title: "JPA 영속성 컨텍스트와 1차 캐시 정리"
date: 2026-10-02
last_modified_at: 2026-10-02
categories: [dev, jpa]
tags: [study note, jpa, hibernate, orm, persistence-context]
toc: true
comments: true
---

## Summary

- **영속성 컨텍스트**는 엔티티를 보관·관리하는 1차 캐시이자, `EntityManager`가 변경 사항을 추적하는 메모리 공간이다 — DB가 아니라 애플리케이션 메모리에 존재한다
- 엔티티는 **비영속 → 영속 → 준영속/삭제** 네 가지 상태를 오가며, "영속 상태"라는 말 자체가 곧 "영속성 컨텍스트가 이 엔티티를 관리 중이다"라는 뜻이다
- **1차 캐시**는 같은 영속성 컨텍스트 안에서 같은 PK로 조회하면 **쿼리를 날리지 않고 캐시된 엔티티를 그대로 반환**한다 — 그래서 같은 트랜잭션 안에서 `find()`로 가져온 두 엔티티는 `==` 비교(동일성)가 항상 참이다
- `save()`를 호출하지 않아도 변경이 DB에 반영되는 이유는 **변경 감지(Dirty Checking)** 때문이다 — 트랜잭션 커밋 시점에 1차 캐시의 스냅샷과 현재 엔티티 상태를 비교해 달라진 필드만 UPDATE 쿼리를 만든다
- INSERT 쿼리도 즉시 나가지 않고 **쓰기 지연 SQL 저장소**에 쌓였다가 flush 시점에 한꺼번에 나간다 — 그래서 트랜잭션 커밋 전에는 DB를 직접 조회해도 반영되지 않은 것처럼 보일 수 있다
- 1차 캐시는 **영속성 컨텍스트(사실상 트랜잭션) 범위**로 짧게 사는 캐시이고, 여러 트랜잭션·여러 사용자가 공유하는 캐시가 아니다 — 애플리케이션 전역에서 공유하는 캐시가 필요하면 별도의 **2차 캐시**를 써야 한다

---

## 영속성 컨텍스트란?

**영속성 컨텍스트(Persistence Context)** 는 엔티티를 영구 저장하는 환경이라는 뜻이지만, 실제로는 **`EntityManager`가 엔티티를 보관하고 추적하는 애플리케이션 메모리 상의 공간**이다. DB와 통신하기 전에 엔티티가 거쳐 가는 중간 계층이라고 보면 된다.

```java
EntityManager em = emf.createEntityManager();
em.getTransaction().begin();

Member member = new Member("김철수");
em.persist(member);     // 영속성 컨텍스트에 저장 — 이 시점엔 아직 INSERT 쿼리가 안 나감

em.getTransaction().commit();  // 커밋 시점에 flush가 일어나며 실제 INSERT 쿼리 실행
```

`EntityManager`와 영속성 컨텍스트는 보통 1:1 관계다(스프링 환경에서는 트랜잭션 범위와 묶여 관리된다). `persist()`를 호출해도 즉시 DB에 쿼리가 나가지 않는다는 점이 중요한데, 그 이유는 아래 **쓰기 지연**에서 다룬다.

---

## 엔티티의 생명주기

```
비영속(new/transient)
    │ em.persist(entity)
    ▼
영속(managed) ──── em.detach(entity) / em.clear() / em.close() ────▶ 준영속(detached)
    │ em.remove(entity)
    ▼
삭제(removed)
```

| 상태 | 설명 |
|---|---|
| 비영속 | `new`로 막 생성되어 영속성 컨텍스트와 아무 관계가 없는 순수 객체 |
| 영속 | 영속성 컨텍스트가 관리 중 — 1차 캐시에 들어가 있고, 변경 감지 대상이 됨 |
| 준영속 | 한때 영속 상태였지만 영속성 컨텍스트에서 분리됨 — 변경해도 DB에 반영되지 않음 |
| 삭제 | `remove()` 호출로 삭제 대상으로 표시됨 — flush 시점에 DELETE 쿼리 실행 |

```java
Member member = new Member("김철수");        // 비영속
em.persist(member);                          // 영속 — 1차 캐시에 저장됨

em.detach(member);                           // 준영속 — 더 이상 변경 감지 안 됨
member.setName("박영희");                     // 바꿔도 DB에 반영 안 됨

em.remove(em.find(Member.class, 1L));        // 삭제 — flush 시 DELETE 실행
```

**준영속 상태를 만드는 세 가지 방법**

| 메서드 | 범위 |
|---|---|
| `detach(entity)` | 특정 엔티티 하나만 영속성 컨텍스트에서 분리 |
| `clear()` | 영속성 컨텍스트 전체를 초기화(모든 엔티티가 준영속이 됨) |
| `close()` | 영속성 컨텍스트 자체를 종료 |

---

## 1차 캐시 — 구조와 동작

영속성 컨텍스트 내부에는 **PK를 key로, 엔티티를 value로 갖는 맵(식별자 맵, Identity Map)** 이 있다. 이것이 1차 캐시다.

```java
Member member1 = em.find(Member.class, 1L);  // ① DB에서 SELECT, 1차 캐시에 저장
Member member2 = em.find(Member.class, 1L);  // ② 1차 캐시에 있으므로 SELECT 쿼리 없이 즉시 반환

System.out.println(member1 == member2);      // true — 완전히 같은 객체
```

②번 `find()`는 쿼리 로그를 찍어보면 실제로 SQL이 나가지 않는 것을 확인할 수 있다. PK가 1차 캐시에 이미 있으면 영속성 컨텍스트가 DB를 거치지 않고 캐시된 엔티티를 그대로 반환하기 때문이다.

**동일성(identity) 보장** 이 캐싱 덕분에 같은 영속성 컨텍스트 안에서 같은 PK로 조회한 엔티티는 항상 `==` 비교가 참이다. 이는 단순 최적화를 넘어, JPA가 "같은 트랜잭션 안에서는 하나의 엔티티는 하나의 객체로만 존재한다"는 **반복 가능한 읽기(REPEATABLE READ)에 준하는 수준의 일관성**을 애플리케이션 레벨에서 보장해주는 것이기도 하다.

### 변경 감지(Dirty Checking)

1차 캐시는 엔티티를 저장할 때 최초 상태의 **스냅샷**도 함께 보관한다.

```java
Member member = em.find(Member.class, 1L);  // 조회 시점 스냅샷 저장
member.setName("박영희");                     // em.update() 같은 메서드 호출 없이 필드만 변경

em.getTransaction().commit();  // 커밋 시 flush 발생
// flush 시점에 스냅샷과 현재 엔티티를 비교 → name 필드가 다름을 감지 → UPDATE 쿼리 자동 생성
```

JPA에 `save()`나 `update()` 메서드가 따로 없어도 변경 사항이 반영되는 이유가 이것이다. 트랜잭션 커밋(또는 명시적 `flush()`) 시점에 영속성 컨텍스트는 관리 중인 모든 엔티티를 **스냅샷과 비교**해서, 달라진 필드가 있는 엔티티마다 UPDATE 쿼리를 만들어 쓰기 지연 저장소에 등록한다.

**변경 감지는 영속 상태의 엔티티에만 적용된다** — 준영속 상태의 엔티티를 변경해도 스냅샷과 비교할 영속성 컨텍스트 자체가 없으므로 아무 일도 일어나지 않는다. 준영속 엔티티를 다시 반영하려면 `merge()`로 새로운 영속 엔티티를 받아와야 한다.

### 쓰기 지연(Write-Behind) SQL 저장소

```java
em.persist(memberA);  // INSERT 쿼리를 만들어 쓰기 지연 저장소에 쌓아둠 — 아직 전송 안 함
em.persist(memberB);  // 마찬가지로 쌓아둠

// 여기서 DB를 직접 조회하면 memberA, memberB가 안 보일 수 있다

em.getTransaction().commit();  // flush 발생 — 쌓인 쿼리들이 이 시점에 한꺼번에 DB로 전송됨
```

`persist()`를 호출한다고 즉시 INSERT 쿼리가 나가는 게 아니라, 영속성 컨텍스트 내부의 **쓰기 지연 SQL 저장소**에 생성된 쿼리를 모아두었다가 **flush 시점에 한 번에 전송**한다. 이 덕분에 JDBC 배치(batch) 기능과 묶어서 여러 INSERT를 한 번의 네트워크 왕복으로 처리하는 최적화도 가능해진다.

---

## Flush — 언제 쿼리가 실제로 나가는가

**Flush**는 영속성 컨텍스트의 변경 내용(쓰기 지연 저장소에 쌓인 쿼리들)을 실제로 DB에 동기화하는 과정이다. **flush는 영속성 컨텍스트를 비우는 것이 아니다** — 1차 캐시는 그대로 유지된 채 SQL만 DB로 전송된다는 점이 자주 헷갈리는 부분이다.

Flush가 일어나는 시점 세 가지:

| 시점 | 설명 |
|---|---|
| 트랜잭션 커밋 직전 | 커밋하려면 먼저 변경 사항이 DB에 반영돼 있어야 하므로 커밋 전에 자동으로 flush |
| JPQL 쿼리 실행 직전 | `em.createQuery(...)`로 조회할 때, 아직 DB에 반영 안 된 변경 사항이 있으면 조회 결과가 어긋날 수 있어 JPA가 먼저 flush한다(단, PK로 직접 조회하는 `find()`는 1차 캐시를 먼저 보므로 flush를 유발하지 않는다) |
| `em.flush()` 명시적 호출 | 개발자가 직접 강제로 동기화 |

```java
Member member = new Member("김철수");
em.persist(member);

// JPQL로 전체 조회 — 아직 DB에 반영 안 된 member가 결과에 빠지면 안 되므로 flush가 먼저 일어남
List<Member> members = em.createQuery("select m from Member m", Member.class).getResultList();
```

---

## 영속성 컨텍스트의 생존 범위와 OSIV

스프링 환경에서는 보통 **트랜잭션의 범위 = 영속성 컨텍스트의 생존 범위**다. `@Transactional` 메서드가 시작될 때 영속성 컨텍스트가 열리고, 메서드가 끝나면(커밋/롤백) 영속성 컨텍스트도 함께 종료된다.

**OSIV(Open Session In View)** 는 이 범위를 트랜잭션 밖(뷰 렌더링 시점, 즉 컨트롤러~템플릿 엔진까지)으로 늘려주는 옵션이다(`spring.jpa.open-in-view`, 스프링 부트 기본값 `true`). 켜져 있으면 트랜잭션이 끝난 뒤에도 지연 로딩(LAZY)이 살아 있는 영속성 컨텍스트를 통해 동작할 수 있지만, 그만큼 DB 커넥션을 요청이 끝날 때까지 길게 붙들고 있게 되어 커넥션 풀 고갈 위험이 커진다. 그래서 트래픽이 많은 서비스에서는 `false`로 끄고 필요한 데이터를 트랜잭션 안에서 미리 다 가져오는(Fetch Join 등) 방식을 권장한다. 연관 엔티티 로딩 전략과 N+1 문제는 [JPA N+1 문제: 발생 원인과 해결 방안](/dev/jpa-n-plus-1-problem)에서 다뤘다.

---

## 1차 캐시 vs 2차 캐시

| | 1차 캐시 | 2차 캐시 |
|---|---|---|
| 범위 | 영속성 컨텍스트(사실상 트랜잭션) 단위 | 애플리케이션(`EntityManagerFactory`) 전역 |
| 기본 제공 여부 | JPA 표준 스펙에 포함, 기본 활성화 | 구현체(Hibernate)별 별도 설정 필요 |
| 공유 범위 | 공유 안 됨 — 트랜잭션이 끝나면 사라짐 | 여러 트랜잭션·여러 사용자가 공유 |
| 주 목적 | 동일성 보장, 변경 감지, 쿼리 생략 | 반복 조회가 많은 데이터의 DB 부하 감소 |

1차 캐시는 "같은 트랜잭션 안에서 같은 엔티티를 여러 번 조회해도 일관성을 유지한다"는 정합성 목적이 더 크고, 2차 캐시는 순수하게 DB 접근을 줄이기 위한 성능 최적화에 가깝다. 2차 캐시는 여러 트랜잭션이 공유하는 만큼 캐시 무효화(stale data) 문제를 신경 써야 해서, 자주 바뀌지 않는 참조성 데이터에 주로 적용한다.

---

## Reference

- [Jakarta Persistence Specification — Entity Manager](https://jakarta.ee/specifications/persistence/3.1/jakarta-persistence-spec-3.1.html)
- [Hibernate ORM Documentation — Persistence Context](https://docs.jboss.org/hibernate/orm/6.4/userguide/html_single/Hibernate_User_Guide.html#pc)
- [Spring Data JPA Documentation](https://docs.spring.io/spring-data/jpa/reference/)
- [Spring Boot Documentation — Open EntityManager in View](https://docs.spring.io/spring-boot/reference/data/sql.html#data.sql.jpa-and-spring-data)
- [JPA N+1 문제: 발생 원인과 해결 방안](/dev/jpa-n-plus-1-problem)
