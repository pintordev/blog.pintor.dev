---
title: "equals와 hashCode 정리"
date: 2026-11-06
last_modified_at: 2026-11-06
categories: [dev, java]
tags: [study note, computer science, java, equals, hashcode]
toc: true
comments: true
---

## Summary

- `==`는 **동일성(identity)**, 즉 같은 객체를 가리키는지를 비교하고, `equals()`는 **동등성(equality)**, 즉 논리적으로 같은 값인지를 비교한다. `Object`의 기본 `equals()`는 `==`와 똑같이 동작하므로, 값 객체라면 직접 재정의해야 한다
- `equals()`는 반사성·대칭성·추이성·일관성·null-아님 5가지 계약을 지켜야 하며, 구체 클래스를 상속해 필드를 추가하는 순간 이 계약을 지키면서 `equals()`를 확장할 방법은 없다 — 상속 대신 컴포지션을 쓴다
- **equals가 같으면 hashCode도 같아야 한다.** 이 계약을 어기면 `HashMap`/`HashSet`이 hashCode로 버킷을 먼저 찾기 때문에, `equals()`가 true인 객체를 넣어도 찾지 못한다
- `Object.hashCode()`는 메모리 주소가 아니다 — HotSpot은 스레드 로컬 난수(xor-shift)로 만든 identity hash를 객체 헤더(mark word)에 저장해두고 재사용한다
- 해시 컬렉션의 키는 불변이어야 하고, JPA 엔티티는 프록시·지연 로딩·id 할당 시점 때문에 `instanceof` + getter + 고정 hashCode 패턴을 쓴다

---

## 동일성 vs 동등성

```java
String a = new String("hello");
String b = new String("hello");

a == b;        // false — 서로 다른 객체
a.equals(b);   // true  — 값이 같음
```

| 구분 | 연산 | 비교 대상 | 기본 동작 |
|---|---|---|---|
| 동일성(identity) | `==` | 참조(같은 객체인가) | 재정의 불가 |
| 동등성(equality) | `equals()` | 논리적 값(같은 의미인가) | `Object`는 `==`로 구현 |

```java
// java.lang.Object
public boolean equals(Object obj) {
    return (this == obj);
}
```

**언제 재정의하지 않아도 되는가?** Effective Java Item 10은 다음 경우엔 재정의하지 않는 게 최선이라고 말한다.

- 각 인스턴스가 본질적으로 고유하다 — `Thread`처럼 값이 아니라 동작하는 개체를 표현하는 클래스
- 논리적 동치성을 검사할 일이 없다 — `java.util.regex.Pattern`
- 상위 클래스의 `equals()`가 하위 클래스에도 딱 맞는다 — `AbstractList`를 상속한 `List` 구현체들
- 인스턴스 통제 클래스 — `enum`, 싱글턴처럼 값이 같은 인스턴스가 둘 이상 만들어지지 않으면 `==`와 `equals()`가 같은 의미다

반대로 **값 객체**(`Money`, `Point`, `Email` 등)처럼 "객체가 같은가"가 아니라 "값이 같은가"를 알고 싶은 클래스는 재정의해야 한다.

---

## equals의 5가지 계약

`Object.equals()` Javadoc이 명시하는 계약이다. null이 아닌 모든 참조 x, y, z에 대해:

| 계약 | 정의 | 대표 위반 사례 |
|---|---|---|
| 반사성(reflexive) | `x.equals(x)`는 true | 일부러 어기기도 어렵다 |
| 대칭성(symmetric) | `x.equals(y)` ⇔ `y.equals(x)` | 다른 타입과 상호운용하려는 `equals` |
| 추이성(transitive) | `x.equals(y)` && `y.equals(z)` ⇒ `x.equals(z)` | 상속으로 필드를 추가한 하위 클래스 |
| 일관성(consistent) | 객체가 바뀌지 않으면 반복 호출 결과가 같다 | `java.net.URL` |
| null-아님(non-null) | `x.equals(null)`은 false | NPE를 던지는 `equals` |

### 대칭성 위반

```java
public final class CaseInsensitiveString {
    private final String s;

    @Override
    public boolean equals(Object o) {
        if (o instanceof CaseInsensitiveString cis)
            return s.equalsIgnoreCase(cis.s);
        if (o instanceof String str)        // String과도 비교하려는 욕심
            return s.equalsIgnoreCase(str);
        return false;
    }
}

CaseInsensitiveString cis = new CaseInsensitiveString("Polish");
String s = "polish";

cis.equals(s);  // true
s.equals(cis);  // false — String은 CaseInsensitiveString을 모른다
```

