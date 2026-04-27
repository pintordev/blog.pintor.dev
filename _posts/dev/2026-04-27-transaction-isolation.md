---
title: "트랜잭션 격리성과 격리 수준"
date: 2026-04-27
last_modified_at: 2026-04-27
categories: [dev, database]
tags: [transaction, isolation, acid, dirty-read, non-repeatable-read, phantom-read, database, sql]
toc: true
comments: true
---

## Summary

- 격리성이 보장되지 않으면 **Dirty Read**, **Non-repeatable Read**, **Phantom Read** 세 가지 문제가 발생한다.
- 트랜잭션 격리 수준은 낮은 순으로 `READ UNCOMMITTED` → `READ COMMITTED` → `REPEATABLE READ` → `SERIALIZABLE`이다.
- 격리 수준이 높을수록 정합성은 높아지지만 **동시성(성능)은 낮아진다.**

---

## Background

ACID에서 격리성(Isolation)은 동시에 실행되는 트랜잭션들이 서로 영향을 주지 않아야 한다는 속성이다.

완벽한 격리는 트랜잭션을 순차 실행하는 것과 같아서, 동시성이 0에 수렴한다. 실제로는 **어느 정도의 격리성을 포기하고 성능을 확보**할지 트레이드오프를 선택해야 한다.

이 선택지가 바로 트랜잭션 격리 수준(Isolation Level)이다.

---

## 격리성 위반 시 발생하는 문제

### Dirty Read

커밋되지 않은 데이터를 다른 트랜잭션이 읽는 현상이다.

| 시간 | 트랜잭션 A | 트랜잭션 B |
|:--:|---|---|
| T1 | `balance = 1000 → 2000` (미커밋) | |
| T2 | | `balance` 읽음 → **2000** |
| T3 | ROLLBACK | |
| T4 | | 2000을 기준으로 작업 진행 → **잘못된 데이터** |

A가 롤백했지만 B는 이미 존재하지 않는 값을 기준으로 동작했다.

### Non-repeatable Read

같은 트랜잭션 내에서 같은 행을 두 번 읽었을 때 결과가 달라지는 현상이다.

| 시간 | 트랜잭션 A | 트랜잭션 B |
|:--:|---|---|
| T1 | `balance` 읽음 → **1000** | |
| T2 | | `balance = 2000` UPDATE + COMMIT |
| T3 | `balance` 다시 읽음 → **2000** | |

같은 트랜잭션 안에서 읽은 값이 달라졌다.

### Phantom Read

같은 트랜잭션 내에서 같은 조건으로 조회했을 때 행의 **개수**가 달라지는 현상이다.

| 시간 | 트랜잭션 A | 트랜잭션 B |
|:--:|---|---|
| T1 | `age > 20` 조회 → **3건** | |
| T2 | | 새 행 INSERT + COMMIT |
| T3 | `age > 20` 다시 조회 → **4건** | |

Non-repeatable Read가 기존 행의 **값** 변경이라면, Phantom Read는 행의 **추가/삭제**로 인한 문제다.

---

## 트랜잭션 격리 수준

### READ UNCOMMITTED

커밋되지 않은 변경 사항도 읽을 수 있다.

- 세 가지 문제 모두 발생
- 사실상 격리성 없음
- 실무에서 거의 사용하지 않는다

### READ COMMITTED

커밋된 데이터만 읽는다. 대부분의 RDBMS 기본값이다. (PostgreSQL, Oracle 등)

- Dirty Read 방지
- Non-repeatable Read, Phantom Read 발생 가능

### REPEATABLE READ

트랜잭션 시작 시점의 스냅샷을 기준으로 읽는다. MySQL InnoDB 기본값이다.

- Dirty Read, Non-repeatable Read 방지
- Phantom Read 발생 가능 (단, MySQL InnoDB는 MVCC로 Phantom Read도 대부분 방지)

### SERIALIZABLE

트랜잭션을 순차 실행한 것과 동일한 결과를 보장한다.

- 세 가지 문제 모두 방지
- 읽기에도 공유 잠금이 걸려 동시성이 크게 저하된다
- 데이터 정합성이 가장 중요한 경우에만 사용

---

## 격리 수준별 문제 발생 여부

| 격리 수준 | Dirty Read | Non-repeatable Read | Phantom Read |
|:--:|:--:|:--:|:--:|
| READ UNCOMMITTED | 발생 | 발생 | 발생 |
| READ COMMITTED | 방지 | 발생 | 발생 |
| REPEATABLE READ | 방지 | 방지 | 발생 |
| SERIALIZABLE | 방지 | 방지 | 방지 |

---

## Key Point

> **격리 수준은 정합성과 동시성의 트레이드오프다. 대부분의 서비스는 READ COMMITTED 또는 REPEATABLE READ에서 적절한 잠금 전략을 함께 사용한다.**

---

## Reference

- [Transaction Isolation — PostgreSQL Docs](https://www.postgresql.org/docs/current/transaction-iso.html)
- [InnoDB Transaction Model — MySQL Docs](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-model.html)
- [SQL-92 Isolation Levels — Wikipedia](https://en.wikipedia.org/wiki/Isolation_(database_systems))