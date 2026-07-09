---
title: "Java Collection Framework 정리"
date: 2026-07-02
last_modified_at: 2026-07-09
categories: [dev, java]
tags: [study note, computer science, java, collection, data-structure]
toc: true
comments: true
---

## Summary

- Java Collection Framework의 구현체 선택은 내부 자료구조(배열 vs 연결리스트 vs 해시 vs 트리)와 시간 복잡도에서 결정된다
- HashMap 내부 구현(hashCode → bucket → treeify)을 이해하면 equals/hashCode 계약, 로드 팩터, 충돌 처리를 자연스럽게 설명할 수 있다
- `LinkedList`의 이론적 O(1) 삽입은 캐시 미스 때문에 현실에서는 `ArrayList`보다 느린 경우가 많다 — 앞뒤 삽입이 잦다면 `ArrayDeque`를 선택한다
- 스레드 안전이 필요할 때 `Hashtable`은 지양하고, `ConcurrentHashMap`(Map) 또는 `CopyOnWriteArrayList`(List) 를 상황에 맞게 선택한다
- HashMap의 해시 보정(XOR)·capacity 2배 확장·Red-Black Tree 정렬 기준은 전부 "해시 충돌을 저렴하게 완화하고, 최악의 경우도 O(log n)으로 방어한다"는 하나의 설계 철학으로 연결된다

---

## 계층 구조

```
Iterable
  └── Collection
        ├── List          → ArrayList, LinkedList, Vector
        ├── Set           → HashSet, LinkedHashSet, TreeSet
        └── Queue         → LinkedList, ArrayDeque, PriorityQueue
              └── Deque   → ArrayDeque, LinkedList

Map (Collection 미상속)  → HashMap, LinkedHashMap, TreeMap, Hashtable, ConcurrentHashMap
```

`Map`은 `Collection`을 구현하지 않는다 — 키-값 쌍이라는 구조적 차이 때문이다.

**배열은 `Iterable`이 아닌데 왜 for-each가 되는가?** 배열 타입은 `Cloneable`과 `Serializable`만 암묵적으로 구현하고 `Iterable`은 구현하지 않는다. for-each는 "`Iterable`을 쓰는 문법"이 아니라, 컴파일러가 대상이 `Iterable`이면 Iterator 기반으로, 배열이면 인덱스 기반 for문으로 완전히 다르게 변환하는 두 갈래 처리이기 때문이다(자세한 내용은 아래 "for-each 문의 실체" 참고).

---

## List

순서가 있고 중복을 허용한다.

### ArrayList

내부적으로 **Object 배열**을 사용한다.

```java
// OpenJDK 내부 구조 (개념)
transient Object[] elementData;
private int size;
private static final int DEFAULT_CAPACITY = 10;
```

**동적 확장**: 배열이 꽉 차면 기존 용량의 1.5배짜리 새 배열을 만들고 복사한다(`Arrays.copyOf`). 이 복사 비용이 O(n)이지만, 분할 상환 분석(amortized)으로 `add()`는 O(1)이 된다.

**왜 2배가 아니라 1.5배인가?**  
동적 배열의 성장 비율에는 **황금비(golden ratio, 약 1.618)** 라는 기준점이 있다. 성장 비율이 이 값보다 작으면, 이전에 배열을 여러 번 재할당하며 버려진 메모리 블록들을 이후 재사용할 가능성이 이론적으로 생긴다. 반대로 2배처럼 황금비 이상이면 새로 필요한 크기가 이전에 버린 블록들을 다 합쳐도 항상 더 커서 재사용이 근본적으로 불가능하다. `ArrayList`는 capacity가 2의 제곱수일 필요가 없으므로(HashMap과 달리 비트 마스킹 인덱스 계산을 하지 않음), 1.5배를 택해 이 메모리 재사용 여지와 더 적은 낭비 공간을 확보한다. HashMap이 2배를 쓰는 건 이 메모리 이점을 포기하는 대신, capacity를 2의 제곱수로 유지해야만 성립하는 비트 연산 인덱싱(`hash & (capacity-1)`)과 절반만 이동시키는 resize 최적화를 택한 트레이드오프다.

| 연산 | 시간 복잡도 |
|---|---|
| `get(index)` | O(1) |
| `add(element)` — 끝 | O(1) amortized |
| `add(index, element)` — 중간 | O(n) — 뒤 요소 밀기 |
| `remove(index)` — 중간 | O(n) — 앞으로 당기기 |
| `contains(element)` | O(n) — 선형 탐색 |