`CaseInsensitiveString`은 `String`을 알지만 `String`은 `CaseInsensitiveString`을 모른다. 이 객체를 `List`에 넣고 `list.contains(s)`를 호출하면 구현체가 `s.equals(e)`를 쓰는지 `e.equals(s)`를 쓰는지에 따라 결과가 달라진다. **`equals`는 같은 타입끼리만 비교한다**가 해법이다.

### 추이성 위반 — 상속과 equals

```java
class Point {
    final int x, y;

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof Point p)) return false;
        return x == p.x && y == p.y;
    }
}

class ColorPoint extends Point {
    final Color color;
    // color까지 비교하도록 equals를 재정의하면?
}
```

`ColorPoint`가 색상까지 비교하도록 `equals()`를 재정의하면 두 갈래 모두 막힌다.

| 시도 | 결과 |
|---|---|
| `ColorPoint`끼리만 색상 비교, `Point`와는 false | 대칭성 위반: `point.equals(cp)`는 true, `cp.equals(point)`는 false |
| `Point`와 비교할 땐 색상 무시 | 추이성 위반: `red(1,2) == point(1,2) == blue(1,2)`인데 `red != blue` |
| `instanceof` 대신 `getClass()` 비교 | 리스코프 치환 원칙 위반: `Point`의 하위 타입이 `Point`로 취급되지 못함 |

결론은 **구체 클래스를 확장해 새 값을 추가하면서 `equals` 계약을 지킬 방법은 존재하지 않는다**는 것이다. 해법은 컴포지션이다.

```java
public final class ColorPoint {
    private final Point point;   // 상속 대신 필드로 보유
    private final Color color;

    public Point asPoint() { return point; }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof ColorPoint cp)) return false;
        return point.equals(cp.point) && color.equals(cp.color);
    }
}
```

JDK에도 이 함정에 빠진 클래스가 있다. `java.sql.Timestamp`는 `java.util.Date`를 상속하고 나노초 필드를 추가했는데, 그 결과 `date.equals(timestamp)`와 `timestamp.equals(date)`의 결과가 다르다. Javadoc에 "섞어 쓰지 말라"는 경고가 붙어 있다.

> 추상 클래스의 하위 클래스라면 이야기가 다르다. 상위 클래스의 인스턴스를 직접 만들 수 없으니 위의 비교 상황 자체가 생기지 않는다.

### 일관성 위반

`java.net.URL.equals()`는 호스트 이름을 **IP 주소로 DNS 조회**해서 비교한다. 네트워크 상태나 DNS 결과에 따라 같은 두 URL의 비교 결과가 바뀔 수 있고, `equals()` 호출이 블로킹 I/O가 된다. `equals()`는 메모리에 있는 객체만으로 결정적인 계산을 해야 한다 — `URL` 대신 `URI`를 쓰는 이유 중 하나다.

---

## 올바른 equals 구현

```java
@Override
public boolean equals(Object o) {
    if (this == o) return true;                       // 1. 자기 자신이면 바로 true (성능)
    if (!(o instanceof PhoneNumber pn)) return false; // 2. 타입 확인 — null도 여기서 걸러짐
    return areaCode == pn.areaCode                    // 3. 핵심 필드 비교
            && prefix == pn.prefix
            && lineNum == pn.lineNum;
}
```

**체크리스트**

- **파라미터 타입은 반드시 `Object`** — `equals(PhoneNumber o)`라고 쓰면 재정의가 아니라 오버로딩이 되어 컬렉션에서 호출되지 않는다. `@Override`를 붙이면 컴파일러가 잡아준다
- **`instanceof`는 null이면 false** — 별도의 null 체크가 필요 없다
- **필드 타입별 비교 방법**

| 필드 타입 | 비교 방법 | 이유 |
|---|---|---|
| `float`/`double` 이외 기본형 | `==` | |
| `float`/`double` | `Float.compare()`, `Double.compare()` | `NaN`, `-0.0` 같은 특수값 처리 |
| 참조 타입 | `equals()` | |
| null 가능한 참조 | `Objects.equals(a, b)` | NPE 방지 |
| 배열 | `Arrays.equals()` / `Arrays.deepEquals()` | 배열의 `equals()`는 `==`다 |

**왜 double을 `==`로 비교하면 안 되는가?**

