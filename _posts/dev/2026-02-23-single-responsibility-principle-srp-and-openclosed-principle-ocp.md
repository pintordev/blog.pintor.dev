---
title: Single Responsibility Principle (SRP) and Open–Closed Principle (OCP)
date: 2026-02-23
last_modified_at: 2026-02-23
categories: [dev, design]
tags: [weekly paper, solid, srp, ocp, oop, design-principles, clean-code]
toc: true
comments: true
---

## Summary
- **SRP**: 클래스는 **하나의 이유로만** 변경되어야 한다.
- **OCP**: 코드는 **확장에는 열려** 있고, **수정에는 닫혀** 있어야 한다.
- 두 원칙 모두 **변경의 영향 범위를 최소화**하는 것이 목적이다.

---

## Context

객체지향 설계의 5가지 원칙, **SOLID** 중 첫 두 가지가 SRP와 OCP다.

코드를 처음 작성할 때는 동작만 맞추면 그만이지만,
시간이 지나 **요구사항이 바뀌면** 문제가 드러난다.

- 하나를 고쳤더니 다른 기능이 깨지거나
- 새 기능을 추가하려면 기존 코드를 대거 수정해야 하거나

이런 상황이 반복된다면, SRP와 OCP를 위반하고 있을 가능성이 높다.

---

## Single Responsibility Principle (SRP)

### 핵심 개념
> **"A class should have only one reason to change."**

클래스가 변경되는 이유가 두 가지 이상이라면, 그 클래스는 두 가지 이상의 책임을 지고 있다는 신호다.

### 위반 예시

```java
class Report {
    public String generate() {
        // 리포트 내용 생성
    }

    public void saveToFile(String path) {
        // 파일로 저장
    }

    public void sendByEmail(String address) {
        // 이메일로 전송
    }
}
```

- `generate()` → 리포트 포맷이 바뀌면 수정
- `saveToFile()` → 저장 방식이 바뀌면 수정
- `sendByEmail()` → 이메일 전송 정책이 바뀌면 수정

변경 이유가 3가지 → SRP 위반

### 개선 예시

```java
class ReportGenerator {
    public String generate() { /* ... */ return null; }
}

class ReportFileSaver {
    public void save(String content, String path) { /* ... */ }
}

class ReportEmailSender {
    public void send(String content, String address) { /* ... */ }
}
```

각 클래스는 하나의 이유로만 변경된다.

### 핵심 체크
- 이 클래스를 바꾸게 만드는 이유가 몇 가지인가?
- 두 가지 이상이면 책임을 분리할 시점이다.

---

## Open–Closed Principle (OCP)

### 핵심 개념
> **"Software entities should be open for extension, but closed for modification."**

새로운 기능을 추가할 때 **기존 코드를 수정하지 않고** 확장만으로 해결할 수 있어야 한다.

### 위반 예시

```java
class DiscountCalculator {
    public double calculate(String memberType, double price) {
        if (memberType.equals("GOLD")) {
            return price * 0.8;
        } else if (memberType.equals("SILVER")) {
            return price * 0.9;
        }
        return price;
    }
}
```

새 회원 등급이 추가될 때마다 `calculate()` 메서드를 직접 수정해야 한다 → OCP 위반

### 개선 예시

```java
interface DiscountPolicy {
    double apply(double price);
}

class GoldDiscount implements DiscountPolicy {
    public double apply(double price) { return price * 0.8; }
}

class SilverDiscount implements DiscountPolicy {
    public double apply(double price) { return price * 0.9; }
}

class DiscountCalculator {
    public double calculate(DiscountPolicy policy, double price) {
        return policy.apply(price);
    }
}
```

새 등급은 새 클래스를 추가하면 되고, 기존 코드는 건드리지 않는다.

### 핵심 체크
- 요구사항이 바뀔 때마다 기존 메서드를 수정하고 있는가?
- 조건문(`if/else`, `switch`)이 계속 늘어나고 있는가?

---

## Key Differences

| 구분 | SRP | OCP |
|:--:|:--:|:--:|
| 관심사 | 책임의 분리 | 변경의 격리 |
| 질문 | 이 클래스가 왜 바뀌는가? | 기존 코드를 수정하지 않아도 되는가? |
| 주요 수단 | 클래스 분리 | 추상화, 인터페이스 |
| 위반 신호 | 하나의 클래스에 여러 관심사 혼재 | 기능 추가 시 기존 코드 수정 |

---

## 두 원칙의 관계

SRP와 OCP는 서로를 강화한다.

- SRP를 지키면 클래스가 작아지고, 변경 이유가 명확해진다.
- 변경 이유가 명확하면 어디를 확장해야 할지 보인다.
- 확장 지점이 명확하면 OCP를 적용하기 쉬워진다.

즉, **SRP는 OCP를 위한 기반**이 된다.

---

## One-line Rule
> **책임은 하나로 나누고(SRP),
> 새 기능은 추가로 해결한다(OCP).**