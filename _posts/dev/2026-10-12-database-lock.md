---
title: "데이터베이스 락(Lock) 정리"
date: 2026-10-12
last_modified_at: 2026-10-12
categories: [dev, database]
tags: [study note, computer science, database, lock, concurrency, mysql, innodb, jpa]
toc: true
comments: true
---

## Summary

- 락은 동시에 같은 데이터를 바꾸려는 트랜잭션들을 **직렬화**해 정합성을 지키는 장치다 — MVCC가 "읽기 일관성"을 해결하고, 락은 "쓰기 충돌"을 해결한다
- InnoDB의 행 락은 행 자체가 아니라 **인덱스 레코드에 거는 락**이다 — 인덱스를 타지 못하는 `UPDATE`/`FOR UPDATE`는 스캔한 모든 행을 잠가 사실상 테이블 락처럼 동작한다
- 락의 범위는 Record Lock(레코드) → Gap Lock(간격) → Next-Key Lock(레코드 + 앞 간격)으로 넓어지고, 범위가 넓을수록 Phantom은 막지만 동시성은 떨어진다
- 낙관적 락은 "충돌이 드물 것"을 가정하고 **커밋 시점에 충돌을 감지**(버전 비교)하고, 비관적 락은 "충돌이 잦을 것"을 가정하고 **읽는 시점에 미리 잠근다** — 선택 기준은 충돌 빈도와 재시도 비용이다
- 데드락은 락을 쓰는 한 완전히 없앨 수 없다 — DB가 감지해 한쪽을 롤백하므로, 중요한 것은 **락 획득 순서 통일**과 **짧은 트랜잭션**으로 확률을 낮추고 재시도를 설계하는 것이다. 단, 락 대기 타임아웃(1205)은 기본적으로 문장만 롤백되어 데드락(1213, 트랜잭션 전체 롤백)과 처리 방식이 다르다
- 락 문제의 상당수는 락 자체가 아니라 **트랜잭션이 길어서** 생긴다 — 외부 API 호출이 트랜잭션 안에 있으면 락을 쥔 채 대기하게 된다

---

## 왜 락이 필요한가

[트랜잭션 격리 수준과 MVCC 정리](/dev/transaction-isolation-mvcc)에서 다뤘듯 MVCC는 읽기가 쓰기를 막지 않도록 해준다. 하지만 두 트랜잭션이 **같은 행을 동시에 수정**하는 쓰기 충돌은 MVCC만으로 해결되지 않는다.

```text
재고 = 10

T1: SELECT stock → 10         T2: SELECT stock → 10
T1: UPDATE stock = 10 - 1     T2: UPDATE stock = 10 - 1
T1: COMMIT                    T2: COMMIT
결과: 9 (기대값 8) — Lost Update
```

두 트랜잭션이 같은 값을 읽고 각자 계산해 덮어썼기 때문에 한쪽의 변경이 사라진다. 락은 "먼저 잡은 트랜잭션이 끝날 때까지 다른 트랜잭션이 기다리게" 해서 이 충돌을 순서대로 처리한다. 애플리케이션 메모리에서의 [경쟁 상태](/dev/race-condition)와 같은 문제를 DB 수준에서 푸는 것이다.

---

## 락의 종류

### 공유 락과 배타 락

| 락 | 용도 | 호환성 |
|---|---|---|
| 공유 락(Shared, S) | 읽기 | S와는 공존, X와는 충돌 |
| 배타 락(Exclusive, X) | 쓰기 | 어떤 락과도 충돌 |

```sql
SELECT * FROM product WHERE id = 1 FOR SHARE;   -- S 락 (LOCK IN SHARE MODE와 동일, 하위 호환용으로 남아 있음)
SELECT * FROM product WHERE id = 1 FOR UPDATE;  -- X 락
UPDATE product SET stock = stock - 1 WHERE id = 1;  -- 변경 행에 X 락 자동 획득
```

일반 `SELECT`는 MVCC 스냅샷을 읽을 뿐 락을 걸지 않는다(Non-locking read). `FOR SHARE`/`FOR UPDATE`처럼 락을 요구하는 읽기(Locking read)는 스냅샷이 아니라 **최신 데이터**(latest available data)를 읽는다는 점도 다르다.

### 락 단위(Granularity)

