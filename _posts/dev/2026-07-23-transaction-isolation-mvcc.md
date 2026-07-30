---
title: "트랜잭션 격리 수준과 MVCC 정리"
date: 2026-07-23
last_modified_at: 2026-07-30
categories: [dev, database]
tags: [study note, computer science, database, transaction, isolation, mvcc, lock, sql]
toc: true
comments: true
---

## Summary

- 격리 수준은 **정합성과 동시성의 트레이드오프**다 — 낮을수록 이상현상(Dirty/Non-repeatable/Phantom Read)이 잘 생기고, 높을수록 정합성은 강해지지만 동시 처리량은 떨어진다
- MVCC는 읽기에 락을 걸지 않고도 일관된 스냅샷을 제공하는 기법이다 — 이를 위해서는 각 트랜잭션이 "어떤 버전이 나에게 유효한가"를 스스로 판단할 근거(InnoDB의 **ReadView**, PostgreSQL의 **xmin/xmax**)와, 더 이상 필요 없는 옛 버전을 정리할 방법이 함께 있어야 한다
- READ COMMITTED와 REPEATABLE READ는 같은 MVCC를 쓰지만 **스냅샷을 뜨는 시점**이 다르다 — 문장마다 새로 뜨는지, 트랜잭션 시작 시점에 한 번 고정하는지의 차이가 곧 Non-repeatable Read 발생 여부다
- InnoDB의 REPEATABLE READ는 **Next-Key Lock**(레코드 락 + 갭 락)으로 Phantom Read를 상당 부분 막지만, 이는 일반 조회가 아니라 `FOR UPDATE`/`UPDATE`처럼 최신 상태를 잠그는 **Locking Read**에서만 작동한다 — "조회한 것"과 "실제로 잠그는 대상"이 다를 수 있다
- 두 트랜잭션이 서로 다른 행만 건드려도 그 행들 사이의 **비즈니스 규칙**이 깨지는 Write Skew는 REPEATABLE READ의 락으로는 못 막고 SERIALIZABLE이 필요하다

---

## 트랜잭션 격리성과 격리 수준

ACID 중 격리성(Isolation)은 "동시에 실행되는 트랜잭션들이 서로 영향을 주지 않아야 한다"는 목표만 제시할 뿐, 그 정도를 얼마나 엄격하게 지킬지는 구현체마다 다르다. 이 강도를 단계별로 정의해둔 것이 격리 수준(Isolation Level)이며, READ UNCOMMITTED → READ COMMITTED → REPEATABLE READ → SERIALIZABLE 순으로 강해진다.

완벽한 격리는 트랜잭션을 순차 실행하는 것과 같아서 동시성이 0에 수렴한다. 실무에서는 **어느 정도의 격리성을 포기하고 성능을 확보할지**를 선택해야 하고, 그 선택지가 격리 수준이다.

### 격리성 위반 시 발생하는 문제

#### Dirty Read

커밋되지 않은 데이터를 다른 트랜잭션이 읽는 현상이다.

| 시간 | 트랜잭션 A | 트랜잭션 B |
|:--:|---|---|
| T1 | `balance = 1000 → 2000` (미커밋) | |
| T2 | | `balance` 읽음 → **2000** |
| T3 | ROLLBACK | |
| T4 | | 2000을 기준으로 작업 진행 → **잘못된 데이터** |

A가 롤백했지만 B는 이미 존재하지 않는 값을 기준으로 동작했다.

#### Non-repeatable Read

같은 트랜잭션 내에서 같은 행을 두 번 읽었을 때 결과가 달라지는 현상이다.

| 시간 | 트랜잭션 A | 트랜잭션 B |
|:--:|---|---|
| T1 | `balance` 읽음 → **1000** | |
| T2 | | `balance = 2000` UPDATE + COMMIT |
| T3 | `balance` 다시 읽음 → **2000** | |

같은 트랜잭션 안에서 읽은 값이 달라졌다.

#### Phantom Read

