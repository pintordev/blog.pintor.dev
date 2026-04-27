---
title: "O(n)과 O(log n)의 성능 차이"
date: 2026-03-02
last_modified_at: 2026-03-02
categories: [dev, java]
tags: [algorithm, time-complexity, big-o, binary-search, data-structure]
toc: true
comments: true
---

## Summary

- **O(n)**: 데이터가 N개면 최대 N번 연산. 데이터 크기에 **비례**해서 증가.
- **O(log n)**: 매 단계마다 탐색 범위가 절반씩 줄어든다. 데이터가 1백만 개여도 약 **20번**이면 충분하다.
- 1백만 개 기준: O(n) ≈ 1,000,000번 vs O(log n) ≈ 20번.

---

## Background

알고리즘의 성능을 이야기할 때 Big-O 표기법이 자주 등장한다. 그 중 O(n)과 O(log n)의 차이는 작은 데이터에서는 별로 안 느껴지지만, 데이터가 커질수록 압도적인 차이가 난다.

---

## O(n): 선형 탐색

데이터를 처음부터 하나씩 확인하는 방식이다. 최악의 경우 N개를 전부 봐야 한다.

### 실생활 예시

전화번호부에서 "홍길동"을 찾는데 **첫 페이지부터 한 명씩 순서대로** 확인하는 것.

1000명 중에 있다면 최대 1000번, 100만 명이면 최대 100만 번 확인해야 한다.

```java
// 선형 탐색: O(n)
public int linearSearch(int[] arr, int target) {
    for (int i = 0; i < arr.length; i++) {
        if (arr[i] == target) return i;
    }
    return -1;
}
```

---

## O(log n): 이진 탐색

**정렬된 데이터**에서 중간값과 비교해 탐색 범위를 절반씩 줄여나가는 방식이다.

### 실생활 예시

전화번호부에서 "홍길동"을 찾는데 **중간 페이지를 펼쳐** "ㅎ"보다 앞이면 뒤쪽 절반 버리고, 뒤면 앞쪽 절반 버리는 것을 반복하는 것.

1000명이어도 10번, 100만 명이어도 20번이면 찾을 수 있다.

```java
// 이진 탐색: O(log n)
public int binarySearch(int[] arr, int target) {
    int left = 0, right = arr.length - 1;
    while (left <= right) {
        int mid = (left + right) / 2;
        if (arr[mid] == target) return mid;
        else if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}
```

---

## 데이터 1백만 개 비교

log₂(1,000,000) ≈ 19.93 → 약 20번

| 데이터 크기 | O(n) | O(log n) |
|:--:|:--:|:--:|
| 1,000 | 1,000번 | 10번 |
| 10,000 | 10,000번 | 14번 |
| 100,000 | 100,000번 | 17번 |
| 1,000,000 | 1,000,000번 | 20번 |
| 1,000,000,000 | 1,000,000,000번 | 30번 |

데이터가 1000배 늘어날 때 O(n)은 1000배 느려지지만, O(log n)은 고작 10번 정도 더 필요하다.

---

## 왜 log n인가

이진 탐색은 매 단계마다 범위가 절반으로 줄어든다.

```
1,000,000 → 500,000 → 250,000 → ... → 1
```

몇 번 반복하면 1이 되는지가 곧 log₂(N)이다.

N = 1,000,000일 때 2^20 = 1,048,576 ≈ 1,000,000 이므로 약 20번.

---

## Key Point

> **O(n)은 데이터 크기만큼 연산이 필요하고, O(log n)은 데이터가 백만 개여도 20번이면 된다. 이진 탐색이 가능한 구조라면 O(log n)을 적극 활용한다.**

---

## Reference

- [Binary Search — Wikipedia](https://en.wikipedia.org/wiki/Binary_search_algorithm)
- [Big O Notation — Khan Academy](https://www.khanacademy.org/computing/computer-science/algorithms/asymptotic-notation/a/big-o-notation)