```java
Double.NaN == Double.NaN;                 // false — IEEE 754 규칙
Double.valueOf(Double.NaN).equals(Double.NaN); // true

0.0 == -0.0;                              // true
Double.valueOf(0.0).equals(-0.0);         // false
```

`==`로 비교하면 `NaN` 필드를 가진 객체는 자기 자신과도 같지 않아 반사성이 깨진다. `Double.compare()`는 비트 표현 기준으로 비교해 `Double.equals()`와 같은 결과를 낸다.

- **비교 순서** — 다를 가능성이 크거나 비교 비용이 싼 필드부터 비교하면 성능이 좋아진다. 캐시해둔 파생 필드(`hashCode` 캐시 등)는 비교할 필요 없다

---

## hashCode의 3가지 계약

| 계약 | 의미 |
|---|---|
| 일관성 | `equals` 비교에 쓰이는 정보가 바뀌지 않으면, 애플리케이션 실행 동안 hashCode는 항상 같은 값이다 (실행이 달라지면 달라도 됨) |
| **equals → hashCode 일치** | `x.equals(y)`가 true면 `x.hashCode() == y.hashCode()` |
| 역은 성립하지 않아도 됨 | `x.equals(y)`가 false여도 hashCode는 같을 수 있다(해시 충돌). 다만 다를수록 해시 테이블 성능이 좋아진다 |

### equals만 재정의하면 생기는 일

```java
Map<PhoneNumber, String> m = new HashMap<>();
m.put(new PhoneNumber(707, 867, 5309), "제니");

m.get(new PhoneNumber(707, 867, 5309));  // null!
```

두 `PhoneNumber`는 `equals()`로는 같지만, `hashCode()`는 `Object`의 기본 구현(identity hash)이라 서로 다르다. `HashMap.get()`은 이렇게 동작한다.

```
1. key.hashCode() → 해시 보정 → 버킷 인덱스 계산
2. 해당 버킷의 노드들 중 hash가 같은 것만 골라
3. equals()로 최종 확인
```

hashCode가 다르면 **1단계에서 아예 다른 버킷을 보거나, 같은 버킷이더라도 2단계의 hash 비교에서 걸러져** `equals()`까지 가지 못한다. `HashSet`에서는 같은 값이 중복 저장된다. 그래서 **equals를 재정의하면 hashCode도 반드시 재정의**해야 한다. (HashMap의 버킷 구조와 해시 보정은 [Java Collection Framework 정리](/dev/java-collection-framework) 참고)

### 반대 방향: 모든 객체가 같은 hashCode를 반환하면?

```java
@Override
public int hashCode() { return 42; }  // 계약은 지킨다
```

계약 위반은 아니다. 하지만 모든 키가 한 버킷에 몰려 `HashMap`이 사실상 연결 리스트가 되고, 조회가 O(1)에서 O(n)으로(treeify 후에도 O(log n)) 떨어진다. **합법이지만 최악의 구현**이다.

---

## 좋은 hashCode 구현

### 31을 곱하는 전형적인 방법

```java
@Override
public int hashCode() {
    int result = Short.hashCode(areaCode);
    result = 31 * result + Short.hashCode(prefix);
    result = 31 * result + Short.hashCode(lineNum);
    return result;
}
```

`equals` 비교에 사용한 핵심 필드만 쓰고, `equals`에 쓰지 않은 필드는 **반드시 제외**한다(계약 2 위반 가능). 곱셈을 하는 이유는 필드 순서를 결과에 반영하기 위해서다 — 단순히 더하기만 하면 `(1, 2)`와 `(2, 1)`이 같은 해시를 갖는다.

**왜 하필 31인가?**

- **홀수**: 짝수를 곱하면 곱할 때마다 하위 비트에 0이 채워지고, 오버플로 시 정보가 왼쪽으로 밀려 사라진다
- **소수**: 전통적으로 분산이 좋다고 여겨진다(명확한 근거보다는 관례에 가깝다)
- **최적화**: `31 * i == (i << 5) - i`라 JIT가 곱셈을 시프트와 뺄셈으로 바꿀 수 있다

`String.hashCode()`도 같은 공식이다: `s[0]*31^(n-1) + s[1]*31^(n-2) + ... + s[n-1]`.

### Objects.hash()

```java
@Override
public int hashCode() {
    return Objects.hash(areaCode, prefix, lineNum);
}
```

한 줄로 끝나고 내부적으로 위의 31 공식(`Arrays.hashCode`)을 그대로 쓴다. 단, **가변 인자라 호출마다 배열을 만들고, 기본형은 박싱**된다. 대부분은 문제없지만 성능에 민감한 핫 패스라면 직접 구현하는 편이 낫다.