### LinkedList

**이중 연결 리스트**로 구현된다.

```java
// 개념적 노드 구조
private static class Node<E> {
    E item;
    Node<E> next;
    Node<E> prev;
}
```

| 연산 | 시간 복잡도 |
|---|---|
| `get(index)` | O(n) — 포인터 순회 |
| `addFirst()` / `addLast()` | O(1) |
| `add(index, element)` — 중간 | O(n) 탐색 + O(1) 삽입 |
| `remove(index)` — 중간 | O(n) 탐색 + O(1) 삭제 |

**ArrayList vs LinkedList 선택 기준**

| 상황 | 선택 |
|---|---|
| 인덱스 접근이 잦다 | ArrayList |
| 앞/뒤 삽입·삭제가 잦다 | ArrayDeque (LinkedList보다 캐시 친화적) |
| 중간 삽입·삭제가 잦다 | 실제로는 ArrayList가 더 빠른 경우 많음 (캐시 효과) |

**"캐시 미스"란 정확히 무엇인가?** `ArrayList`는 원소들이 메모리에 연속적으로 배치되어(공간 지역성) CPU가 캐시 라인 하나를 가져올 때 인접한 여러 원소가 함께 딸려온다. 반면 `LinkedList`의 각 노드는 힙 여기저기 흩어져 할당되므로, `next` 포인터를 따라갈 때마다 사실상 임의의 메모리 주소로 점프하게 되어 캐시 히트를 기대하기 어렵다. 삽입 자체는 `LinkedList`가 O(1)로 빠르지만, 삽입 위치를 찾는 순회 과정에서 이미 손해를 본다. **대부분의 경우 ArrayList를 기본으로 선택**하는 것이 낫다.

### Vector / Stack (레거시)

`Vector`는 `ArrayList`와 구조가 같지만 모든 메서드가 `synchronized`로 감싸져 있어 단일 스레드 환경에서는 불필요한 락 오버헤드만 남는다. `Stack`은 그 `Vector`를 상속해 만든 LIFO 구조인데, `Vector`의 인덱스 접근 메서드까지 그대로 노출돼 스택 규약(push/pop만 허용)이 깨질 수 있다. 두 클래스 모두 레거시로 간주되며, 스택이 필요하면 `ArrayDeque`(단일 스레드), 동시성이 필요하면 `ConcurrentLinkedDeque`나 `ConcurrentHashMap` 계열을 쓰는 게 일반적이다.

---

## Set

순서 없음(TreeSet은 정렬 유지), 중복 불허.

### HashSet

내부적으로 **HashMap을 래핑**한다. 값은 더미 객체(`PRESENT`)를 넣어 Map의 key를 Set의 원소로 사용한다.

```java
private transient HashMap<E,Object> map;
private static final Object PRESENT = new Object();

public boolean add(E e) {
    return map.put(e, PRESENT) == null;
}
```

- 순서 보장 없음
- `null` 하나 허용
- `add()`, `contains()`, `remove()` 모두 O(1) 평균 (내부가 HashMap이므로 아래 HashMap 섹션의 해시 충돌·treeify 방어 로직을 그대로 물려받는다)

### LinkedHashSet

`LinkedHashSet`도 `HashSet`처럼 `Map`을 래핑하지만, 그 내부가 `HashMap`이 아니라 **`LinkedHashMap`**이라는 점이 다르다.

```java
public class LinkedHashSet<E> extends HashSet<E> {
    public LinkedHashSet(int initialCapacity, float loadFactor) {
        super(initialCapacity, loadFactor, true);  // HashSet 내부의 protected 생성자
    }
}
```

`LinkedHashMap`이 모든 엔트리를 이중 연결 리스트로 추가 연결해 **삽입 순서**를 유지하므로, `LinkedHashSet`도 순회 시 항상 넣은 순서대로 원소가 나온다. `HashSet`과 시간 복잡도는 동일(O(1) 평균)하지만, 이중 연결 리스트 유지 비용만큼 메모리 오버헤드가 조금 더 크다. "순서는 신경 안 쓰고 최대한 가볍게"면 `HashSet`, "삽입 순서를 그대로 보고 싶다"면 `LinkedHashSet`을 선택한다.

### TreeSet

**Red-Black Tree** 기반의 `TreeMap`을 내부에 사용한다.