같은 트랜잭션 내에서 같은 조건으로 조회했을 때 행의 **개수**가 달라지는 현상이다.

| 시간 | 트랜잭션 A | 트랜잭션 B |
|:--:|---|---|
| T1 | `age > 20` 조회 → **3건** | |
| T2 | | 새 행 INSERT + COMMIT |
| T3 | `age > 20` 다시 조회 → **4건** | |

Non-repeatable Read가 기존 행의 **값** 변경이라면, Phantom Read는 행의 **추가/삭제**로 인한 문제다.

---

## 트랜잭션 격리 수준 4단계

### READ UNCOMMITTED

커밋되지 않은 변경 사항도 읽을 수 있다.

- 세 가지 문제 모두 발생
- 사실상 격리성 없음
- 실무에서 거의 사용하지 않는다

### READ COMMITTED

커밋된 데이터만 읽는다. 대부분의 RDBMS 기본값이다(PostgreSQL, Oracle, SQL Server 등).

- Dirty Read 방지
- Non-repeatable Read, Phantom Read 발생 가능

### REPEATABLE READ

트랜잭션 시작 시점의 스냅샷을 기준으로 읽는다. MySQL InnoDB 기본값이다.

- Dirty Read, Non-repeatable Read 방지
- Phantom Read 발생 가능(단, MySQL InnoDB는 Next-Key Lock으로 대부분 방지)

### SERIALIZABLE

트랜잭션을 순차 실행한 것과 동일한 결과를 보장한다.

- 세 가지 문제 모두 방지
- 읽기에도 공유 잠금이 걸려 동시성이 크게 저하된다
- 데이터 정합성이 가장 중요한 경우에만 사용

### 격리 수준별 문제 발생 여부

| 격리 수준 | Dirty Read | Non-repeatable Read | Phantom Read |
|:--:|:--:|:--:|:--:|
| READ UNCOMMITTED | 발생 | 발생 | 발생 |
| READ COMMITTED | 방지 | 발생 | 발생 |
| REPEATABLE READ | 방지 | 방지 | 발생 |
| SERIALIZABLE | 방지 | 방지 | 방지 |

**왜 전부 SERIALIZABLE로 쓰지 않는가?** SERIALIZABLE은 읽기에도 잠금이 걸려 사실상 트랜잭션을 순차 실행하는 것과 비슷하게 동작하므로, 동시에 처리할 수 있는 트랜잭션 수가 크게 줄고 락 대기·데드락 가능성도 늘어난다. 대부분의 애플리케이션은 이상현상이 발생할 가능성이 낮거나 발생해도 감내할 수 있는 반면 처리량 저하는 즉시 체감되는 비용이라, 회계 정산처럼 정합성이 절대적으로 중요한 일부 트랜잭션에만 선택적으로 사용한다.

### DBMS별 기본 격리 수준

| DBMS | 기본 격리 수준 |
|---|---|
| MySQL (InnoDB) | REPEATABLE READ |
| PostgreSQL | READ COMMITTED |
| Oracle | READ COMMITTED |
| SQL Server | READ COMMITTED |

표준 SQL이 권장하는 기본값은 READ COMMITTED이고, 대부분의 RDBMS가 이를 따른다 — MySQL InnoDB의 REPEATABLE READ 기본값이 오히려 예외적인 편이다. 다만 이름이 같다고 동작까지 같은 건 아니다. PostgreSQL의 REPEATABLE READ는 트랜잭션 시작 시점의 스냅샷을 고정해서 읽는 것을 넘어, 쓰기 충돌까지 감지해 한쪽을 실패시키는 **스냅샷 격리(Snapshot Isolation)**로 구현되어 있어 MySQL InnoDB의 REPEATABLE READ보다 더 강한 보장을 제공한다.

---

## MVCC(Multi-Version Concurrency Control)

읽기 작업에 락을 걸지 않고도 일관된 스냅샷을 제공하는 기법이다. 각 행이 변경될 때마다 이전 버전을 **undo log**에 보관해두고, 트랜잭션은 자신의 스냅샷 기준 시점에 "그 시점에 유효했던 버전"을 읽는다.

