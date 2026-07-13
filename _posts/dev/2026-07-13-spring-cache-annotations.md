---
title: "@Cacheable, @CachePut, @CacheEvict 차이와 실무 사용 기준"
date: 2026-07-13
last_modified_at: 2026-07-13
categories: [dev, spring]
tags: [weekly paper, spring, spring-cache, cache, annotation, aop]
toc: true
comments: true
---

## Summary

- **`@Cacheable`**: 캐시에 값이 있으면 메서드를 실행하지 않고 캐시 값을 반환 — 조회(Read)에 사용.
- **`@CachePut`**: 캐시 조회 없이 항상 메서드를 실행하고, 그 결과로 캐시를 갱신 — 수정(Update)에 사용.
- **`@CacheEvict`**: 캐시에서 항목을 제거 — 삭제(Delete) 또는 갱신 후 무효화에 사용.

---

## Background

Spring Cache Abstraction은 AOP 프록시를 통해 메서드 호출을 가로채고, 메서드 시그니처와 파라미터로 만든 캐시 키를 기준으로 캐시 저장소(`ConcurrentMapCacheManager`, Redis, Caffeine 등)에 값을 읽고 쓰는 선언적 캐싱 기능이다. 개발자는 캐시 저장/조회 로직을 직접 작성하는 대신 애노테이션만 붙이면 된다.

```java
@EnableCaching
@Configuration
public class CacheConfig {
}
```

이 추상화의 핵심은 "메서드가 실행되기 전에 개입할 것인가, 항상 실행하되 결과만 반영할 것인가, 아니면 캐시를 지울 것인가"라는 세 가지 서로 다른 시점 제어에 있다. 이 차이를 혼동하면 캐시가 최신 데이터를 반영하지 못하는(stale data) 버그로 이어진다.

---

## @Cacheable — 조회 시 캐시 우선

캐시에 키가 존재하면 **메서드 본문을 실행하지 않고** 캐시된 값을 즉시 반환한다. 캐시에 없을 때만 메서드를 실행하고, 그 결과를 캐시에 저장한다.

```java
@Cacheable(value = "products", key = "#id")
public Product findById(Long id) {
    log.info("DB 조회 실행: {}", id); // 캐시 히트 시 이 로그가 출력되지 않음
    return productRepository.findById(id)
        .orElseThrow(() -> new ProductNotFoundException(id));
}
```

- **주 용도**: 조회 성능 최적화. 변경이 잦지 않은 데이터, 조회 비용이 큰 데이터에 적합.
- **주의점**: 수정 메서드에 `@Cacheable`을 붙이면, 캐시 히트 시 실제 수정 로직이 아예 실행되지 않아 데이터가 갱신되지 않는 심각한 버그가 된다.

`condition`과 `unless`로 캐싱 여부를 조건부로 제어할 수 있다.

```java
@Cacheable(value = "products", key = "#id", unless = "#result == null")
public Product findById(Long id) { ... }
```

- `condition`: 메서드 실행 **전** 평가, 캐싱 여부를 파라미터 기준으로 결정
- `unless`: 메서드 실행 **후** 평가, 반환값 기준으로 캐싱을 건너뛸지 결정

---

## @CachePut — 항상 실행, 결과로 캐시 갱신

캐시 조회를 건너뛰고 **항상 메서드를 실행**한다. 실행 결과를 캐시에 저장(갱신)한다는 점에서 `@Cacheable`과 결정적으로 다르다.

```java
@CachePut(value = "products", key = "#product.id")
public Product update(Product product) {
    return productRepository.save(product); // 항상 실행됨
}
```

- **주 용도**: 데이터 수정(Update) 후 캐시를 최신 상태로 동기화할 때.
- `@Cacheable`을 update 메서드에 쓰면 안 되는 이유가 바로 이것이다. update는 항상 실행되어야 하는데 `@Cacheable`은 캐시 히트 시 실행 자체를 건너뛰기 때문이다.

---

## @CacheEvict — 캐시 제거

캐시에서 지정한 키(또는 전체)를 제거한다.