- 원소가 항상 **정렬된 상태**로 유지됨 (기본: 자연 순서, 또는 `Comparator` 지정)
- `add()`, `remove()`, `contains()` O(log n)
- 범위 탐색 메서드 제공: `headSet()`, `tailSet()`, `subSet()`, `floor()`, `ceiling()`

```java
TreeSet<Integer> ts = new TreeSet<>();
ts.add(5); ts.add(1); ts.add(3);
System.out.println(ts);            // [1, 3, 5]
System.out.println(ts.floor(4));   // 3 — 4 이하의 최대값
System.out.println(ts.ceiling(4)); // 5 — 4 이상의 최소값
```

---

## Map

키-값 쌍 저장. `Collection` 인터페이스를 구현하지 않는다.

### HashMap 내부 구현 (핵심)

**구조: 배열 + 연결 리스트 + Red-Black Tree**

```
버킷 배열 (초기 용량 16)
[0] → null
[1] → Entry(key="a", val=1) → Entry(key="q", val=2)  ← 해시 충돌 체이닝
[2] → Entry(key="b", val=3)
...
```

**put() 동작 순서**

```
1. key.hashCode() 호출
2. 해시값 보정 — 상위 비트를 XOR로 섞어 분산성 향상
   h = key.hashCode(); hash = h ^ (h >>> 16)
3. 버킷 인덱스 계산: index = hash & (capacity - 1)
   capacity가 2의 제곱수이므로 %보다 빠른 비트 AND 사용
4. 해당 버킷에서 equals()로 동일 키 탐색
5. 있으면 값 교체, 없으면 노드 추가
6. 체인 길이 ≥ 8 이면 LinkedList → Red-Black Tree로 전환 (treeify)
7. 체인 길이 ≤ 6 이면 다시 LinkedList로 복구 (untreeify)
8. size > capacity × loadFactor(0.75) 이면 resize(2배 확장 + rehash)
```

**왜 로드 팩터가 0.75인가?**  
시간-공간 트레이드오프의 실험적 최적값이다. 0.75보다 높으면 충돌이 많아 탐색이 느려지고, 낮으면 너무 자주 resize해서 메모리 낭비와 rehash 비용이 커진다.

**왜 초기 용량이 16(2의 제곱수)인가?**  
`hash % capacity` 대신 `hash & (capacity - 1)`로 인덱스를 계산할 수 있어 나머지 연산보다 빠르다.

**왜 하필 XOR(`h ^ (h >>> 16)`)로 보정하는가?**

capacity가 16이면 인덱스 계산에는 하위 4비트만 쓰인다. 만약 상위 비트만 다르고 하위 비트가 비슷한 해시값들이 있다면(실무에서 흔함) 계속 같은 버킷에 몰리는 문제가 생긴다. XOR을 고른 이유는 세 조건을 동시에 만족하는 사실상 유일한 선택지이기 때문이다.

- **정보 손실이 없다(entropy-preserving)**: XOR은 가역 연산이라 상위/하위 비트 정보를 "섞기만" 하지 버리지 않는다. 반대로 AND(`h & (h>>>16)`)는 둘 중 하나라도 0이면 결과가 0으로, OR은 둘 중 하나라도 1이면 결과가 1로 편향되어, 균등 분포였던 입력도 특정 값 쪽으로 쏠리게 만든다.
- **자리올림(carry)이 없다**: 덧셈(`h + (h>>>16)`)은 캐리 전파로 인해 특정 비트 패턴에서 예측하기 어려운 결과를 낳을 수 있다. XOR은 각 출력 비트가 정확히 "그 비트 자신 + 16비트 위의 비트" 둘에만 의존해 단순하고 예측 가능하다.
- **저렴하다**: 이 `hash()` 메서드는 `put`/`get`/`remove`/`containsKey` 등 거의 모든 연산에서 호출되는 hot path다. 곱셈 기반 완전 믹싱(avalanche, 예: Fibonacci hashing)이 분산 품질은 더 좋지만, shift + XOR 두 연산에 비해 비용이 크다. 대부분의 실무 hashCode()는 이미 하위 비트에서 꽤 고르게 분산되어 있어 완전한 avalanche까지는 필요 없고, 설령 극단적으로 충돌이 몰리는 경우가 생겨도 treeify가 최후의 안전장치로 O(log n)을 보장하므로 "1차 보정은 저렴하게, 최악의 방어는 트리에게" 역할을 분담한 것이다.