**왜 필요한가?** 락 기반으로만 격리성을 구현하면 읽기와 쓰기가 서로를 블로킹해 동시성이 크게 떨어진다. MVCC는 **쓰기가 읽기를 막지 않고, 읽기가 쓰기를 막지 않도록** 해 락 경합 없이 일관성을 제공한다.

### READ COMMITTED와 REPEATABLE READ는 왜 다르게 동작하는가

둘 다 MVCC를 쓰지만 **스냅샷을 뜨는 시점**이 다르다.

- **READ COMMITTED**: 매 `SELECT` 문(statement)마다 그 시점 기준으로 새 스냅샷을 뜬다. 그래서 같은 트랜잭션 안에서도 두 번째 `SELECT`는 그 사이 커밋된 변경을 반영한 새 스냅샷을 보게 되어 Non-repeatable Read가 발생한다.
- **REPEATABLE READ**: 트랜잭션이 시작된 시점(정확히는 트랜잭션의 첫 조회 시점)에 스냅샷을 한 번 고정하고, 트랜잭션이 끝날 때까지 계속 같은 스냅샷을 읽는다. 그래서 트랜잭션 도중 다른 트랜잭션이 커밋해도 값이 바뀌어 보이지 않아 Non-repeatable Read가 방지된다.

즉 두 격리 수준의 차이는 "MVCC를 쓰는가"가 아니라 "스냅샷을 얼마나 자주 새로 뜨는가"의 문제다.

### 왜 "이전 버전을 보관한다"는 말만으로는 부족한가

MVCC의 정의를 "행이 바뀔 때마다 옛날 값을 어딘가에 보관해둔다"로만 이해하면 두 가지 질문이 바로 막힌다. 하나는 **판단**의 문제다 — 여러 버전이 쌓여 있을 때, 지금 이 트랜잭션에게 "보여야 할" 버전이 어느 것인지를 무엇을 기준으로 가릴 것인가. 다른 하나는 **정리**의 문제다 — 아무도 더 이상 참조하지 않는 옛날 버전을 언제, 누가 지울 것인가. 이 두 문제를 실제로 어떻게 푸는지는 InnoDB와 PostgreSQL이 서로 다른 답을 내놓는다.

### InnoDB — ReadView와 undo log 체인

InnoDB는 모든 행에 사용자에게는 보이지 않는 두 개의 숨겨진 컬럼을 함께 저장한다.

| 숨겨진 컬럼 | 의미 |
|---|---|
| `DB_TRX_ID` | 이 행 버전을 마지막으로 만든(INSERT/UPDATE) 트랜잭션의 ID |
| `DB_ROLL_PTR` | 이 행의 바로 이전 버전이 담긴 undo log 레코드를 가리키는 포인터 |

행이 갱신될 때마다 InnoDB는 기존 값을 그 자리에서 지우는 대신, 갱신 전 값을 undo log에 옮겨 적고 `DB_ROLL_PTR`로 그걸 가리키게 한다. 그래서 한 행의 여러 버전은 **최신 버전(테이블) → 이전 버전 → 그 이전 버전 …** 순으로 undo log를 따라가는 연결 리스트를 이룬다.

트랜잭션이 스냅샷을 뜨는 시점에는 **ReadView**라는 객체를 만든다. ReadView는 그 순간 "아직 커밋되지 않은(따라서 나에게 보이면 안 되는) 트랜잭션 ID 목록"과 자기 자신의 트랜잭션 ID를 들고 있다. 어떤 행을 읽을 때 InnoDB는 그 행의 `DB_TRX_ID`를 ReadView와 비교한다 — 그 트랜잭션이 스냅샷 시점 이전에 이미 커밋된 트랜잭션이면 그 버전을 그대로 보여주고, 아직 커밋 전(활성 상태)이거나 스냅샷 이후에 시작된 트랜잭션이면 "나에게는 안 보이는 버전"이라 판단해 `DB_ROLL_PTR`을 따라 undo log의 이전 버전으로 내려가 같은 판단을 반복한다.