```java
@CacheEvict(value = "products", key = "#id")
public void delete(Long id) {
    productRepository.deleteById(id);
}
```

주요 옵션:

| 옵션 | 설명 |
|---|---|
| `allEntries = true` | 캐시의 모든 항목을 한 번에 제거 (배치 삭제, 전체 초기화 시) |
| `beforeInvocation = true` | 메서드 실행 **전**에 캐시를 제거 (메서드에서 예외가 나도 캐시는 이미 지워짐) |
| `beforeInvocation = false` (기본값) | 메서드가 **정상 종료된 후** 캐시를 제거 |

```java
@CacheEvict(value = "products", allEntries = true)
public void clearAllProductCache() {
    // 전체 초기화 시 사용
}
```

`beforeInvocation`은 삭제 로직이 실패했을 때 캐시가 실제 DB 상태와 어긋나는 것을 막을지, 아니면 실패와 무관하게 캐시부터 무효화할지의 트레이드오프를 결정한다.

---

## 세 애노테이션 비교

| 구분 | 메서드 항상 실행 | 캐시 조회 | 캐시에 미치는 효과 | 전형적 사용처 |
|---|---|---|---|---|
| `@Cacheable` | X (히트 시 스킵) | O | 없으면 저장 | 조회(Read) |
| `@CachePut` | O | X | 항상 갱신 | 수정(Update) |
| `@CacheEvict` | O | X | 제거 | 삭제(Delete), 무효화 |

CRUD와 매칭하면 다음과 같다.

```
Create → @CachePut (생성된 엔티티를 캐시에 바로 반영하고 싶을 때) 또는 무캐시
Read   → @Cacheable
Update → @CachePut
Delete → @CacheEvict
```

---

## 실무에서 자주 발생하는 함정

### 1. Update 메서드에 @Cacheable을 사용

```java
// 잘못된 예
@Cacheable(value = "products", key = "#product.id")
public Product update(Product product) {
    return productRepository.save(product); // 캐시 히트 시 실행 안 됨!
}
```

캐시에 값이 있으면 `save()`가 호출되지 않아 DB가 갱신되지 않는다. 반드시 `@CachePut`을 사용해야 한다.

### 2. 키 생성 전략 불일치

`@Cacheable`과 `@CachePut`, `@CacheEvict`가 같은 캐시를 다룬다면 `key` SpEL 표현식이 세 애노테이션 모두 동일한 키를 생성하도록 일치시켜야 한다. 하나라도 다르면 캐시 갱신/삭제가 엉뚱한 키에 적용되어 오래된 데이터가 남는다.

### 3. 트랜잭션과 캐시 갱신 순서

캐시 갱신이 트랜잭션 커밋 전에 일어나면, 트랜잭션이 롤백될 경우 캐시에는 실제로 반영되지 않은 데이터가 남는다. `@Transactional`과 캐시 애노테이션을 함께 사용할 때는 이 순서를 반드시 점검해야 한다.

---

## Key Point

> **세 애노테이션을 구분하는 기준은 "메서드를 실행할 것인가"와 "캐시에 어떤 영향을 줄 것인가" 두 축이다. 조회는 실행을 생략할 수 있으니 @Cacheable, 수정은 항상 실행하고 결과를 반영해야 하니 @CachePut, 삭제는 캐시 자체를 지워야 하니 @CacheEvict다. 이 원칙을 헷갈리면 캐시가 낡은 데이터를 계속 반환하는 버그로 직결된다.**

---

## Reference

- [Spring Framework: Cache Abstraction](https://docs.spring.io/spring-framework/reference/integration/cache.html) — 공식 캐싱 추상화 문서
- [Spring Framework: Declarative Annotation-based Caching](https://docs.spring.io/spring-framework/reference/integration/cache/annotations.html) — 애노테이션별 상세 옵션
- [Spring Cache SpEL Context](https://docs.spring.io/spring-framework/reference/integration/cache/annotations.html#cache-spel-context) — key, condition, unless에 사용 가능한 SpEL 변수