---
title: "InnoDB, MySQL, PostgreSQL 정리"
date: 2026-08-20
last_modified_at: 2026-08-20
categories: [dev, database]
tags: [study note, database, mysql, postgresql, innodb]
toc: true
comments: true
---

## Summary

- InnoDB는 단순히 "MySQL의 기본 스토리지 엔진"이 아니라, 클러스터형 인덱스·버퍼 풀·undo/redo log가 맞물려 성능과 정합성을 함께 잡는 구체적인 설계 묶음이다
- MySQL과 PostgreSQL 중 무엇을 쓸지는 "뭐가 더 좋은가"가 아니라 서비스 특성·팀 숙련도·생태계 지원 같은 여러 축의 트레이드오프 질문이다
- 두 DB는 이름이 같은 격리 수준([참조](/dev/transaction-isolation-mvcc))도 내부 MVCC 구현이 달라 강도가 다르다 — 선택의 근거는 결국 이 차이를 얼마나 정확히 설명할 수 있는가로 갈린다
- "어느 DB가 더 나은가"보다 "이 상황에 어느 쪽이 더 맞는가"를 근거를 들어 설명할 수 있어야 한다

---

## InnoDB 정리

InnoDB는 MySQL의 기본 스토리지 엔진이다. "기본값이라 그냥 쓴다"고 넘기기엔, 실제로 여러 설계 선택이 성능과 정합성을 동시에 잡기 위해 맞물려 있다.

**클러스터형 인덱스**: PK를 기준으로 데이터 자체를 물리적으로 정렬해 저장한다. 세컨더리 인덱스는 실제 행이 아니라 PK 값을 가리키므로, 세컨더리 인덱스로 조회하면 PK를 먼저 찾고 그 PK로 다시 클러스터형 인덱스를 탐색하는 두 번의 탐색(bookmark lookup)이 일어난다. 자세한 내용은 [데이터베이스와 인덱스 정리](/dev/database-index)에서 다뤘다.

**버퍼 풀(Buffer Pool)**: 디스크의 데이터 페이지를 메모리에 캐싱해두는 영역이다. 대부분의 읽기/쓰기가 디스크가 아니라 버퍼 풀에서 이뤄지고, 변경 사항은 즉시 디스크에 반영되지 않고 일정 주기로 모아서 flush된다(checkpoint). 버퍼 풀 크기(`innodb_buffer_pool_size`)가 클수록 디스크 I/O가 줄어 성능이 좋아지지만, 이 값이 실제 데이터 크기보다 작으면 캐시 미스가 잦아져 성능이 급격히 나빠질 수 있다.

**MVCC — undo log와 ReadView**: 읽기에 락을 걸지 않고 일관된 스냅샷을 제공하는 InnoDB의 핵심 메커니즘이다. 각 행이 갱신될 때마다 이전 값을 undo log에 남기고, 트랜잭션은 자신의 ReadView 기준으로 어떤 버전이 유효한지 판단한다. 이 부분은 이미 [트랜잭션 격리 수준과 MVCC 정리](/dev/transaction-isolation-mvcc)에서 자세히 다뤘으므로 여기서는 반복하지 않는다.

**redo log와 지속성(Durability)**: 트랜잭션이 커밋되면, 실제 데이터 페이지에 반영하기 전에 그 변경 내역을 먼저 redo log에 기록한다(Write-Ahead Logging). 커밋 직후 서버가 죽어도, 재시작 시 redo log를 재생(replay)해 커밋된 변경을 복구할 수 있다. 반대로 원자성(Atomicity)은 undo log가 담당한다 — 롤백 시 undo log를 거꾸로 적용해 변경 이전 상태로 되돌린다.

**더블 라이트 버퍼(Doublewrite Buffer)**: 데이터 페이지(보통 16KB)를 디스크에 쓰는 도중 서버가 죽으면, 페이지 일부만 기록된 손상된 상태(partial page write)가 될 수 있다. InnoDB는 실제 위치에 쓰기 전에 이 더블 라이트 버퍼 영역에 페이지 전체를 먼저 써두고, 그다음 원래 위치에 쓴다. 쓰기 도중 장애가 나도 더블 라이트 버퍼의 온전한 사본으로 복구할 수 있다.

---

## MySQL과 PostgreSQL, 아키텍처로 비교하면

선택 기준을 이야기하기 전에, 두 DB가 실제로 무엇이 다른지부터 정확히 짚어야 한다. "하나는 오라클 거고 하나는 오픈소스"는 차이를 설명한 게 아니다 — 아래 항목들이 실제로 갈리는 지점이다.

