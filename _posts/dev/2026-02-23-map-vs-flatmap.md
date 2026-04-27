---
title: "Java Stream API의 map과 flatMap"
date: 2026-02-23
last_modified_at: 2026-02-23
categories: [dev, java-stream]
tags: [java, stream, map, flatmap, functional-programming, collection]
toc: true
comments: true
---

## Summary

- **map**: 각 요소를 **1:1 변환**한다. 결과는 `Stream<R>`.
- **flatMap**: 각 요소를 **스트림으로 변환한 뒤 하나로 합친다**. 결과도 `Stream<R>`.
- 중첩 구조(`List<List<T>>`, `Optional<Optional<T>>` 등)를 평탄화할 때 **flatMap**을 쓴다.

---

## Background

Java 8 Stream API에서 가장 헷갈리는 메서드 조합 중 하나가 `map`과 `flatMap`이다.

`map`은 직관적이지만, `flatMap`은 처음에는 왜 필요한지 잘 와닿지 않는다. 차이는 **변환 결과가 단일 값인가, 스트림(컬렉션)인가**에서 갈린다.

---

## map

각 요소를 **하나의 값으로 변환**한다. 입력 1개 → 출력 1개.

```java
List<String> names = List.of("alice", "bob", "charlie");

List<String> upper = names.stream()
    .map(String::toUpperCase)
    .toList();

// ["ALICE", "BOB", "CHARLIE"]
```

```java
List<String> words = List.of("hello", "world");

List<Integer> lengths = words.stream()
    .map(String::length)
    .toList();

// [5, 5]
```

`map`의 반환 타입이 `Stream`이면 `Stream<Stream<T>>`가 된다.

```java
List<String> words = List.of("hi", "bye");

Stream<Stream<String>> nested = words.stream()
    .map(w -> Arrays.stream(w.split("")));
// 중첩된 스트림 → 다루기 불편함
```

---

## flatMap

각 요소를 **스트림으로 변환한 뒤, 모두 하나의 스트림으로 합친다**. 입력 1개 → 출력 N개.

```java
List<String> words = List.of("hi", "bye");

List<String> chars = words.stream()
    .flatMap(w -> Arrays.stream(w.split("")))
    .toList();

// ["h", "i", "b", "y", "e"]
```

중첩 리스트를 평탄화할 때도 유용하다.

```java
List<List<Integer>> nested = List.of(
    List.of(1, 2, 3),
    List.of(4, 5),
    List.of(6)
);

List<Integer> flat = nested.stream()
    .flatMap(Collection::stream)
    .toList();

// [1, 2, 3, 4, 5, 6]
```

---

## 비교

| 구분 | map | flatMap |
|:--:|:--:|:--:|
| 변환 결과 | 단일 값 | 스트림 (0개 이상) |
| 반환 타입 | `Stream<R>` | `Stream<R>` (평탄화됨) |
| 요소 대응 | 1:1 | 1:N |
| 주요 용도 | 값 변환 | 중첩 구조 평탄화 |

---

## Optional에서의 활용

`Optional`에도 `map`과 `flatMap`이 있다. 반환값이 `Optional`인 메서드를 연결할 때 `flatMap`이 필요하다.

```java
Optional<String> name = Optional.of("alice");

// map: 결과가 Optional<Optional<String>>이 될 위험
Optional<Optional<String>> wrong = name.map(n -> Optional.of(n.toUpperCase()));

// flatMap: Optional<String>으로 자동 평탄화
Optional<String> correct = name.flatMap(n -> Optional.of(n.toUpperCase()));
```

---

## Key Point

> **map은 값을 바꾸고, flatMap은 스트림을 펼친다. 중첩이 생기면 flatMap이 필요하다.**

---

## Reference

- [Stream.map — Java Docs](https://docs.oracle.com/en/java/docs/api/java.base/java/util/stream/Stream.html#map(java.util.function.Function))
- [Stream.flatMap — Java Docs](https://docs.oracle.com/en/java/docs/api/java.base/java/util/stream/Stream.html#flatMap(java.util.function.Function))