**체인(chain)이란?**  
같은 버킷 인덱스로 계산된 서로 다른 키들을 연결 리스트로 이어 붙인 것이다. 해시 함수가 완벽하지 않은 이상 서로 다른 키의 `hash & (capacity-1)` 결과가 같아지는 경우(해시 충돌)가 생기는데, HashMap은 이를 에러로 처리하지 않고 같은 버킷에 노드를 `next` 포인터로 연결해 순서대로 쌓아둔다. 조회 시 이 체인을 순회하며, 먼저 `hash` 값이 같은지 확인(정수 비교라 빠름)한 뒤 hash가 같은 것들에 한해서만 `equals()`(상대적으로 비용이 큰 연산)를 호출하는 2단계 필터링을 거친다.

**Java 8 이후 treeify**  
체인 길이가 8 이상이 되면 그 버킷 하나에 한해 연결 리스트를 Red-Black Tree로 전환(treeify)해 최악의 경우 탐색을 O(n) → O(log n)으로 낮춘다. HashMap 전체가 아니라 유난히 길어진 그 버킷 하나만 바뀌며, 다른 버킷은 여전히 리스트 상태로 남을 수 있다. 삭제로 트리 노드 수가 6 이하로 줄면 다시 리스트로 되돌린다(untreeify) — 트리는 리스트보다 노드당 메모리 오버헤드(색상 비트, 좌우 자식 포인터)가 크기 때문에 원소가 적을 땐 굳이 유지할 이유가 없다.

**왜 treeify는 8, untreeify는 6으로 다른가 (히스테리시스)**  
두 값이 같다면(예: 둘 다 8), 체인 길이가 경계값 근처에서 원소가 삽입·삭제될 때마다 treeify ↔ untreeify가 반복되는 "스래싱"이 발생한다. 두 변환 모두 O(n) 이상의 트리 재구성 비용이 들어 반복되면 성능에 해롭다. `TREEIFY_THRESHOLD = 8`은 로드 팩터 0.75에서 정상적인 해시 분산이라면 한 버킷에 8개가 몰릴 확률이 포아송 분포상 약 천만분의 1이라는 통계적 근거가 있다(OpenJDK 주석). 반면 `UNTREEIFY_THRESHOLD = 6`은 그런 통계적 근거보다는 "스래싱은 막으면서도 트리를 필요 이상 오래 유지하지 않는" 실무적 여유값(8과 2 차이)에 가깝다.

**Red-Black Tree 정렬 기준**  
같은 버킷 안에서도 전체 해시값(32비트)은 서로 다를 수 있으므로(버킷 인덱스는 하위 비트만 사용), 트리 노드 순서는 다음 우선순위로 정해진다.

1. 전체 해시값(hash) 비교 — 대부분 여기서 순서가 정해진다
2. 해시값까지 같으면, 키 클래스가 `Comparable`이면 `compareTo()` 결과 사용
3. 그래도 같으면(또는 `Comparable`이 아니면) 클래스 이름 비교 → `System.identityHashCode()`로 최종 타이브레이크

이 fallback 덕분에 공격자가 `hashCode()`를 전부 동일하게 만들어도(①단계가 전부 무승부여도) ③단계에서 여전히 유효한 순서가 정해져 트리가 한쪽으로 치우치지 않고 O(log n)을 유지할 수 있다.

**treeify로도 완전히 막지 못하는 것**  
치명적인 해시 충돌 공격(모든 키의 `hashCode()`가 동일)에도 treeify는 O(n)을 O(log n)으로 "완화"할 뿐이다. ①O(1) 대비 여전히 느리고, ②체인이 8에 도달해 트리로 변환되는 순간 자체가 비용(O(n log n))이며, ③해시값이 완전히 고정된 공격이라면 resize로 capacity를 아무리 늘려도 이 키들은 영원히 같은 버킷에 몰려 resize가 전혀 도움이 안 된다 — 이 시나리오에서는 treeify가 유일한 방어선이다.

**resize(rehash)**

```
capacity를 2배로 늘리고 모든 엔트리를 재배치.
새 버킷 인덱스 = hash & (newCapacity - 1)

Java 8 최적화: oldCapacity 16 → 32로 늘어날 때
  hash의 5번째 비트(oldCapacity 비트)가 0이면 → 기존 인덱스 유지
  hash의 5번째 비트가 1이면 → 기존 인덱스 + oldCapacity
절반은 제자리, 절반만 이동 — 전체 rehash보다 효율적
```