| 단위 | 특징 |
|---|---|
| 테이블 락 | 관리 비용이 작지만 동시성이 낮다 (MyISAM 기본) |
| 행(Row) 락 | 동시성이 높지만 락 관리 비용이 크다 (InnoDB 기본) |
| 메타데이터 락(MDL) | 스키마 변경(DDL)과 DML 사이를 보호 |

### 인텐션 락(Intention Lock)

행 락을 걸려면 "이 테이블에 이미 테이블 락이 걸려 있는가"를 알아야 한다. 모든 행을 뒤져 행 락이 있는지 확인하는 대신, 행 락을 걸 때 **테이블에 "이 안에서 행 락을 걸 예정"이라는 표시**(IS/IX)를 남긴다. 테이블 락을 요청하는 쪽은 이 표시만 보면 충돌 여부를 즉시 판단할 수 있다.

| | IS | IX | S | X |
|---|:---:|:---:|:---:|:---:|
| **IS** | O | O | O | X |
| **IX** | O | O | X | X |
| **S** | O | X | O | X |
| **X** | X | X | X | X |

인텐션 락끼리는 충돌하지 않는다 — 서로 다른 행을 잠그는 트랜잭션들이 같은 테이블에서 동시에 일할 수 있어야 하기 때문이다.

---

## InnoDB의 행 락

### 인덱스 레코드에 거는 락

InnoDB의 행 락은 **인덱스 레코드를 잠그는 것**이다. 공식 문서도 "Record locks always lock index records, even if a table is defined with no indexes"라고 설명하며, 인덱스가 없는 테이블이면 숨겨진 클러스터드 인덱스를 만들어 그것을 잠근다. 이 한 문장이 실무 락 문제의 상당 부분을 설명한다.

```sql
-- name에 인덱스가 없다면?
UPDATE member SET grade = 'VIP' WHERE name = 'kim';
```

조건에 쓸 인덱스가 없어 테이블 전체를 스캔해야 하면, 공식 문서 표현대로 "every row of the table becomes locked, which in turn blocks all inserts by other users to the table"이다. 결과는 사실상 테이블 락이고, 관련 없는 트랜잭션들이 줄줄이 대기한다. ([인덱스 정리](/dev/database-index)에서 다룬 "조건 컬럼에 인덱스가 있어야 한다"가 성능뿐 아니라 **락 범위**에도 직접 영향을 준다.)

> READ COMMITTED에서는 `UPDATE`/`DELETE`가 조건에 맞지 않는 행의 레코드 락을 WHERE 평가 직후 풀어주고, 갭 락도 외래 키·중복 키 검사에만 쓰므로 영향이 덜하다. REPEATABLE READ(MySQL 기본)에서는 스캔한 범위에 갭 락/넥스트 키 락이 걸린다.

### Record, Gap, Next-Key Lock

| 락 | 대상 | 막는 것 |
|---|---|---|
| Record Lock | 인덱스 레코드 하나 | 그 레코드의 변경 |
| Gap Lock | 레코드 **사이의 빈 구간** | 그 구간으로의 INSERT |
| Next-Key Lock | 레코드 + 그 **앞쪽 간격** | 레코드 변경 + 간격으로의 INSERT |

```text
인덱스 값:   10      20      30
            │ (gap) │ (gap) │ (gap)
Next-Key (20) = (10, 20] → 간격(10 초과) + 레코드 20
```

```sql
-- age 인덱스에 10, 20, 30이 있을 때 (REPEATABLE READ)
SELECT * FROM member WHERE age BETWEEN 15 AND 25 FOR UPDATE;
-- (10, 20], (20, 30] 구간에 Next-Key Lock
-- → age=12, 25 같은 새 행의 INSERT가 막힌다 (Phantom Read 방지)
```

**Gap Lock의 특징**
- Gap Lock끼리는 충돌하지 않는다 — 여러 트랜잭션이 같은 간격에 Gap Lock을 가질 수 있다. 오직 **INSERT(Insert Intention Lock)** 만 막는다.
- 유니크 인덱스로 **유일한 행 하나를 찾는 조건**이면 Gap Lock 없이 Record Lock만 건다. 단, 다중 컬럼 유니크 인덱스에서 **일부 컬럼만** 조건에 쓰면 Gap Lock이 걸린다.
- 범위 조건이나 비유니크 인덱스 조회는 스캔한 인덱스 범위에 Gap Lock 또는 Next-Key Lock이 걸린다.
- READ COMMITTED에서는 Gap Lock을 외래 키 제약·중복 키 검사에만 사용한다.