- **READ COMMITTED**는 매 `SELECT`마다 ReadView를 새로 만든다.
- **REPEATABLE READ**는 트랜잭션의 첫 조회 시점에 ReadView를 한 번만 만들고 트랜잭션이 끝날 때까지 재사용한다.

앞서 "스냅샷을 뜨는 시점이 다르다"고 설명한 것은 결국 **ReadView를 언제 새로 만드느냐**의 문제였던 셈이다.

**왜 필요한가?** 락 없이 동시성을 얻으려면 각 트랜잭션이 "이 버전이 나에게 유효한가"를 스스로, 다른 트랜잭션과 조율하지 않고도 판단할 수 있어야 한다. ReadView(내 스냅샷 기준)와 undo log 체인(과거 버전으로 거슬러 갈 방법)이 합쳐져야 그 판단이 가능해진다 — 스냅샷 기준만 있고 과거 버전을 따라갈 방법이 없으면 애초에 "예전 값"을 읽을 수 없고, 과거 버전은 있어도 무엇이 내 스냅샷에 유효한지 판단할 기준이 없으면 아무 버전이나 골라 읽는 셈이 된다.

### PostgreSQL — xmin/xmax와 VACUUM

PostgreSQL은 InnoDB처럼 별도 undo 영역을 쓰지 않고, 버전 정보 자체를 테이블 안에 그대로 쌓는다. 모든 튜플(행 버전)은 두 개의 숨겨진 컬럼을 갖는다.

| 숨겨진 컬럼 | 의미 |
|---|---|
| `xmin` | 이 튜플을 만든(INSERT) 트랜잭션 ID |
| `xmax` | 이 튜플을 무효화한(UPDATE/DELETE) 트랜잭션 ID — 아직 무효화되지 않았으면 비어 있음 |

`UPDATE`는 기존 튜플을 고쳐 쓰지 않는다. 대신 ① 기존 튜플의 `xmax`에 현재 트랜잭션 ID를 채워 "이 버전은 여기까지 유효했다"고 표시하고, ② `xmin`이 현재 트랜잭션 ID인 새 튜플을 추가한다. 결국 한 행의 여러 버전이 물리적으로 같은 테이블 안에 나란히 쌓인다.

트랜잭션은 자신의 스냅샷(그 시점에 아직 커밋되지 않은 트랜잭션 ID 목록)을 기준으로, 어떤 튜플의 `xmin`이 커밋된 상태로 보이고 `xmax`가 비어 있거나 아직 나에게 보이지 않는 트랜잭션이 채운 값이면 그 튜플을 "현재 유효한 버전"으로 읽는다.

**VACUUM은 왜 필요한가?** UPDATE/DELETE가 반복될수록 더는 어떤 스냅샷에서도 보이지 않는 죽은 튜플(dead tuple)이 테이블 안에 계속 쌓인다 — InnoDB의 undo log는 별도 공간이라 필요 없어지면 그 공간만 비우면 되지만, PostgreSQL은 죽은 버전도 본 테이블·인덱스 공간을 그대로 차지하고 있기 때문에 청소하지 않으면 테이블이 무한정 커지고 인덱스 스캔 효율도 함께 떨어진다. `VACUUM`(보통 `autovacuum`으로 자동 실행)은 어떤 트랜잭션에서도 더는 참조할 수 없는 죽은 튜플을 찾아 실제로 제거해 공간을 회수하는 역할을 한다.

### 두 구현을 나란히 보면