capacity가 16→32로 늘면 마스크가 `0b01111`(15)에서 `0b11111`(31)로, 비트 하나(값 16)만 추가된다. `hash & 31 = (hash & 15) | (hash & 16)`으로 분해할 수 있으므로, 같은 옛 버킷에 있던 엔트리들(하위 4비트가 모두 같음)은 새로 마스크에 포함된 이 5번째 비트값(0/1)에 따라서만 "그대로 유지" vs "+oldCapacity 이동" 두 그룹으로 갈린다. 전체 해시를 다시 계산할 필요 없이 그 비트 하나만 확인하면 되므로 절반만 이동시키는 효율적인 rehash가 가능하다.

**왜 capacity는 항상 2의 제곱수로 유지되는가?**  
2의 제곱수라는 하나의 속성이 두 가지를 동시에 가능하게 한다. 첫째, `hash % capacity` 대신 더 빠른 `hash & (capacity - 1)`로 인덱스를 계산할 수 있다. 둘째, resize 시 마스크가 비트 하나만큼 늘어나는 형태가 되어, 전체 rehash 없이 위에서 설명한 절반 분리 최적화가 가능해진다. 이 제약이 있기 때문에 HashMap은 (뒤에서 다룰 ArrayList와 달리) 반드시 2배로만 확장한다.

**키 객체의 조건**  
`HashMap`의 키는 반드시 `hashCode()`와 `equals()`를 올바르게 구현해야 한다. 또한 키는 **불변(immutable)**이어야 한다. 키를 Map에 넣은 후 키 객체의 상태가 바뀌면 `hashCode()`값이 달라져, `get()` 호출 시 계산되는 새 해시값이 원래 저장됐던 버킷과 달라져 해당 엔트리를 찾을 수 없게 된다(사실상 유실). `String`이 키로 자주 쓰이는 이유도 불변이기 때문이다 — 삽입 후 상태가 바뀌어 `hashCode()`가 달라질 일이 없고, 내부에 `hash` 필드를 두고 최초 호출 시에만 계산해 캐싱해두는 최적화(lazy caching)도 불변이기에 안전하게 가능하다.

### LinkedHashMap

HashMap을 상속하고, 모든 엔트리를 **이중 연결 리스트**로 연결해 순서를 유지한다.

- 기본: **삽입 순서** 유지
- `new LinkedHashMap<>(capacity, loadFactor, true)` → **접근 순서(LRU)** 유지

LRU 캐시 구현에 직접 활용할 수 있다:

```java
class LRUCache<K, V> extends LinkedHashMap<K, V> {
    private final int capacity;

    LRUCache(int capacity) {
        super(capacity, 0.75f, true);  // accessOrder = true
        this.capacity = capacity;
    }

    @Override
    protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
        return size() > capacity;
    }
}
```

`accessOrder=true`일 때는 `get()`이 호출될 때마다 해당 노드를 내부 이중 연결 리스트의 맨 뒤로 옮겨, 가장 오래 사용되지 않은 항목이 항상 리스트 맨 앞에 위치하게 된다. `removeEldestEntry`가 `true`를 반환하면 그 가장 오래된(맨 앞) 엔트리를 자동으로 제거한다 — 위 코드에서는 `size()`가 `capacity`를 넘는 순간 가장 오래된 항목이 자동으로 빠지는 LRU가 완성된다.

### TreeMap

**Red-Black Tree** 기반. 키를 항상 정렬 상태로 유지한다.

- `put()`, `get()`, `remove()` O(log n)
- 범위 탐색: `headMap()`, `tailMap()`, `subMap()`, `floorKey()`, `ceilingKey()`, `firstKey()`, `lastKey()`
- 키 객체가 `Comparable`을 구현하거나, 생성 시 `Comparator`를 제공해야 한다

**왜 일반 이진 탐색 트리(BST)가 아니라 Red-Black Tree인가?** 일반 BST는 정렬된 순서로 삽입되는 등 특정 입력에서 한쪽으로 치우쳐(skewed) 사실상 연결 리스트처럼 퇴화할 수 있어 최악의 경우 O(n)이 된다. Red-Black Tree는 삽입/삭제마다 색 규칙(red 노드의 자식은 반드시 black, 루트-리프 경로의 black 노드 수는 항상 동일)과 회전(rotation)·재색칠(recoloring)로 스스로 균형을 잡아, 입력 순서와 무관하게 O(log n)을 보장한다. 이 성질 덕분에 `TreeMap`/`TreeSet`뿐 아니라 위 HashMap의 treeify도 같은 자료구조를 재사용한다.

