---
title: "Mockito의 Mock, Stub, Spy"
date: 2026-05-11
last_modified_at: 2026-05-11
categories: [dev, test]
tags: [weekly paper, mockito, mock, stub, spy, unit-test, spring-boot, test-double]
toc: true
comments: true
---

## Summary

- **Mock**은 의존 객체를 가짜로 대체해 호출 여부·횟수 등 **행위를 검증**할 때 쓴다.
- **Stub**은 특정 입력에 대해 원하는 반환값을 미리 지정해 **상태를 검증**할 때 쓴다.
- **Spy**는 실제 객체를 유지하면서 일부 메서드만 가로채야 할 때 쓴다.

---

## Background

단위 테스트를 작성하다 보면 테스트 대상이 의존하는 객체(DB, 외부 API, 다른 서비스)를 실제로 실행하기 어려운 상황이 생긴다.

이때 사용하는 것이 **Test Double**이다. Mockito는 Java/Kotlin 생태계에서 가장 널리 쓰이는 Test Double 라이브러리이며, 대표적인 세 가지 방식이 Mock, Stub, Spy다.

세 개념은 이름이 혼용되는 경우가 많지만, 목적과 사용 방식이 다르다.

---

## Mock

### 개념

Mock은 **의존 객체를 완전한 가짜로 대체**한다. 메서드를 호출해도 아무것도 하지 않고, 기본값(null, 0, false)을 반환한다.

Mock의 핵심 목적은 **행위 검증(behavior verification)** 이다. 테스트 대상이 의존 객체의 특정 메서드를 호출했는지, 몇 번 호출했는지, 어떤 인자로 호출했는지를 확인한다.

### 예시

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private NotificationService notificationService;

    @InjectMocks
    private OrderService orderService;

    @Test
    void 주문_취소_시_알림이_전송된다() {
        Order order = new Order(1L, OrderStatus.PAID);
        given(orderRepository.findById(1L)).willReturn(Optional.of(order));

        orderService.cancel(1L);

        // 행위 검증: notificationService.send()가 정확히 1번 호출됐는지 확인
        verify(notificationService, times(1)).send(order);
    }
}
```

`notificationService`는 실제로 알림을 보내지 않는다. 테스트의 관심사는 "서비스가 취소 시 알림 메서드를 호출하는가"이기 때문이다.

### 언제 쓰는가

- 테스트 대상이 의존 객체를 **올바르게 사용하는지** 확인할 때
- 외부 시스템(이메일, SMS, Slack)처럼 실제 호출이 불가능하거나 부작용이 있는 경우

---

## Stub

### 개념

Stub은 **특정 입력에 대한 반환값을 미리 지정**해두는 방식이다. 의존 객체가 어떤 값을 돌려줄지를 제어하고, 그 결과에 따른 **상태 검증(state verification)** 에 집중한다.

Mockito에서 Mock 객체에 `given(...).willReturn(...)` 또는 `when(...).thenReturn(...)`으로 Stub을 설정한다.

### 예시

```java
@Test
void 재고가_없으면_주문_생성_실패() {
    // Stub: 재고 조회 결과를 0으로 고정
    given(inventoryRepository.findStockById(10L)).willReturn(0);

    assertThatThrownBy(() -> orderService.create(10L, 1))
        .isInstanceOf(OutOfStockException.class);
}

