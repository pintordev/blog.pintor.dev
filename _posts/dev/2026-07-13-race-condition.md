---
title: "경쟁 상태(Race Condition)란 무엇이며 어떻게 해결하는가"
date: 2026-07-13
last_modified_at: 2026-07-13
categories: [dev, concurrency]
tags: [weekly paper, concurrency, race-condition, thread-safety, synchronization, java]
toc: true
comments: true
---

## Summary

- **경쟁 상태(Race Condition)**: 둘 이상의 스레드가 공유 자원에 동시에 접근하고, 최소 하나가 쓰기를 수행할 때 실행 순서에 따라 결과가 달라지는 현상.
- 해결 전략은 크게 **상호 배제(Lock)**, **원자적 연산(Atomic/CAS)**, **공유 자체를 제거**하는 세 갈래로 나뉜다.
- `volatile`은 가시성만 보장할 뿐 원자성을 보장하지 않는다는 점이 자주 혼동된다.

---

## Background

단일 스레드 프로그램에서는 명령어가 항상 정해진 순서대로 실행되므로 결과가 결정적(deterministic)이다. 하지만 멀티코어 CPU가 보편화되고 애플리케이션이 스레드풀, 비동기 처리, 병렬 스트림을 적극적으로 활용하게 되면서, 여러 스레드가 같은 메모리 영역을 동시에 읽고 쓰는 상황이 일상적으로 발생한다.

문제는 CPU 레벨에서 하나의 "연산처럼 보이는 코드"가 실제로는 여러 단계로 쪼개져 실행된다는 데 있다. 예를 들어 `count++`는 다음 세 단계로 분해된다.

```
1. count 값을 레지스터로 읽는다 (read)
2. 레지스터 값을 1 증가시킨다 (modify)
3. 레지스터 값을 count에 다시 쓴다 (write)
```

두 스레드가 이 세 단계를 인터리빙(interleaving)하며 실행하면, 한쪽의 쓰기가 다른 쪽의 쓰기에 덮어써져 증가분이 유실된다. 이것이 경쟁 상태의 전형적인 예다.

---

## Race Condition의 발생 조건

경쟁 상태는 다음 세 조건이 모두 충족될 때 발생한다.

1. **공유 자원**: 두 개 이상의 스레드가 접근하는 동일한 메모리 영역(변수, 컬렉션, 필드 등)
2. **쓰기 연산 존재**: 접근하는 스레드 중 최소 하나가 쓰기를 수행
3. **비동기적 접근**: 접근 순서나 타이밍을 제어하는 동기화 장치가 없음

```java
public class Counter {
    private int count = 0;

    public void increment() {
        count++; // read-modify-write, 원자적이지 않음
    }
}
```

10개의 스레드가 각각 1000번씩 `increment()`를 호출해도 최종 `count`는 10000이 되지 않는 경우가 흔하다. 두 스레드가 동시에 같은 값을 읽고 각자 1을 더해 같은 값을 쓰면 증가분 하나가 사라지기 때문이다.

---

## 해결 전략 1: 상호 배제 (Mutual Exclusion)

임계 구역(critical section)에 한 번에 하나의 스레드만 들어가도록 강제하는 방식이다.

### synchronized

JVM 레벨의 모니터 락(intrinsic lock)을 사용한다. 메서드나 블록 단위로 락을 건다.

```java
public class Counter {
    private int count = 0;

    public synchronized void increment() {
        count++;
    }
}
```

구현이 단순하지만, 락 획득/해제 오버헤드가 있고 경합이 심할수록 성능이 저하된다.

### ReentrantLock

`java.util.concurrent.locks` 패키지가 제공하는 명시적 락. `synchronized` 대비 세밀한 제어가 가능하다.

```java
private final Lock lock = new ReentrantLock();

public void increment() {
    lock.lock();
    try {
        count++;
    } finally {
        lock.unlock();
    }
}
```

- 타임아웃을 둔 락 시도(`tryLock`)
- 공정성(fairness) 옵션으로 스레드 기아(starvation) 방지
- 인터럽트 가능한 락 획득

`synchronized`보다 유연하지만 반드시 `finally`에서 해제해야 하는 책임이 개발자에게 넘어온다.

---

## 해결 전략 2: 원자적 연산 (Atomic / CAS)

락 없이 하드웨어 수준의 CAS(Compare-And-Swap) 명령어로 원자성을 보장하는 방식이다.

```java
private final AtomicInteger count = new AtomicInteger(0);

public void increment() {
    count.incrementAndGet(); // CAS 기반, 락 없이 원자적
}
```

CAS는 "현재 값이 예상한 값과 같으면 새 값으로 교체"를 하나의 원자적 하드웨어 명령으로 수행한다. 경합이 실패하면 재시도(spin)하는 방식이라, 짧은 임계 구역에서는 락보다 빠르다. 다만 경합이 극심하면 재시도 비용이 누적되어 오히려 불리해질 수 있다.