### HashMap vs Hashtable vs ConcurrentHashMap

| | HashMap | Hashtable | ConcurrentHashMap |
|---|---|---|---|
| 스레드 안전 | X | O (메서드 전체 synchronized) | O (버킷 단위 잠금) |
| null 키/값 | 허용 | 불허 | 불허 |
| 성능 | 빠름 | 느림 (단일 락) | HashMap에 근접 |
| 레거시 | X | O (사용 지양) | X |

`ConcurrentHashMap`은 Java 8부터 **버킷 단위 CAS + synchronized 블록**으로 동시성을 처리한다. 같은 버킷에 접근하는 스레드만 경합하고, 다른 버킷에 접근하는 스레드는 독립적으로 동작한다.

---

## Queue / Deque

### ArrayDeque

내부적으로 **원형 배열(circular array)**을 사용한다. 앞뒤 양쪽에서 O(1) 삽입/삭제가 가능하다.

- **일반 큐**로 사용 시: `LinkedList`보다 빠르다 (캐시 친화적, 포인터 오버헤드 없음)
- **스택**으로 사용 시: `Stack` 클래스(레거시, `Vector` 상속)보다 빠르다
- `null` 삽입 불가

```java
Deque<Integer> deque = new ArrayDeque<>();
deque.addFirst(1);   // O(1)
deque.addLast(2);    // O(1)
deque.peekFirst();   // O(1) — 제거 없이 조회
deque.pollLast();    // O(1)
```

### PriorityQueue

**이진 최소 힙(binary min-heap)**으로 구현된다.

- `offer()` (= `add()`): O(log n) — 힙 위로 버블업
- `poll()`: O(log n) — 루트 제거 후 힙 재정렬
- `peek()`: O(1) — 루트(최솟값) 반환
- 순회 순서는 정렬 순서를 보장하지 않는다 — `poll()`로 하나씩 꺼내야 정렬 순서

힙 인덱스 관계: 부모 `(i-1)/2`, 왼쪽 자식 `2i+1`, 오른쪽 자식 `2i+2`

```java
// 최대 힙
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());

// 커스텀 비교자
PriorityQueue<int[]> pq = new PriorityQueue<>((a, b) -> a[0] - b[0]);
```

**offer()/poll()이 왜 O(log n)인가?** `offer()`는 마지막(리프) 위치에 원소를 넣은 뒤 부모 값과 비교해 자신이 더 작으면 교환하며 위로 올라가는 sift-up(버블업)을 수행한다. `poll()`은 루트를 제거하고 마지막 원소를 루트로 올린 뒤 자식과 비교하며 아래로 내려가는 sift-down(버블다운)을 수행한다. 원소가 n개인 완전 이진 트리는 각 레벨마다 노드 수가 2배씩 늘어나므로 높이가 log₂n이 되고, 버블업/버블다운은 최대 트리 높이만큼만 반복되므로 O(log n)으로 제한된다.

---

## Thread-safe 컬렉션

### Collections.synchronizedXxx()

기존 컬렉션 전체를 단일 뮤텍스로 감싼다.

```java
List<String> syncList = Collections.synchronizedList(new ArrayList<>());
// 반복(iteration) 시에는 직접 synchronized 블록 필요
synchronized (syncList) {
    for (String s : syncList) { ... }
}
```

모든 메서드가 같은 잠금을 사용하므로 동시성이 낮다 — `Hashtable`이 메서드 전체를 락으로 감싸는 것과 근본적으로 같은 전략이다. 그래서 여러 스레드가 자주 동시에 접근하는 상황이라면 이 방식보다 버킷 단위로 락을 세분화한 `ConcurrentHashMap`, 또는 아래 `CopyOnWriteArrayList`처럼 애초에 락이 필요 없는 구조를 선택하는 편이 유리하다. 다만 `iterator()`로 반복할 때는 컬렉션 자체의 락이 각 메서드 호출이 끝나는 순간 풀리기 때문에, 순회 도중 다른 스레드의 개입을 막으려면 위 예시처럼 `synchronized` 블록으로 순회 전체를 감싸야 한다.

### CopyOnWriteArrayList