| 항목 | InnoDB | PostgreSQL |
|---|---|---|
| 버전 판단 근거 | `DB_TRX_ID` + ReadView | `xmin`/`xmax` + 스냅샷 |
| 과거 버전 위치 | 별도 공간(undo log) | 같은 테이블 안(추가 튜플) |
| 정리 방식 | undo log는 필요 없어지면 자동 회수 | `VACUUM`이 별도로 청소해야 함 |
| 오래 열린 트랜잭션의 부작용 | 그 트랜잭션이 참조할 수도 있는 옛 버전을 undo log가 계속 붙들고 있어 undo log 비대화 | 그 트랜잭션 시작 이전의 dead tuple을 VACUUM이 청소하지 못해 테이블 비대화 |

구현 방식은 다르지만 "오래 켜둔 트랜잭션이 옛 버전을 계속 살려둬 자원을 잡아먹는다"는 실무적 함정은 두 DB가 공유한다.

---

## 잠금(Lock)

MVCC로 읽기 일관성은 해결되지만, 쓰기 충돌(두 트랜잭션이 같은 행을 동시에 수정)은 여전히 락으로 제어해야 한다.

### 공유 락과 배타 락

| 락 종류 | 설명 |
|---|---|
| 공유 락(Shared Lock, S) | 읽기 락. 다른 트랜잭션의 공유 락과는 공존 가능, 배타 락과는 불가 |
| 배타 락(Exclusive Lock, X) | 쓰기 락. 다른 어떤 락과도 공존 불가 |

`SELECT ... FOR UPDATE`는 조회한 행에 배타 락(X)을 걸어, 다른 트랜잭션이 그 행을 읽는 것(락을 요구하는 읽기)이나 쓰는 것을 모두 막는다 — 갱신을 전제로 한 조회에 쓴다. `SELECT ... FOR SHARE`(MySQL의 `LOCK IN SHARE MODE`)는 공유 락(S)을 걸어, 다른 트랜잭션의 읽기(공유 락)는 허용하되 쓰기(배타 락)는 막는다 — "이 값이 바뀌지 않는다는 걸 보장받고 싶지만 나도 바꿀 건 아니다"는 상황에 쓴다.

### InnoDB REPEATABLE READ의 Phantom Read 방지 — Gap Lock / Next-Key Lock

일반적인 REPEATABLE READ는 이론상 Phantom Read를 막지 못하지만, InnoDB는 **Next-Key Lock**(레코드 락 + 갭 락)으로 이를 상당 부분 방지한다. **갭 락(Gap Lock)**은 인덱스 레코드 "사이의 간격"에 거는 락으로, 그 범위에 새로운 행이 INSERT되는 것 자체를 막는다. 예를 들어 `WHERE age BETWEEN 20 AND 30 FOR UPDATE`를 실행하면, 기존 행뿐 아니라 그 범위 안의 "빈 공간"에도 락이 걸려 다른 트랜잭션이 `age = 25`인 새 행을 끼워 넣을 수 없다.

**심화 — Consistent Read와 Locking Read의 차이** 그렇다고 Phantom Read가 원천적으로 불가능해지는 것은 아니다. 일반 `SELECT`(Consistent Non-locking Read)는 트랜잭션의 첫 조회 시점에 고정한 스냅샷만 보므로 애초에 새 행이 눈에 보이지 않는다. 반면 `SELECT ... FOR UPDATE`, `UPDATE`, `DELETE`처럼 최신 커밋 데이터를 대상으로 하는 Locking(Current) Read는 스냅샷이 아니라 실행 시점의 최신 상태를 보고, 그 순간 Next-Key Lock으로 이후의 INSERT만 차단한다. 그래서 같은 트랜잭션 안에서 일반 `SELECT`로 3건을 확인한 뒤 곧바로 같은 조건으로 `UPDATE`를 실행하면, 그 사이 다른 트랜잭션이 커밋한 새 행까지 갱신 대상에 포함될 수 있다 — "조회한 것"과 "실제로 잠그거나 변경하는 대상"이 다를 수 있다는 InnoDB REPEATABLE READ의 실무적인 함정이다.

---

## Lost Update와 낙관적 락 / 비관적 락