### 해시 캐싱

불변 객체이고 해시 계산 비용이 크다면 처음 호출될 때 계산해 필드에 저장해둘 수 있다.

```java
private int hashCode; // 0으로 자동 초기화

@Override
public int hashCode() {
    int result = hashCode;
    if (result == 0) {
        result = Short.hashCode(areaCode);
        result = 31 * result + Short.hashCode(prefix);
        result = 31 * result + Short.hashCode(lineNum);
        hashCode = result;
    }
    return result;
}
```

`String`이 정확히 이 방식(lazy caching)을 쓴다. 계산된 해시가 진짜 0인 경우 매번 재계산하는 문제를 막으려고 JDK 13부터는 `hashIsZero` 플래그도 함께 둔다. 멀티스레드에서 동시에 계산돼도 결과가 같은 값이라 동기화 없이 안전하다(racy single-check idiom).

---

## Object.hashCode()의 실체

"`Object.hashCode()`는 객체의 메모리 주소를 반환한다"는 설명은 **틀렸다**. 최신 Javadoc도 "어느 시점의 메모리 주소의 함수로 구현될 수도, 아닐 수도 있다(may or may not)"고만 표현한다.

- GC가 객체를 이동시키면(compaction) 주소가 바뀌는데, hashCode는 일관성 계약 때문에 바뀌면 안 된다
- HotSpot의 기본 구현(`-XX:hashCode=5`, JDK 8부터 기본값)은 **스레드 로컬 상태를 쓰는 Marsaglia xor-shift 난수**다
- 최초 호출 시 한 번 생성해 객체 헤더의 **mark word**에 저장하고, 이후 호출은 저장된 값을 꺼내 쓴다 (JVM 객체 헤더 구조는 [JVM 구조와 동작 원리 정리](/dev/jvm) 참고)

**identity hash와 락의 관계** — mark word는 락 상태 정보와 hash를 함께 담는 공간이라, identity hash가 한 번 계산된 객체는 편향 락(biased locking)을 쓸 수 없었다. 편향 락은 JDK 15에서 기본 비활성화(JEP 374)된 뒤 제거되어 지금은 신경 쓸 일이 거의 없다.

`hashCode()`를 재정의한 객체의 원래 identity hash가 필요하면 `System.identityHashCode(obj)`를 쓴다. `IdentityHashMap`이 이를 이용해 `equals()` 대신 `==`로 키를 비교한다.

---

## 가변 객체와 해시 컬렉션

```java
Set<Point> set = new HashSet<>();
MutablePoint p = new MutablePoint(1, 2);
set.add(p);

p.setX(10);          // hashCode가 바뀜

set.contains(p);     // false — 새 hashCode로 다른 버킷을 찾음
set.size();          // 1 — 원래 버킷에 남아 있지만 꺼낼 방법이 없다 (사실상 누수)
```

`equals`/`hashCode`에 쓰이는 필드가 바뀌면 객체는 **처음 저장된 버킷에 그대로 남아 있는데 조회는 새 해시로 다른 버킷을 본다.** `remove(p)`도 실패하므로 메모리 누수로 이어진다.

- 해시 컬렉션의 키/원소로는 **불변 객체**를 쓴다
- 가변 객체를 꼭 넣어야 한다면, 컬렉션에 들어 있는 동안에는 `equals`/`hashCode`에 관여하는 필드를 바꾸지 않는다

---

## compareTo와 equals의 일관성

`Comparable.compareTo()`가 0을 반환하는 것과 `equals()`가 true인 것이 일치하지 않으면, 해시 기반 컬렉션과 정렬 기반 컬렉션의 동작이 달라진다.

```java
BigDecimal a = new BigDecimal("1.0");
BigDecimal b = new BigDecimal("1.00");

a.equals(b);     // false — scale까지 비교
a.compareTo(b);  // 0     — 수치만 비교

new HashSet<>(List.of(a, b)).size();  // 2 — equals/hashCode 기준
new TreeSet<>(List.of(a, b)).size();  // 1 — compareTo 기준
```

`TreeSet`/`TreeMap`은 `equals()`를 전혀 호출하지 않고 `compareTo()`(또는 `Comparator`)만으로 동등성을 판단한다. 강제 사항은 아니지만, 일치시키지 못한다면 `BigDecimal`처럼 문서에 명시해야 한다.