| 항목 | MySQL (InnoDB) | PostgreSQL |
|---|---|---|
| 스토리지 엔진 구조 | pluggable — InnoDB가 사실상 표준, MyISAM 등으로 교체 가능 | 단일 고정 스토리지 엔진, 힙(heap) 테이블 구조 |
| 인덱스 구조 | PK 기준 클러스터형 인덱스(데이터가 PK 순으로 물리 정렬) | 클러스터형 인덱스 없음 — 모든 인덱스가 힙을 가리키는 논클러스터형 |
| MVCC 버전 저장 위치 | undo log(별도 공간) | 같은 테이블 안(튜플 버전을 그대로 추가) |
| 기본 격리 수준 | REPEATABLE READ | READ COMMITTED |
| REPEATABLE READ 강도 | 스냅샷 고정 + Next-Key Lock | 스냅샷 격리(Snapshot Isolation) — 쓰기 충돌까지 감지 |
| 복제 방식 | binlog 기반(statement/row/mixed) | WAL 기반 스트리밍 복제 + 논리적 복제(logical replication) |
| JSON 처리 | `JSON` 타입, 텍스트 기반 파싱 | `JSONB`(이진 저장) + `GIN` 인덱스로 필드 자체를 인덱싱 |
| SQL 표준 준수 | 상대적으로 느슨(과거 비표준 `GROUP BY` 허용 등) | 윈도우 함수, 재귀 CTE, `LATERAL JOIN` 등 표준 SQL을 폭넓게 지원 |
| 확장(Extension) | 스토리지 엔진 교체가 사실상 유일한 확장 경로 | `PostGIS`, `pg_trgm`, `TimescaleDB` 등 설치형 확장 생태계 |
| 라이선스 | GPL(오라클 소유, 상용 라이선스 별도 존재) | PostgreSQL 라이선스(MIT/BSD 계열, 매우 permissive) |

**MySQL(InnoDB)의 특성**

- **pluggable storage engine**: MySQL은 스토리지 엔진을 테이블 단위로 교체할 수 있는 구조다. InnoDB가 트랜잭션·MVCC·외래키를 지원하는 사실상의 표준이고, 과거 기본값이던 MyISAM은 트랜잭션을 지원하지 않는 대신 단순 읽기가 빨라 일부 레거시 시스템에 남아 있다.
- **binlog 기반 복제**: 커밋된 변경 사항을 binlog에 기록하고 복제본(replica)이 이를 받아 재생하는 방식이다. SQL 문 자체를 복제하는 **statement-based**, 실제로 바뀐 행 데이터를 복제하는 **row-based**, 상황에 따라 섞어 쓰는 **mixed**가 있다. `NOW()`, `RAND()`처럼 실행할 때마다 결과가 달라지는 함수가 있으면 statement-based는 소스와 복제본의 결과가 어긋날 수 있어, 최신 MySQL은 row-based를 기본값에 가깝게 쓰는 경우가 많다.
- **읽기 확장에 유리한 구조**: 클러스터형 인덱스라 PK 기반 조회가 특히 빠르고, read replica를 여러 대 두는 수평 확장 패턴이 오래전부터 널리 쓰여왔다. 웹 서비스의 "쓰기는 적고 읽기는 많다"는 전형적인 트래픽 패턴에 잘 맞는다.

**PostgreSQL의 특성**

- **힙 테이블 + 별도 인덱스**: 클러스터형 인덱스가 없으므로 모든 인덱스가 실제 데이터의 물리적 위치(TID, Tuple ID)를 가리키는 방식으로 동작한다. `CLUSTER` 명령으로 특정 인덱스 순서에 맞춰 테이블을 한 번 재정렬할 수는 있지만, InnoDB처럼 그 순서가 계속 유지되지는 않는다.
- **WAL 기반 복제 — 물리적/논리적**: 물리적 복제(streaming replication)는 디스크 블록 단위 변경 내역(WAL)을 그대로 복제본에 전달해 소스와 완전히 동일한 복제본을 만든다. 논리적 복제(logical replication)는 테이블 단위로 선택해 복제할 수 있어, 특정 테이블만 다른 시스템으로 옮기거나 버전이 다른 DB 간 마이그레이션에 활용하기 좋다.
- **JSONB와 GIN 인덱스**: `JSON`은 텍스트 그대로 저장해 조회할 때마다 파싱하지만, `JSONB`는 이진 형식으로 저장해 파싱 비용이 없고 `GIN` 인덱스를 걸면 JSON 안의 특정 키/값에도 인덱스를 태울 수 있다. 반정형 데이터를 관계형 DB 안에서 준수한 인덱스 성능으로 다뤄야 할 때 강점이다.
- **확장(Extension) 생태계**: `PostGIS`(공간 데이터/GIS), `pg_trgm`(문자열 유사도 검색), `TimescaleDB`(시계열 데이터)처럼 필요한 기능을 설치형 확장으로 붙일 수 있다. 특수한 워크로드가 있는 서비스라면 별도 시스템을 두지 않고도 PostgreSQL 하나로 처리 범위를 넓힐 수 있다.