**Lost Update(갱신 손실)**: 두 트랜잭션이 같은 행을 동시에 읽고, 각자 계산한 값으로 덮어쓰면 먼저 쓴 트랜잭션의 변경이 사라지는 현상이다.

| | 비관적 락(Pessimistic Lock) | 낙관적 락(Optimistic Lock) |
|---|---|---|
| 전제 | 충돌이 자주 일어날 것이라 가정 | 충돌이 드물 것이라 가정 |
| 구현 | `SELECT ... FOR UPDATE`로 배타 락을 걸어, 읽는 시점부터 다른 트랜잭션의 접근 자체를 막음 | 실제 락을 걸지 않고, 행에 `version` 컬럼을 두어 `UPDATE ... WHERE id = ? AND version = ?`처럼 갱신 시점에 버전이 그대로인지 확인 |
| 충돌 시 동작 | 락이 풀릴 때까지 다른 트랜잭션이 대기 | `UPDATE`의 영향 행 수가 0이면(버전 불일치) 애플리케이션이 충돌을 감지해 재시도하거나 예외 처리 |
| 트레이드오프 | 대기로 인한 처리량 저하, 데드락 위험 | 락 오버헤드는 없지만 충돌이 잦으면 재시도 비용이 커짐 |

**언제 무엇을 쓰는가?** 동시 수정이 잦고 반드시 순서를 보장해야 하는 경우(재고 차감, 좌석 예약)는 비관적 락이 안전하다. 조회는 많고 실제 충돌은 드문 경우(게시글 조회수, 프로필 수정)는 낙관적 락이 락 대기 없이 처리량을 높일 수 있다.

**낙관적 락에서 충돌이 나면 애플리케이션은 실제로 어떻게 처리하는가?** `UPDATE`의 영향 행 수가 0이면 충돌로 간주하고, 최신 데이터를 다시 조회해 재시도하거나(짧은 backoff와 재시도 횟수 제한을 둠), 사용자에게 "다른 곳에서 먼저 수정됨" 같은 예외를 반환한다.

---

## Deadlock(교착 상태)

두 트랜잭션이 서로 상대가 가진 락을 기다리며 영원히 블로킹되는 상황이다. 예를 들어 트랜잭션 A가 행 1의 락을 쥔 채 행 2를 기다리고, 트랜잭션 B가 행 2의 락을 쥔 채 행 1을 기다리면 둘 다 영원히 대기한다.

- **감지(Detection)**: RDBMS는 락 대기 그래프를 감시하다 순환(cycle)을 감지하면 그중 처리 비용이 더 적은 트랜잭션을 강제로 롤백시켜 해소한다.
- **예방(Prevention)**:
  - 여러 트랜잭션이 여러 행을 잠글 때 **항상 같은 순서**로 잠그도록 애플리케이션 로직을 통일하면(예: 항상 PK 오름차순으로 접근) 순환 대기 자체가 만들어지지 않는다.
  - `lock_wait_timeout` 같은 락 대기 타임아웃을 설정해, 일정 시간 이상 대기하면 감지를 기다리지 않고 스스로 실패 처리하도록 한다.
  - 트랜잭션을 짧게 유지하고 락을 거는 범위를 최소화하면 충돌 가능성 자체가 줄어든다.

---

## Read Skew와 Write Skew

REPEATABLE READ의 스냅샷·락만으로는 완전히 막을 수 없는, 여러 행에 걸친 이상현상이다.

**Read Skew**: 한 트랜잭션이 서로 논리적으로 연관된 여러 행을 각각 다른 시점의 스냅샷으로 읽어 앞뒤가 안 맞는 결과를 보게 되는 현상이다. 예를 들어 계좌 A → B 이체가 진행되는 중간에 두 계좌의 잔액을 각각 따로 조회하면, A는 이체 전 값을 B는 이체 후 값을 읽어 총합이 안 맞아 보일 수 있다.