**왜 이게 중요한가?** Next-Key Lock이 Phantom Read를 막아주는 대신, 간격 락 때문에 서로 무관해 보이는 INSERT가 대기하거나 **데드락**이 생긴다. "존재 여부 확인 후 INSERT" 패턴이 이 때문에 데드락의 단골 원인이 된다.

---

## 낙관적 락 vs 비관적 락

락을 "DB 기능을 쓰느냐, 애플리케이션이 버전을 비교하느냐"로 나누는 관점이다.

### 비관적 락 (Pessimistic Lock)

충돌이 **자주 일어날 것**이라 가정하고, 읽는 시점에 미리 DB 락을 건다.

```java
public interface ProductRepository extends JpaRepository<Product, Long> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)       // SELECT ... FOR UPDATE
    @Query("select p from Product p where p.id = :id")
    Optional<Product> findByIdForUpdate(@Param("id") Long id);
}

@Transactional
public void decrease(Long id, int quantity) {
    Product p = repository.findByIdForUpdate(id).orElseThrow();
    p.decrease(quantity);  // 다른 트랜잭션은 커밋될 때까지 대기
}
```

### 낙관적 락 (Optimistic Lock)

충돌이 **드물 것**이라 가정하고, 락 없이 진행하다가 커밋 시점에 **버전 번호로 충돌을 감지**한다.

```java
@Entity
public class Product {
    @Id @GeneratedValue
    private Long id;
    private int stock;

    @Version            // 수정할 때마다 자동 증가
    private Long version;
}
```

```sql
UPDATE product
   SET stock = 9, version = 4
 WHERE id = 1 AND version = 3;   -- 영향받은 행이 0이면 다른 트랜잭션이 먼저 수정한 것
```

영향받은 행이 0이면 JPA는 `OptimisticLockException`(스프링에서는 `ObjectOptimisticLockingFailureException`)을 던진다. 이 예외를 잡아 **재시도하거나 사용자에게 알리는 것**은 애플리케이션 몫이다.

### 비교

| 구분 | 비관적 락 | 낙관적 락 |
|---|---|---|
| 가정 | 충돌이 잦다 | 충돌이 드물다 |
| 구현 | DB 락 (`FOR UPDATE`) | 버전 컬럼 (`@Version`) |
| 충돌 시 | **대기**한 뒤 순서대로 진행 | **실패**(예외) 후 재시도 |
| 장점 | 충돌 시 실패·재시도 없음 | 락을 잡지 않아 동시성 높음, 데드락 없음 |
| 단점 | 대기·데드락 가능, 락 점유 시간만큼 처리량 저하 | 충돌이 잦으면 재시도 폭증 |
| 적합한 경우 | 재고 차감, 포인트 등 **경합이 심한 핵심 데이터** | 게시글 수정 등 **충돌이 드문 일반 데이터** |

**선택 기준은 "충돌 빈도"와 "실패 시 재시도 비용"이다.** 낙관적 락은 재시도가 쉬울 때(멱등한 단순 수정) 유리하고, 외부 API 호출처럼 **되돌리기 어려운 작업**이 포함되면 비관적 락이 안전하다.

---

## 데드락(Deadlock)

둘 이상의 트랜잭션이 **서로가 가진 락을 기다리며** 영원히 진행하지 못하는 상태다.

```text
T1: UPDATE account SET ... WHERE id = 1;   -- id=1 X락 획득
T2: UPDATE account SET ... WHERE id = 2;   -- id=2 X락 획득
T1: UPDATE account SET ... WHERE id = 2;   -- T2를 기다림
T2: UPDATE account SET ... WHERE id = 1;   -- T1을 기다림  → 데드락
```

**발생 조건 (Coffman)**: 상호 배제, 점유 대기, 비선점, 순환 대기. 이 중 하나만 깨면 데드락은 생기지 않으며, 실무에서는 **순환 대기**를 깨는 방법을 가장 많이 쓴다.

