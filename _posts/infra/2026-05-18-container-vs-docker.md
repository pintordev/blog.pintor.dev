---
title: "컨테이너 기술과 Docker"
date: 2026-05-18
last_modified_at: 2026-05-18
categories: [infra, container]
tags: [weekly paper, container, docker, lxc, podman, containerd, linux, namespace, cgroups]
toc: true
comments: true
---

## Summary

- **컨테이너 기술**: 리눅스 커널 기능(namespace, cgroups)을 활용해 프로세스를 격리하는 개념. Docker 이전부터 존재했다.
- **Docker**: 컨테이너 기술을 구현한 도구 중 하나. 복잡한 컨테이너 조작을 단순화해 대중화에 성공했다.
- Docker 외에도 Podman, containerd, LXC 등 다양한 컨테이너 런타임이 존재한다.

---

## Background

컨테이너의 핵심 아이디어는 **프로세스 격리**다. 하나의 OS 위에서 여러 프로세스가 서로 독립된 환경을 갖도록 만드는 것이다.

이 개념은 1979년 Unix의 `chroot`에서 시작됐다. `chroot`는 프로세스의 루트 디렉토리를 변경해 파일 시스템 접근을 제한했다. 이후 2000년대 초 FreeBSD의 `jail`, Solaris의 `Zones`가 등장하며 격리 범위가 넓어졌다.

Linux에서는 2006년 **cgroups**(Control Groups), 2008년 **LXC**(Linux Containers)가 등장했다. Docker는 2013년에 나왔다. 즉, 컨테이너 기술은 Docker가 만든 것이 아니다.

---

## 컨테이너 기술의 핵심 메커니즘

컨테이너는 두 가지 리눅스 커널 기능 위에 동작한다.

### Namespace — 격리

프로세스가 볼 수 있는 시스템 자원의 범위를 제한한다.

| Namespace | 격리 대상 |
|---|---|
| `pid` | 프로세스 ID |
| `net` | 네트워크 인터페이스, IP |
| `mnt` | 파일 시스템 마운트 포인트 |
| `uts` | 호스트명 |
| `ipc` | IPC 자원 (공유 메모리 등) |
| `user` | 사용자/그룹 ID |

### cgroups — 자원 제한

프로세스가 사용할 수 있는 CPU, 메모리, I/O의 상한을 설정한다.

```
# 특정 프로세스의 메모리를 512MB로 제한
memory.limit_in_bytes = 536870912
```

컨테이너는 namespace로 "무엇이 보이는지"를 제한하고, cgroups로 "얼마나 쓸 수 있는지"를 제한한다.

---

## Docker 이전: LXC

**LXC(Linux Containers)**는 namespace와 cgroups를 직접 조합해 컨테이너를 만드는 도구다. Docker 초기 버전(0.9 이전)도 LXC를 기반으로 동작했다.

LXC는 강력하지만 사용이 복잡했다. 이미지 빌드, 배포, 공유 메커니즘이 없었고, 설정 파일 작성이 번거로웠다.

---

## Docker가 한 것

Docker는 컨테이너 기술에 **개발자 경험(DX)**을 더했다.

- **Dockerfile**: 이미지 빌드를 코드로 선언
- **Docker Hub**: 이미지 레지스트리로 공유를 표준화
- **레이어 캐싱**: Union 파일 시스템으로 이미지 효율화
- **단순한 CLI**: `docker run`, `docker build` 같은 직관적 명령

```dockerfile
FROM openjdk:17-jdk-slim
COPY app.jar /app.jar
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

```bash
docker build -t my-app .
docker run -p 8080:8080 my-app
```

복잡했던 컨테이너 조작이 몇 줄로 끝났다. 이것이 Docker가 컨테이너를 대중화한 이유다.

---

## Docker 외 컨테이너 도구들

Docker가 표준처럼 보이지만, 컨테이너 생태계는 더 넓다.

### Podman

Red Hat이 만든 Docker 대안. Docker와 CLI가 호환되므로 `alias docker=podman`으로 전환이 가능하다.

- **데몬 없음**: Docker는 백그라운드 데몬(`dockerd`)이 필요하지만 Podman은 데몬 없이 동작
- **rootless**: root 권한 없이 컨테이너 실행 가능해 보안이 강하다

### containerd

Docker에서 컨테이너 런타임 부분을 분리해 독립 프로젝트가 됐다. Kubernetes가 Docker 대신 직접 containerd를 사용하는 런타임이다. 현재 Kubernetes의 기본 컨테이너 런타임이다.

### LXC / LXD

VM에 가까운 "시스템 컨테이너"를 지향한다. Docker가 단일 프로세스(앱)를 격리하는 반면, LXD는 완전한 Linux 환경을 컨테이너로 제공한다.

### gVisor / Kata Containers

보안을 극단적으로 강화한 컨테이너 런타임이다. 커널을 완전히 공유하지 않고 추가 격리 레이어를 둔다.

---

## 가상 머신과의 차이

|  | VM | 컨테이너 |
|:--:|:--:|:--:|
| 격리 단위 | OS 전체 | 프로세스 |
| 커널 | 게스트 OS 별도 | 호스트 커널 공유 |
| 기동 시간 | 분 단위 | 초 단위 |
| 이미지 크기 | GB | MB |
| 격리 강도 | 강 | 중 |

---

## Key Point

> **컨테이너 기술은 리눅스 커널(namespace, cgroups)이 제공하는 프로세스 격리 메커니즘이다. Docker는 이 기술 위에 개발자 친화적인 인터페이스를 얹어 대중화에 성공한 도구다. Podman, containerd, LXC 등 다양한 구현체가 존재하며, 특히 Kubernetes 환경에서는 Docker 없이 containerd가 직접 사용된다.**

---

## Reference

- [Linux Namespaces — man7.org](https://man7.org/linux/man-pages/man7/namespaces.7.html)
- [cgroups — kernel.org](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
- [OCI Runtime Spec](https://opencontainers.org/)
- [Podman](https://podman.io/)
- [containerd](https://containerd.io/)