**Write Skew**: 두 트랜잭션이 서로 다른 행을 각자 읽고 각자 쓰는데, 그 두 행 사이의 비즈니스 규칙이 두 트랜잭션이 동시에 커밋되면서 깨지는 현상이다. 예를 들어 "당직 의사가 최소 1명 있어야 한다"는 규칙이 있을 때, 의사 A와 B가 동시에 각자 "지금 당직이 2명이니 내가 빠져도 되겠다"고 확인한 뒤 각자 자신의 당직을 취소하면, 두 트랜잭션 모두 개별적으로는 규칙을 어기지 않았지만 결과적으로 당직 인원이 0명이 된다.

**왜 REPEATABLE READ로는 못 막는가?** 두 트랜잭션이 겹치는 행이 아예 없기 때문이다(A는 자기 행만, B는 자기 행만 쓴다). 락은 "같은 행에 대한 경합"을 전제로 동작하는데, Write Skew는 서로 다른 행에 대한 각자의 쓰기가 논리적으로만 얽혀 있어 일반적인 행 단위 락으로는 감지되지 않는다. 이를 막으려면 두 트랜잭션의 읽기-쓰기 관계까지 감지해 충돌을 판정하는 **SERIALIZABLE**(또는 PostgreSQL의 SSI, Serializable Snapshot Isolation)이 필요하다.

---

## JPA / Spring에서 격리 수준 지정

JPA 표준 자체에는 격리 수준을 지정하는 API가 없다. 별도로 설정하지 않으면 커넥션 풀이 맺은 JDBC 커넥션의 기본 격리 수준, 즉 DB 서버의 기본값을 그대로 따른다. Spring을 함께 쓰는 경우 `@Transactional(isolation = Isolation.READ_COMMITTED)`처럼 트랜잭션 시작 전에 `Connection.setTransactionIsolation()`을 호출해 그 트랜잭션에 한해 격리 수준을 재정의할 수 있다.

**주의할 점** 커넥션 풀은 커넥션을 재사용하므로, 트랜잭션이 끝나면 원래 격리 수준으로 복원해야 다음 요청이 의도치 않은 격리 수준으로 실행되는 걸 막을 수 있다(대부분의 트랜잭션 매니저가 이를 자동으로 처리한다). 또한 일부 DBMS·드라이버는 트랜잭션 도중 격리 수준 변경을 허용하지 않거나 이미 시작된 트랜잭션에는 적용하지 않으므로, 반드시 트랜잭션 시작 전에 설정해야 한다.

---

## MySQL과 PostgreSQL, REPEATABLE READ의 강도가 다르다

MVCC 저장 방식(undo log vs 튜플 버전 체인)의 차이는 앞서 다뤘지만, 그 위에 얹힌 격리 수준의 **의미**도 다르다.

| 항목 | MySQL (InnoDB) | PostgreSQL |
|---|---|---|
| 기본 격리 수준 | REPEATABLE READ | READ COMMITTED |
| REPEATABLE READ 강도 | 스냅샷 고정 + Next-Key Lock으로 Phantom Read 대부분 방지 | 스냅샷 격리(Snapshot Isolation) — 쓰기 충돌까지 감지해 한쪽을 실패시킴 |

이름은 같은 REPEATABLE READ지만, InnoDB는 "고정된 스냅샷을 읽는다"는 보장에 갭 락을 더해 Phantom Read를 실무적으로 막는 수준인 반면, PostgreSQL의 REPEATABLE READ는 두 트랜잭션이 겹치는 데이터를 동시에 쓰려고 하면 그 자체를 감지해 한쪽을 롤백시키는, SERIALIZABLE에 더 가까운 보장을 표준으로 제공한다.

---

## Reference

- [데이터베이스와 인덱스 정리](/dev/database-index)
- [트랜잭션 격리성과 격리 수준](/dev/transaction-isolation)
- [Transaction Isolation — PostgreSQL Docs](https://www.postgresql.org/docs/current/transaction-iso.html)
- [InnoDB Transaction Model — MySQL Docs](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-model.html)
- [InnoDB Locking — MySQL Docs](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html)