쓰기 시 배열 전체를 복사해 새 배열로 교체한다.

- 읽기: 잠금 없음 — 매우 빠름
- 쓰기: O(n) — 전체 복사 비용
- 순회 중 수정이 발생해도 `ConcurrentModificationException` 없음 (스냅샷 기반)
- 읽기가 압도적으로 많고 쓰기가 드문 경우 적합

읽기는 락 없이 배열을 그대로 참조하므로 매우 빠르고, 쓰기는 배열 전체를 복사해 교체하므로 O(n) 비용이 든다. 읽기가 압도적으로 많고 쓰기가 드물면 이 쓰기 비용이 상대적으로 희석되어 적합하다. 반복자는 생성 시점의 배열 스냅샷을 기준으로 순회하므로, 순회 도중 다른 스레드가 쓰기를 해도 그 스냅샷 자체는 변하지 않아 예외 없이 안전하게 진행된다(대신 최신 변경 사항은 반영되지 않는다).

### fail-fast vs fail-safe 반복자

**fail-fast**: `ArrayList`, `HashMap` 등 대부분의 컬렉션. 반복 중 구조 변경 시 `ConcurrentModificationException`을 즉시 던진다. 내부 `modCount`를 반복자 생성 시 기록하고 매 `next()` 호출마다 비교한다.

**fail-safe**: `CopyOnWriteArrayList`, `ConcurrentHashMap`. 복사본 또는 스냅샷을 기반으로 반복하므로 수정이 반영되지 않을 수 있지만 예외는 발생하지 않는다.

**for-each 문의 실체**

```java
for (String s : list) { ... }
```

는 컴파일 시 아래처럼 변환된다. 이게 가능하려면 `list`가 `Iterable`을 구현해야 한다.

```java
Iterator<String> it = list.iterator();
while (it.hasNext()) {
    String s = it.next();
    ...
}
```

**`list.remove()`는 예외가 나는데 `iterator.remove()`는 안 나는 이유**

두 방법 모두 리스트의 `modCount`를 증가시키는 건 같다. 차이는 `iterator.remove()`가 리스트를 수정한 직후 자신의 `expectedModCount`를 최신 `modCount`로 다시 동기화한다는 점이다(`expectedModCount = modCount;`). 그래서 다음 `next()` 호출 시 비교해도 일치해 예외가 안 난다. 반면 `list.remove(element)`를 for-each 중 직접 호출하면 리스트의 `modCount`는 증가하지만 반복자의 `expectedModCount`는 갱신될 기회가 없어 예전 값 그대로 남고, 다음 `next()`에서 불일치가 감지되어 `ConcurrentModificationException`이 발생한다. 핵심은 "리스트가 바뀌었는가"가 아니라 "반복자가 그 사실을 알고 있는가"다.

---

## Comparable vs Comparator

| | Comparable | Comparator |
|---|---|---|
| 패키지 | `java.lang` | `java.util` |
| 메서드 | `compareTo(T o)` | `compare(T o1, T o2)` |
| 구현 위치 | 정렬할 클래스 내부 | 외부 (별도 클래스, 람다) |
| 의미 | 자연 순서 (natural ordering) | 커스텀 순서 |

```java
// Comparable — 클래스 내부에 기본 정렬 기준을 정의
public class Student implements Comparable<Student> {
    int age;
    @Override public int compareTo(Student o) {
        return Integer.compare(this.age, o.age);  // 나이 오름차순
    }
}

// Comparator — 외부에서 다양한 정렬 기준 주입
Comparator<Student> byName = Comparator.comparing(s -> s.name);
students.sort(byName.reversed());
```

`TreeSet`/`TreeMap`에 원소를 넣을 때 `Comparable`이 없으면 `Comparator`를 생성자에 넘겨야 한다. `PriorityQueue`도 동일하다. `Student`가 이미 나이순 `Comparable`을 가지고 있는데 이름순 정렬도 필요하다면, `Comparable`을 수정하는 대신 `Comparator.comparing(s -> s.name)`처럼 별도의 `Comparator`를 만들어 필요한 곳에 주입하면 된다 — 클래스 자체를 건드릴 필요가 없다.

---

## 컬렉션과 함께 자주 나오는 주제

### 오토박싱과 언박싱