---

## record와 Lombok

### record (Java 16+)

```java
public record PhoneNumber(short areaCode, short prefix, short lineNum) {}
```

컴포넌트 전체를 비교하는 `equals()`와, 컴포넌트로 계산한 `hashCode()`가 자동 생성된다. 값 객체라면 가장 깔끔한 선택이다. 단:

- **배열 컴포넌트는 참조 비교**다 — `record Data(int[] values)`는 내용이 같아도 `equals()`가 false. 필요하면 직접 재정의한다
- 컴포넌트 중 가변 객체가 있으면 위의 "가변 객체" 문제가 그대로 생긴다

### Lombok

| 어노테이션 | 주의점 |
|---|---|
| `@EqualsAndHashCode` | 하위 클래스에서 기본값 `callSuper = false`라 **상위 클래스 필드가 비교에서 빠진다** |
| `@Data` | `@EqualsAndHashCode` + `@ToString` 등을 포함 — 양방향 연관관계가 있으면 서로의 `hashCode()`를 호출하다 **StackOverflowError** |
| `@EqualsAndHashCode.Include` / `onlyExplicitlyIncluded` | 비교 필드를 명시적으로 고를 수 있어 엔티티에서 안전 |

---

## JPA 엔티티의 equals/hashCode

엔티티는 일반 값 객체와 달리 세 가지 복병이 있다.

**1. 프록시** — 지연 로딩 시 Hibernate는 엔티티를 **상속한 프록시 클래스**를 돌려준다.

- `getClass() != o.getClass()`로 비교하면 프록시와 실제 엔티티가 항상 다르다고 판단된다 → `instanceof`를 쓴다
- 프록시의 필드는 초기화되지 않은 상태라 `o.id`로 직접 접근하면 null이다 → **getter**(`o.getId()`)로 접근해야 프록시가 초기화되거나 식별자를 돌려준다

**2. id 할당 시점** — `@GeneratedValue`를 쓰면 `persist` 전에는 id가 null이다.

- `Objects.hash(id)`를 쓰면 저장 전후로 hashCode가 바뀌어, 저장 전에 `HashSet`에 넣은 엔티티를 저장 후 찾지 못한다
- 저장 전 엔티티 두 개가 id null끼리 같다고 판단되면 안 된다

**3. 지연 로딩 연관관계** — `@Data`처럼 모든 필드를 비교하면 `equals()` 호출만으로 연관 엔티티 쿼리가 나가고(N+1), 양방향이면 무한 재귀에 빠진다.

이를 모두 고려한 일반적인 패턴:

```java
@Entity
public class Member {
    @Id @GeneratedValue
    private Long id;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Member other)) return false;   // 프록시 대응
        return id != null && id.equals(other.getId());    // 저장 전엔 자기 자신만 같음
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();  // 저장 전후로 변하지 않는 고정값
    }
}
```

hashCode를 클래스 단위 상수로 두면 같은 타입 엔티티가 한 버킷에 몰리지만, 한 영속성 컨텍스트 안에서 해시 컬렉션에 담기는 엔티티 수는 보통 크지 않아 실용적인 타협으로 받아들여진다. 자연 키(natural key, 예: 주민번호·이메일처럼 불변이고 유일한 비즈니스 키)가 있다면 그 필드로 `equals`/`hashCode`를 구현하는 것이 가장 깔끔하다.

> 같은 영속성 컨텍스트 안에서는 1차 캐시가 같은 id의 엔티티를 같은 인스턴스로 보장하므로 `==`만으로도 충분하다. equals 재정의가 필요해지는 건 준영속 엔티티나 여러 영속성 컨텍스트에서 가져온 엔티티를 섞어 비교할 때다. (영속성 컨텍스트는 [JPA 영속성 컨텍스트 정리](/dev/jpa-persistence-context) 참고)

---

## Reference

- [Java SE 21 API — Object](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Object.html)
- [Java SE 21 API — Comparable](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Comparable.html)
- [JEP 395: Records](https://openjdk.org/jeps/395)
- [JEP 374: Deprecate and Disable Biased Locking](https://openjdk.org/jeps/374)
- [Vlad Mihalcea — How to implement equals and hashCode using the JPA entity identifier](https://vladmihalcea.com/how-to-implement-equals-and-hashcode-using-the-jpa-entity-identifier/)
- Joshua Bloch, *Effective Java 3rd Edition* — Item 10 (equals), Item 11 (hashCode), Item 14 (Comparable)
