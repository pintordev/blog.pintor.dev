---
title: 역정규화 (Denormalization)
date: 2026-04-06
last_modified_at: 2026-04-06
categories: [dev, sql]
tags: [sql, database, denormalization, normalization, performance, trade-off, rdbms]
toc: true
comments: true
---

## Summary

- **역정규화**란 정규화된 테이블을 의도적으로 합치거나 중복 데이터를 추가하는 것이다.
- 목적은 **조회 성능 향상** — 조인 비용을 줄이기 위한 트레이드오프.
- 데이터 일관성 유지 비용이 늘어나므로, **꼭 필요한 상황에만** 적용해야 한다.

---

## Context

데이터베이스 설계에서 정규화는 기본이다. 중복을 제거하고 테이블을 분리함으로써 데이터 일관성을 보장한다.

그런데 서비스 규모가 커지면 문제가 생기기 시작한다.

- 주문 목록 하나를 보여주는데 `orders`, `users`, `products`, `categories` 테이블을 죄다 조인해야 하거나
- 통계 집계 쿼리가 수백만 건의 행을 매번 스캔하거나

이런 경우, 정규화를 일부 포기하고 **읽기 성능을 선택하는 것**이 역정규화다.

정규화가 정답이고 역정규화가 편법인 게 아니라, 둘 다 **상황에 맞는 설계 도구**다.

---

## 역정규화가 필요한 상황

### 조인이 과도하게 많을 때

정규화가 잘 된 스키마일수록 조인이 많아진다. 조인은 비용이 크고, 인덱스만으로 커버되지 않는 경우 성능이 급격히 떨어진다.

```sql
-- 정규화된 구조에서 주문 목록 조회
SELECT o.id, u.name, p.title, c.name
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
JOIN categories c ON p.category_id = c.id;
```

조회가 빈번하고 테이블이 크다면, 역정규화로 조인을 줄이는 게 실용적이다.

### 집계 결과를 매번 계산할 때

댓글 수, 좋아요 수, 평균 평점처럼 자주 조회되는 집계값을 매번 `COUNT`, `AVG`로 계산하면 부담이 크다.

```sql
-- 매번 계산하는 방식
SELECT p.id, COUNT(c.id) AS comment_count
FROM posts p
LEFT JOIN comments c ON p.id = c.post_id
GROUP BY p.id;
```

```sql
-- 역정규화: posts 테이블에 comment_count 컬럼 추가
SELECT id, comment_count FROM posts;
```

### 읽기 비율이 압도적으로 높을 때

읽기 : 쓰기 비율이 99:1에 가깝다면, 쓰기 시 중복 데이터를 관리하는 비용보다 읽기 성능 이득이 훨씬 크다.

---

## 역정규화 적용 시 고려 사항

### 데이터 일관성 관리

중복 데이터가 생기는 순간, **두 곳을 항상 동시에 업데이트** 해야 한다. 한쪽만 바뀌면 데이터가 불일치한다.

```sql
-- users 테이블에 order_count를 역정규화했다면
-- 주문 추가 시 두 테이블 모두 업데이트해야 함
INSERT INTO orders (user_id, ...) VALUES (1, ...);
UPDATE users SET order_count = order_count + 1 WHERE id = 1;
```

트랜잭션으로 묶거나, 트리거로 자동화하거나, 애플리케이션 레벨에서 보장해야 한다.

### 역정규화 범위

무분별하게 적용하면 스키마가 복잡해지고 유지보수가 어려워진다. 역정규화는 **병목이 확인된 부분**에만 적용한다. 추측이 아니라 측정을 기반으로 결정해야 한다.

### 쓰기 성능 저하

역정규화된 컬럼이 많을수록 `INSERT`, `UPDATE`, `DELETE` 시 갱신해야 할 데이터가 늘어난다. 쓰기 빈도가 높은 테이블에는 신중하게 적용해야 한다.

---

## 장단점

| 장점 | 단점 |
|------|------|
| 조인 감소로 읽기 성능 향상 | 데이터 중복으로 일관성 관리 비용 증가 |
| 집계 쿼리 단순화 | 쓰기 성능 저하 가능 |
| 애플리케이션 코드 단순화 | 스키마 복잡도 증가 |

---

## 주요 역정규화 기법

| 기법 | 설명 |
|------|------|
| 테이블 병합 | 자주 조인되는 두 테이블을 하나로 합침 |
| 컬럼 중복 | 자주 조회되는 컬럼을 다른 테이블에 복사 |
| 집계값 저장 | `COUNT`, `SUM`, `AVG` 결과를 컬럼으로 유지 |
| 파생 컬럼 추가 | 계산 결과를 미리 저장해두는 컬럼 추가 |

---

## One-line Rule

> **정규화로 설계하고, 측정 후 병목에만 역정규화를 적용한다.**

---

## Reference

- [Database Normalization — Wikipedia](https://en.wikipedia.org/wiki/Database_normalization)
- [Denormalization — Wikipedia](https://en.wikipedia.org/wiki/Denormalization)
- [When to Denormalize — Use The Index, Luke](https://use-the-index-luke.com/)