@Test
void 재고가_있으면_주문_생성_성공() {
    given(inventoryRepository.findStockById(10L)).willReturn(5);

    Order result = orderService.create(10L, 1);

    assertThat(result.getProductId()).isEqualTo(10L);
}
```

관심사는 재고 조회 결과에 따라 서비스가 **올바른 상태(반환값·예외)를 내놓는가**이다. `inventoryRepository`가 어떻게 호출됐는지는 검증하지 않는다.

### 언제 쓰는가

- 의존 객체의 **반환값에 따라 동작이 달라지는 로직**을 테스트할 때
- DB 조회, 외부 API 응답처럼 실제 데이터 없이 시나리오를 구성해야 할 때

---

## Spy

### 개념

Spy는 **실제 객체를 감싸** 메서드 호출을 그대로 실행하되, 특정 메서드만 가로채거나 호출 여부를 검증할 수 있다.

Mock은 완전한 가짜지만, Spy는 실제 구현체를 유지하면서 일부만 제어한다.

### 예시

```java
@Test
void 이메일_발송_횟수를_검증한다() {
    EmailService realEmailService = new EmailService(mockSmtpClient);
    EmailService spyEmailService = spy(realEmailService);

    // 실제 메서드는 실행되지만, 특정 메서드는 가로챌 수 있다
    doReturn("test-id-123").when(spyEmailService).generateMessageId();

    spyEmailService.sendWelcomeEmail("user@example.com");

    // 실제 send()가 호출됐는지 검증
    verify(spyEmailService).send(any(), eq("user@example.com"));
}
```

또 다른 활용 예시로, 컬렉션처럼 이미 동작하는 구현체를 대상으로 일부 메서드만 제어하는 경우가 있다.

```java
List<String> list = spy(new ArrayList<>());
doReturn(100).when(list).size(); // size()만 가로챔

list.add("hello"); // 실제로 실행됨
assertThat(list.size()).isEqualTo(100); // 가로챈 값 반환
assertThat(list.get(0)).isEqualTo("hello"); // 실제 동작
```

### 언제 쓰는가

- 실제 로직은 그대로 실행하되 **일부 메서드만 제어**해야 할 때
- 레거시 코드처럼 의존성 주입이 어려운 코드를 테스트할 때
- 내부 메서드 호출 여부를 검증해야 할 때 (단, 이 경우 설계를 먼저 점검하는 것이 좋다)

---

## 비교

| 구분 | 실제 구현 실행 | 주요 목적 | 검증 방식 |
|:--:|:--:|---|---|
| Mock | X | 의존 객체 행위 검증 | `verify()` |
| Stub | X | 반환값 제어, 상태 검증 | `assertThat()` |
| Spy | O (일부 제어 가능) | 실제 구현 유지 + 부분 제어 | 둘 다 가능 |

---

## 선택 가이드

```
의존 객체의 반환값에 따른 로직을 테스트하는가?
    └─ YES → Stub (given().willReturn())

의존 객체의 메서드가 호출됐는지 확인하는가?
    └─ YES → Mock + verify()

실제 구현을 유지하면서 일부만 제어해야 하는가?
    └─ YES → Spy

셋 다 해당 없음 → 의존 객체가 필요 없을 수 있다. 설계를 재검토.
```

실제로 Mock 객체에 Stub을 설정하는 혼합 사용이 가장 흔하다. Mock으로 의존 객체를 대체하고, Stub으로 필요한 반환값을 지정한 뒤, 필요하면 `verify()`로 행위까지 검증한다.

Spy는 실제 구현에 의존하기 때문에 테스트가 내부 구현에 결합된다. 남용하면 리팩토링할 때 테스트가 깨지기 쉽다. 대부분의 경우 Mock + Stub으로 충분하며, Spy는 마지막 수단으로 쓰는 것이 바람직하다.

---

## Key Point

> **Mock은 "호출했는가"를, Stub은 "결과에 따라 올바르게 동작하는가"를 검증한다. Spy는 실제 구현이 필요하면서 일부만 제어할 때 쓰지만, 남용하면 테스트가 구현에 결합되므로 주의해야 한다.**

---

## Reference

- [Mockito Docs](https://site.mockito.org/)
- [Mocks Aren't Stubs — Martin Fowler](https://martinfowler.com/articles/mocksArentStubs.html)
- [Test Double — xUnit Patterns](http://xunitpatterns.com/Test%20Double.html)