**InnoDB의 처리**: 데드락 감지(`innodb_deadlock_detect`, 기본 활성)가 켜져 있으면 데드락을 자동으로 감지해 트랜잭션을 롤백한다. 희생자(victim)는 "작은 트랜잭션", 즉 삽입·수정·삭제한 행 수가 적은 쪽을 우선 고른다. 데드락으로 롤백되면 **트랜잭션 전체**가 롤백되고 에러 `1213`(`Deadlock found when trying to get lock; try restarting transaction`, SQLSTATE `40001`)을 받으므로 애플리케이션이 트랜잭션 전체를 재시도해야 한다.

**락 대기 타임아웃은 다르다**: 데드락이 아니라 단순히 오래 기다린 경우 `innodb_lock_wait_timeout`(기본 50초) 후 에러 `1205`(`Lock wait timeout exceeded; try restarting transaction`)로 실패한다. 이때 기본 설정에서는 **대기하던 문장만 롤백**되고 트랜잭션은 유지된다(`innodb_rollback_on_timeout`을 켜면 전체 롤백). 즉 애플리케이션이 이 예외를 잡고 트랜잭션을 계속 진행하면 이전 변경이 커밋될 수 있다. 또 InnoDB는 `LOCK TABLES`나 다른 스토리지 엔진이 관련된 데드락은 감지하지 못하므로 이 타임아웃이 안전장치 역할을 한다.

**예방**

| 방법 | 설명 |
|---|---|
| 락 획득 순서 통일 | 항상 id 오름차순으로 잠근다 (계좌 이체에서 `min(id)`부터) |
| 트랜잭션을 짧게 | 락을 쥐는 시간을 줄이고, 외부 호출은 트랜잭션 밖으로 |
| 인덱스 사용 | 스캔 범위가 줄어 불필요한 락이 줄어든다 |
| 낮은 격리 수준 | READ COMMITTED는 Gap Lock이 거의 없어 데드락이 줄어든다 |
| 재시도 로직 | 데드락 에러는 정상 상황으로 보고 재시도 설계 |

---

## 락 대기를 제어하는 방법

| 방법 | 동작 | 용도 |
|---|---|---|
| `FOR UPDATE NOWAIT` | 락을 못 잡으면 즉시 에러 | 대기 없이 빠르게 실패 |
| `FOR UPDATE SKIP LOCKED` | 잠긴 행은 건너뛰고 나머지만 조회 | 작업 큐에서 여러 워커가 각자 다른 행을 가져갈 때 |
| 락 타임아웃 | 지정 시간만 대기 후 실패 | 무한 대기 방지 |

```java
@QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
@Lock(LockModeType.PESSIMISTIC_WRITE)
Optional<Product> findById(Long id);   // 3초(ms 단위) 대기 후 실패
```

다만 이 타임아웃은 **힌트**다. Jakarta Persistence API 문서도 "Portable applications should not rely on the standard timeout hint. Depending on the database in use and the locking mechanisms used by the provider, the hint may or may not be observed"라고 명시한다. DB·JPA 구현체에 따라 무시될 수 있으니 실제 동작을 확인해야 한다.

`NOWAIT`/`SKIP LOCKED`는 MySQL 8.0.1+(InnoDB), PostgreSQL 9.5+에서 지원한다. 공식 문서는 `SKIP LOCKED`가 "inconsistent view of the data"를 반환하므로 일반적인 트랜잭션 작업에는 적합하지 않고, 큐 형태의 테이블을 여러 소비자가 처리할 때 락 경합을 피하는 용도로 쓰라고 안내한다.

---

## 실무에서 만나는 락 문제

**1. 긴 트랜잭션**

```java
@Transactional
public void order() {
    stockRepository.findByIdForUpdate(id);  // 락 획득
    paymentClient.pay();                    // 외부 API — 수 초 대기, 그동안 락 유지
}
```

락을 쥔 채 외부 호출을 기다리면 같은 행을 쓰는 모든 요청이 줄을 선다. 외부 호출은 트랜잭션 밖으로 빼고, 락 구간은 최소화한다.

**2. 메타데이터 락(MDL)**

