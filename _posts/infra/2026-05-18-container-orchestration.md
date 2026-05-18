---
title: "컨테이너 오케스트레이션"
date: 2026-05-18
last_modified_at: 2026-05-18
categories: [infra, container]
tags: [weekly paper, container, docker, kubernetes, orchestration, auto-scaling, self-healing, declarative]
toc: true
comments: true
---

## Summary

- **컨테이너 오케스트레이션**: 다수의 컨테이너를 자동으로 배포·운영·확장·복구하는 시스템.
- Docker 단독으로는 단일 호스트에서의 수동 운영만 가능하다.
- 오케스트레이션이 해결하는 핵심 문제: **자동 확장**, **자가 복구**, **선언적 인프라**.

---

## Background

컨테이너 하나를 띄우는 건 간단하다. 문제는 서비스 규모가 커질 때다.

마이크로서비스 아키텍처에서는 수십~수백 개의 컨테이너가 동시에 실행된다. 트래픽이 몰리면 특정 서비스를 더 띄워야 하고, 컨테이너가 죽으면 다시 살려야 하고, 여러 서버에 걸쳐 배포해야 한다. Docker CLI로 이걸 수동으로 관리하면 운영자가 먼저 쓰러진다.

컨테이너 오케스트레이션은 이 복잡성을 자동화한다.

---

## Docker 단독 사용의 한계

Docker만으로 운영하는 환경의 제약을 구체적으로 보면:

```bash
# 수동으로 컨테이너 실행
docker run -d --name app-1 -p 8081:8080 my-app
docker run -d --name app-2 -p 8082:8080 my-app
docker run -d --name app-3 -p 8083:8080 my-app

# 죽은 컨테이너 확인 후 수동 재시작
docker ps -a
docker start app-2
```

- 단일 호스트: 한 서버에서만 동작
- 수동 확장: 컨테이너 증설을 사람이 직접 실행
- 수동 복구: 장애를 모니터링하고 재시작하는 것도 사람의 몫
- 명령형 조작: 원하는 상태가 아닌 수행할 명령을 일일이 입력

---

## 컨테이너 오케스트레이션의 핵심 기능

### 1. 자동 확장 (Auto Scaling)

트래픽 증가에 따라 컨테이너 수를 자동으로 늘리고, 트래픽이 줄면 줄인다.

**Docker 단독**: 수동으로 `docker run`을 추가 실행해야 한다. CPU가 90%여도 알아서 늘어나지 않는다.

**오케스트레이션(Kubernetes)**: HPA(Horizontal Pod Autoscaler)가 메트릭을 감시하다가 임계치를 넘으면 자동으로 파드를 증설한다.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

CPU 사용률이 70%를 넘으면 최대 10개까지 자동으로 늘어나고, 내려가면 다시 줄어든다.

---

### 2. 자가 복구 (Self-Healing)

컨테이너가 죽거나 노드가 장애를 일으켜도 시스템이 스스로 복구한다.

**Docker 단독**: 컨테이너가 종료되면 그냥 죽은 채로 남는다. `--restart=always` 옵션으로 재시작은 가능하지만, 노드 자체가 죽으면 대응 방법이 없다.

**오케스트레이션(Kubernetes)**: 컨트롤 플레인이 지속적으로 클러스터 상태를 감시한다.

- 파드가 죽으면 → 같은 노드에서 즉시 재생성
- 노드가 죽으면 → 다른 노드에 파드를 재스케줄링
- 헬스 체크 실패 → 해당 파드를 교체하고 트래픽에서 제외

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 3
```

`/health` 엔드포인트가 3번 연속 실패하면 파드를 자동으로 재시작한다.

---

### 3. 선언적 인프라 (Declarative Infrastructure)

"어떻게 실행할지"가 아니라 "어떤 상태여야 하는지"를 선언한다. 오케스트레이터가 현재 상태와 목표 상태의 차이를 계속 reconcile한다.

**Docker 단독 (명령형)**:

```bash
# 버전 업데이트 시 수동으로 하나씩 교체
docker stop app-1 && docker rm app-1
docker run -d --name app-1 my-app:v2
docker stop app-2 && docker rm app-2
docker run -d --name app-2 my-app:v2
```

명령을 순서대로 직접 실행해야 한다. 중간에 실패하면 일부는 v1, 일부는 v2인 상태가 된다.

**오케스트레이션(Kubernetes) (선언형)**:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    spec:
      containers:
        - name: app
          image: my-app:v2   # 버전만 바꾸면 끝
```

`kubectl apply -f deployment.yaml`을 실행하면 Kubernetes가 롤링 업데이트로 파드를 순차 교체한다. 실패하면 자동 롤백도 가능하다.

선언적 방식의 핵심은 **GitOps**로 이어진다. YAML 파일이 곧 인프라 상태이므로, Git에서 관리하고 PR로 변경을 리뷰할 수 있다.

---

## 주요 오케스트레이션 도구

| 도구 | 특징 |
|---|---|
| **Kubernetes** | 사실상 표준. CNCF 프로젝트, 대규모 운영에 적합 |
| **Docker Swarm** | Docker에 내장된 오케스트레이터. 단순하지만 기능 제한적 |
| **Nomad** | HashiCorp. 컨테이너 외 일반 프로세스도 오케스트레이션 가능 |
| **ECS** | AWS 관리형 컨테이너 오케스트레이션 서비스 |

현재 사실상 Kubernetes가 표준으로 자리 잡았다.

---

## Key Point

> **Docker는 단일 호스트에서 컨테이너를 실행하는 도구이고, 오케스트레이션은 다수의 호스트에 걸쳐 컨테이너를 자율적으로 관리하는 시스템이다. 자동 확장으로 트래픽 변화에 대응하고, 자가 복구로 장애를 자동 처리하며, 선언적 인프라로 운영 복잡성을 코드로 관리한다. 이 세 가지가 프로덕션 환경에서 오케스트레이션이 필수인 이유다.**

---

## Reference

- [Kubernetes Docs — HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [Kubernetes Docs — Self-Healing](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)
- [Kubernetes Docs — Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)