---

## 해결 전략 3: volatile — 가시성 vs 원자성

`volatile`은 자주 오해되는 키워드다. 이 키워드는 **가시성(visibility)**만 보장하며, **원자성(atomicity)**은 보장하지 않는다.

```java
private volatile boolean flag = false;

public void stop() {
    flag = true; // 다른 스레드가 즉시 이 변경을 볼 수 있음 (가시성)
}
```

```java
private volatile int count = 0;

public void increment() {
    count++; // 여전히 read-modify-write, 원자적이지 않음! race condition 발생
}
```

`volatile`은 CPU 캐시에 값이 남아 다른 스레드가 오래된 값을 보는 문제(stale read)는 막아주지만, 복합 연산의 원자성 문제는 해결하지 못한다. 단일 플래그 값 갱신처럼 "읽고 즉시 반영"되는 상황에만 적합하다.

---

## 해결 전략 4: 공유 자체를 없애기

가장 근본적인 접근은 락도 CAS도 필요 없게 공유 상태를 제거하는 것이다.

### 불변 객체 (Immutable Object)

객체가 생성 후 상태를 바꿀 수 없다면 여러 스레드가 동시에 읽어도 문제가 없다. `String`, `record`, 방어적 복사를 적용한 값 객체가 대표적이다.

### ThreadLocal

각 스레드가 독립적인 변수 사본을 갖도록 하여 애초에 공유를 제거한다.

```java
private static final ThreadLocal<SimpleDateFormat> formatter =
    ThreadLocal.withInitial(() -> new SimpleDateFormat("yyyy-MM-dd"));
```

스레드풀 환경에서는 스레드 재사용 시 이전 값이 남아있을 수 있어 사용 후 `remove()` 호출이 필요하다.

### 동시성 컬렉션

`ConcurrentHashMap`, `CopyOnWriteArrayList` 등은 내부적으로 세그먼트 락이나 CAS를 활용해 스레드 안전성을 라이브러리 레벨에서 캡슐화한다. 직접 `synchronized`로 감싼 `HashMap`보다 세밀한 락 분할로 성능이 우수하다.

### 메시지 패싱 / Actor 모델

공유 메모리 대신 메시지 큐를 통해 스레드 간 데이터를 주고받는 방식. Akka의 Actor, Go의 채널이 대표적이며 "메모리를 공유해서 통신하지 말고, 통신해서 메모리를 공유하라"는 원칙을 따른다.

---

## 전략 비교

| 전략 | 원자성 보장 | 성능 특성 | 적합한 상황 |
|---|---|---|---|
| `synchronized` | O | 락 경합 시 저하 | 간단한 임계 구역, 낮은 경합 |
| `ReentrantLock` | O | synchronized보다 유연, 유사한 오버헤드 | 타임아웃/공정성 등 세밀한 제어 필요 시 |
| `Atomic` (CAS) | O | 락 없이 빠름, 극한 경합에서 저하 가능 | 단일 변수의 카운터/플래그 연산 |
| `volatile` | X (가시성만) | 오버헤드 거의 없음 | 단순 플래그 읽기/쓰기 |
| 불변 객체 | 해당 없음 (쓰기 자체가 없음) | 가장 안전, 객체 생성 비용 | 값 객체, 설정 데이터 |
| `ThreadLocal` | 해당 없음 (공유 없음) | 스레드당 메모리 사용 | 요청 단위 컨텍스트 저장 |
| 동시성 컬렉션 | O | 세밀한 락 분할로 우수 | 다중 스레드 컬렉션 접근 |

---

## Key Point

> **경쟁 상태는 "공유 자원 + 쓰기 + 비동기 접근"이라는 세 조건이 겹칠 때 발생한다. 해결책은 언제나 이 조건 중 하나를 깨는 방향으로 선택해야 한다: 락으로 접근을 직렬화하거나(synchronized/Lock), CAS로 연산 자체를 원자화하거나(Atomic), 아예 공유를 없애는 것(불변 객체, ThreadLocal, 메시지 패싱)이다. `volatile`이 원자성까지 해결해준다고 착각하지 않는 것이 실무에서 가장 흔한 함정을 피하는 길이다.**

---

## Reference

- [Java Concurrency in Practice - Brian Goetz](https://jcip.net/) — 자바 동시성 프로그래밍의 표준 참고서
- [Oracle: Java Memory Model and volatile](https://docs.oracle.com/javase/specs/jls/se17/html/jls-17.html) — JLS의 volatile 및 메모리 모델 명세
- [java.util.concurrent.atomic 패키지 문서](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/atomic/package-summary.html) — CAS 기반 원자적 클래스
- [java.util.concurrent.locks 패키지 문서](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/locks/package-summary.html) — ReentrantLock 등 명시적 락 API