MySQL은 트랜잭션 안에서 사용한 테이블에 메타데이터 락을 걸고 **트랜잭션이 끝날 때까지 해제하지 않는다**. 그래서 열려 있는 트랜잭션이 있는 테이블에 `ALTER TABLE`을 실행하면 DDL이 그 트랜잭션이 끝나기를 기다린다. 공식 문서에 따르면 쓰기 락 요청은 읽기 락 요청보다 우선순위가 높으므로, 대기 중인 DDL 뒤로 **이후 들어오는 일반 쿼리도 함께 대기**하게 되어 서비스 전체가 멈출 수 있다. DDL 전에 장시간 트랜잭션이 없는지 확인해야 한다.

**3. 분산 환경에서의 락**

애플리케이션 서버가 여러 대일 때 `synchronized`/`ReentrantLock`은 서버 간 효과가 없다. DB 락 외에 다음 방법을 쓴다.

| 방법 | 설명 |
|---|---|
| MySQL Named Lock | `GET_LOCK('key', timeout)` — 행이 아닌 임의의 문자열에 대한 락 |
| PostgreSQL Advisory Lock | `pg_advisory_lock(key)` |
| Redis 분산 락 | Redisson 등 — DB 부하를 피할 때 |

Named Lock/Advisory Lock은 락 대상이 되는 **행이 아직 없는 경우**(중복 생성 방지)에도 쓸 수 있다는 장점이 있다.

---

## MySQL(InnoDB)과 PostgreSQL의 차이

| 구분 | InnoDB | PostgreSQL |
|---|---|---|
| 행 락 | 인덱스 레코드 락 | 행 자체에 락을 표시 (메모리에 보관하지 않아 락 개수 제한이 없지만, `SELECT FOR UPDATE`도 디스크 쓰기를 유발) |
| Gap/Next-Key Lock | 있음 (REPEATABLE READ) | 없음 — Serializable은 비차단 predicate lock으로 이상현상을 감지 |
| 락 모드 | S, X | `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE`, `FOR KEY SHARE` |
| 읽기 | 락 없이 스냅샷 | 동일 |

PostgreSQL의 REPEATABLE READ는 스냅샷 기반이라 Phantom Read를 허용하지 않으면서도 간격 락으로 인한 INSERT 대기가 없다. 대신 Write Skew 같은 이상현상은 SERIALIZABLE에서 predicate lock으로 감지해 **직렬화 실패(SQLSTATE `40001`)** 로 처리한다. 공식 문서는 이 predicate lock이 "do not cause any blocking and therefore can not play any part in causing a deadlock"이라고 설명하며, 직렬화 실패는 애플리케이션이 **재시도**해야 한다.

---

## 정리 — 어떤 락을 선택할까

```text
충돌이 드문가?
├─ 예 → 낙관적 락 (@Version) + 재시도
└─ 아니오 → 비관적 락 (FOR UPDATE)
            ├─ 대기하면 안 된다 → NOWAIT / 타임아웃
            ├─ 큐처럼 나눠 가져간다 → SKIP LOCKED
            └─ 서버가 여러 대 + 대상 행이 없다 → Named/Advisory Lock, 분산 락
```

- 락을 걸기 전에 **조건 컬럼에 인덱스가 있는지**부터 확인한다
- 락 범위는 **좁게**, 보유 시간은 **짧게** 가져간다
- 데드락은 에러가 아니라 **재시도할 정상 상황**으로 설계한다

---

## Reference

- [MySQL 8.0 Reference Manual — InnoDB Locking](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html)
- [MySQL 8.0 Reference Manual — Deadlocks in InnoDB](https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlocks.html)
- [MySQL 8.0 Reference Manual — Locking Reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html)
- [PostgreSQL Documentation — Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Jakarta Persistence 3.1 — LockModeType](https://jakarta.ee/specifications/persistence/3.1/apidocs/jakarta.persistence/jakarta/persistence/LockModeType.html)
- [MySQL 8.0 Reference Manual — InnoDB Error Handling](https://dev.mysql.com/doc/refman/8.0/en/innodb-error-handling.html)
- [MySQL 8.0 Reference Manual — Metadata Locking](https://dev.mysql.com/doc/refman/8.0/en/metadata-locking.html)
- [PostgreSQL Documentation — Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL Documentation — SELECT (The Locking Clause)](https://www.postgresql.org/docs/current/sql-select.html)
- [트랜잭션 격리 수준과 MVCC 정리](/dev/transaction-isolation-mvcc)
