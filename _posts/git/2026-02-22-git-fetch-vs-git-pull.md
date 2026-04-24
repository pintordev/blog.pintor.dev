---
title: git fetch vs. git pull
date: 2026-02-22
last_modified_at: 2026-02-22
categories: [git, workflow]
tags: [weekly paper, git, fetch, pull]
toc: true
comments: true
---

## Summary
- **fetch**: 원격 변경 사항을 가져오기만 한다.
- **pull**: 원격 변경 사항을 가져와 즉시 내 브랜치에 반영한다.
- **협업 환경에서는 fetch 후 직접 병합하는 방식이 더 안전하다.**

---

## Context
Git에서 원격 저장소와 동기화할 때 가장 많이 사용하는 명령어가  
`git fetch`와 `git pull`이다.

두 명령어는 비슷해 보이지만  
**작업 흐름에 미치는 영향은 크게 다르다.**

이 차이를 이해하지 못하면
- 예기치 않은 merge 발생
- 작업 중이던 코드와 충돌

같은 문제가 생길 수 있다.

---

## Git Fetch

### 핵심 개념
원격 저장소의 변경 사항을 **로컬로 다운로드만** 한다.  
현재 작업 중인 브랜치에는 **아무런 영향을 주지 않는다.**

    git fetch origin

### 언제 쓰는가
- 작업 중인 변경 사항이 있을 때
- 원격 변경 사항을 먼저 확인하고 싶을 때
- 충돌 가능성이 있는 협업 상황

### 특징
- 매우 안전하다
- 내 브랜치는 그대로 유지된다
- 원격 변경 내용을 사전에 검토할 수 있다

---

## Git Pull

### 핵심 개념
`git pull`은 내부적으로  
**fetch + merge(또는 rebase)** 를 한 번에 수행한다.

    git pull origin main

내부적으로는 다음 작업과 같다.

    git fetch origin
    git merge origin/main

(설정에 따라 `merge` 대신 `rebase`가 사용될 수 있다)

### 언제 쓰는가
- 개인 프로젝트
- 작업 중인 변경 사항이 없을 때
- 빠르게 최신 상태로 맞추고 싶을 때

### 특징
- 즉시 내 브랜치가 변경된다
- 충돌이 발생할 수 있다
- 히스토리가 자동으로 변경된다

---

## Key Differences

| 구분 | fetch | pull |
|:--:|:--:|:--:|
| 원격 변경 다운로드 | O | O |
| 내 브랜치 변경 | X | O |
| 충돌 발생 가능성 | X | O |
| 변경 내용 사전 확인 | O | X |
| 안전성 | 높음 | 상대적으로 낮음 |

---

## When to Use Which

### 협업 환경
- fetch 권장
- 변경 사항 확인 후 merge 또는 rebase

### 단순 동기화
- pull 사용 가능
- 충돌 대응이 가능한 경우에만 사용

---

## One-line Rule
> **확인하고 합치면 fetch,  
> 바로 당기면 pull.**