컴파일러가 기본형(primitive type)을 대응하는 래퍼 클래스 객체로 자동 변환하는 것이 오토박싱, 그 반대가 언박싱이다. `List<Integer>`, `Map<String, Integer>` 같은 제네릭 컬렉션은 객체만 담을 수 있고 기본형은 담지 못하기 때문에(제네릭이 타입 소거로 참조 타입 기준으로 동작), 이 변환이 컬렉션을 편하게 쓰는 데 필수적이다.

```java
Integer a = 127, b = 127;
System.out.println(a == b);  // true

Integer c = 200, d = 200;
System.out.println(c == d);  // false
```

오토박싱은 내부적으로 `Integer.valueOf()`를 호출하는데, 이 메서드는 자바 언어 명세(JLS)가 보장하는 **-128~127** 범위의 값에 대해 미리 만들어둔 캐시 객체를 재사용하는 플라이웨이트(Flyweight) 패턴을 쓴다. 그래서 127은 캐시된 동일 객체를 참조해 `==`가 true지만, 200은 범위를 벗어나 매번 새 `Integer` 객체가 생성되어 `==`(참조 비교)가 false다. 값 비교가 필요하면 `equals()`를 써야 한다.

**언박싱의 함정 — `null`을 언박싱하면 NPE**

```java
Map<String, Integer> map = new HashMap<>();
int value = map.get("missing") + 1;             // NullPointerException!
int value = map.getOrDefault("missing", 0) + 1; // 안전
```

`Map.get()`이 키를 찾지 못하면 `null`을 반환하는데, 이걸 기본형에 대입하거나 연산에 쓰면 컴파일러가 `count.intValue() + 1`로 변환하는 과정에서 `null.intValue()` 호출이 실패해 NPE가 터진다. 컬렉션에서 조회한 값을 바로 연산에 쓸 때 실무에서 흔히 나오는 버그이므로, `getOrDefault()`나 `null` 체크로 방어해야 한다.

### 제네릭 타입 소거 (Type Erasure)

`List<String>`과 `List<Integer>`는 컴파일러 단계에서만 타입 체크에 사용되고, 컴파일된 바이트코드에는 타입 파라미터 정보가 남지 않아 런타임에는 둘 다 동일한 `ArrayList`로 취급된다.

```java
List<String> list1 = new ArrayList<>();
List<Integer> list2 = new ArrayList<>();
System.out.println(list1.getClass() == list2.getClass());  // true
```

(`List<String>.class`처럼 제네릭 타입 파라미터가 붙은 클래스 리터럴은 문법적으로 불가능하다 — 이 자체가 타입 소거의 방증이다.) Java 5에 제네릭이 도입될 때 이전 비제네릭 컬렉션 코드와 바이트코드 레벨에서 호환되도록, JVM 구조를 바꾸지 않고 컴파일러 단계에서만 타입 정보를 지우는 방식을 택했다.

---

## 시간 복잡도 요약

| 자료구조 | get | add/put | remove | contains | 특이사항 |
|---|---|---|---|---|---|
| ArrayList | O(1) | O(1)* | O(n) | O(n) | *끝 추가, amortized |
| LinkedList | O(n) | O(1)† | O(1)† | O(n) | †앞/뒤, 탐색 포함 시 O(n) |
| ArrayDeque | O(1)‡ | O(1)* | O(1)‡ | O(n) | ‡앞/뒤만, *amortized |
| HashSet | — | O(1)* | O(1)* | O(1)* | *평균, 최악 O(n) |
| TreeSet | — | O(log n) | O(log n) | O(log n) | 정렬 유지 |
| HashMap | O(1)* | O(1)* | O(1)* | O(1)* | *평균, 최악 Java 8+ O(log n) |
| TreeMap | O(log n) | O(log n) | O(log n) | O(log n) | 정렬 유지 |
| PriorityQueue | O(1)§ | O(log n) | O(log n) | O(n) | §peek만 O(1) |

---

## Reference

- [Java SE 21 API — java.util.HashMap](https://docs.oracle.com/en/java/docs/api/java.base/java/util/HashMap.html)
- [Java SE 21 API — java.util.concurrent.ConcurrentHashMap](https://docs.oracle.com/en/java/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html)
- [OpenJDK — HashMap source](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/HashMap.java)
- Joshua Bloch, *Effective Java 3rd Edition* — Item 10, 11 (equals/hashCode)
- [Java Language Specification — Integer 캐싱 보장 범위](https://docs.oracle.com/javase/specs/jls/se21/html/jls-5.html#jls-5.1.7)