---

## MySQL vs PostgreSQL, 무엇을 기준으로 선택하는가

"MySQL이 낫다 / PostgreSQL이 낫다"는 질문 자체가 성립하지 않는다. 위에서 짚은 아키텍처 차이를 바탕으로, 실무에서 실제로 갈리는 기준은 다음과 같다.

**서비스 특성** 단순 CRUD 위주의 트래픽이 많고 읽기 성능·복제(replication) 생태계가 중요하면 MySQL이 유리한 경우가 많다. 반대로 복잡한 리포팅/분석 쿼리, 윈도우 함수, CTE(재귀 쿼리 포함), `JSONB` 같은 반정형 데이터 처리가 잦다면 PostgreSQL의 쿼리 플래너와 SQL 표준 준수도가 유리하다.

**팀의 숙련도** 아무리 기술적으로 더 적합한 DB가 있어도, 팀이 그 DB의 운영 경험(백업/복구, 장애 대응, 튜닝 노하우)이 없으면 실제 장애 상황에서 그 이점을 살리지 못한다. 이미 팀이 익숙한 DB를 쓰는 것 자체가 운영 리스크를 낮추는 선택일 때가 많다.

**MVCC 구현 차이** [트랜잭션 격리 수준과 MVCC 정리](/dev/transaction-isolation-mvcc)에서 다뤘듯, InnoDB는 undo log에 이전 버전을 별도 보관하고 PostgreSQL은 같은 테이블 안에 튜플 버전을 그대로 쌓는다. 이 차이는 단순한 구현 디테일이 아니라, InnoDB는 오래 열린 트랜잭션이 undo log를 비대하게 만들고 PostgreSQL은 `VACUUM`이 dead tuple을 제때 청소하지 못하면 테이블이 비대해진다는, 서로 다른 운영 함정으로 이어진다. 두 DB의 기본 REPEATABLE READ도 강도가 다르다 — PostgreSQL 쪽이 스냅샷 격리(Snapshot Isolation)로 쓰기 충돌까지 감지해 더 강한 보장을 제공한다.

**생태계·지원 규모** MySQL은 오랫동안 웹 서비스의 기본값으로 쓰여온 만큼 매니지드 서비스(AWS Aurora/RDS, GCP Cloud SQL 등), ORM/드라이버, 운영 노하우 레퍼런스가 더 넓게 퍼져 있다. 문제가 생겼을 때 검색만으로 답을 찾을 확률이 높다는 것은 실무에서 무시할 수 없는 이점이다. PostgreSQL도 확장(extension) 생태계(`PostGIS`, `pg_trgm` 등)가 풍부하지만, 특정 기능에 국한된 경우가 많다.

**그래서 결론은** 어느 한쪽이 항상 옳은 답이 아니라, 위 네 가지 축을 기준으로 트레이드오프를 설명할 수 있어야 한다는 것이다. "그냥 익숙해서"가 아니라 "이런 이유로 이 축들을 저울질했다"고 말할 수 있으려면, 두 DB의 차이를 먼저 정확히 파악해두는 게 먼저다.

---

## Reference

- [데이터베이스와 인덱스 정리](/dev/database-index)
- [트랜잭션 격리 수준과 MVCC 정리](/dev/transaction-isolation-mvcc)
- [InnoDB Architecture — MySQL Docs](https://dev.mysql.com/doc/refman/8.0/en/innodb-architecture.html)
- [InnoDB Doublewrite Buffer — MySQL Docs](https://dev.mysql.com/doc/refman/8.0/en/innodb-doublewrite-buffer.html)
- [Replication — MySQL Docs](https://dev.mysql.com/doc/refman/8.0/en/replication.html)
- [High Availability, Load Balancing, and Replication — PostgreSQL Docs](https://www.postgresql.org/docs/current/high-availability.html)
- [JSON Types — PostgreSQL Docs](https://www.postgresql.org/docs/current/datatype-json.html)
- [PostgreSQL vs MySQL — PostgreSQL Wiki](https://wiki.postgresql.org/wiki/PostgreSQL_vs_MySQL)
