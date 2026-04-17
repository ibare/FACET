# 04. Runtime

런타임은 호스트 어댑터로부터 (컨테이너 식별자, 본체 식별자) 쌍을 받아, 카탈로그를 조회하고, 인터랙티브 영역을 DOM에 그린다. 코어는 호스트 독립적이다.

## 패키지 구조

```
@facet/core            — 런타임 코어, 타입 정의, 카탈로그, 파서
@facet/lens-circuit    — 회로 시각화 렌즈 (컨테이너 발진기 + 본체 박스 + 펄스 와이어)
@facet/lens-code       — 코드 렌즈 (패러다임 토글, 언어 탭, 동기 하이라이트)

@facet/container-loop  — loop 컨테이너 구현
@facet/algorithm-bubblesort  — bubbleSort 알고리즘 + 본체(bars) + IR(imperative, functional)
@facet/transpilers-mainstream  — Python, JavaScript 변환기들

@facet/host-tiptap     — Tiptap 호스트 어댑터 (첫 번째)
```

각 패키지는 독립적으로 배포 가능. 호스트는 필요한 패키지만 가져와 카탈로그에 등록.

## 코어 인스턴스

호스트가 FACET 표현식을 발견하면 코어를 호출해 인스턴스를 만든다.

```typescript
import { createInstance } from '@facet/core';

const instance = createInstance({
  expr: { container: 'loop', bodies: ['bubbleSort'] },
  catalog: globalCatalog,
  lenses: ['circuit', 'code'],  // 어떤 렌즈를 띄울지
  mountPoint: domElement,        // 렌더링할 DOM 노드
});

instance.start();
instance.stop();
instance.destroy();
```

코어가 하는 일:
1. 표현식 검증 (카탈로그 매칭)
2. 컨테이너 인스턴스, 본체 인스턴스 생성
3. 컨테이너 ↔ 본체 프로토콜 결선 (tick, complete)
4. 활성 렌즈들을 mountPoint에 마운트
5. 본체의 phase emit을 모든 렌즈에 브로드캐스트
6. UI 컨트롤(시작/정지/속도/본체 컨트롤) 결선

## 이벤트 모델

코어 안에 단일 이벤트 버스. 컨테이너, 본체, 렌즈가 모두 이 버스로 통신.

이벤트 종류:

```typescript
type FacetEvent =
  | { type: 'container:tick'; tickCount: number }
  | { type: 'container:complete' }
  | { type: 'body:phase'; phase: string }
  | { type: 'body:state-changed'; state: object }
  | { type: 'ui:speed-changed'; multiplier: number }
  | { type: 'ui:control-changed'; bodyId: string; controlId: string; value: unknown }
  | { type: 'ui:reset' }
  | { type: 'ui:start' }
  | { type: 'ui:stop' };
```

구독 규칙:
- 컨테이너는 `ui:start`, `ui:stop`, `ui:reset`, `body:complete`(자기 본체로부터) 구독
- 본체는 `container:tick`, `ui:control-changed`(자기 컨트롤만), `ui:reset` 구독
- 렌즈는 자기에게 필요한 이벤트 구독 (`circuit`은 `container:tick`, `body:phase` 등; `code`는 `body:phase`만)

이벤트 버스가 카탈로그 항목들의 직접 참조를 끊는다. 본체가 컨테이너 인스턴스를 모르고, 렌즈가 본체 객체를 모른다 — 모두 이벤트로만 안다.

## 렌즈 인터페이스

렌즈는 카탈로그 항목이 아니라 **렌더링 모듈**이다. 코어가 어떤 렌즈를 띄울지 호스트가 결정.

```typescript
type Lens = {
  id: string;                                   // 'circuit' | 'code'
  
  mount(params: {
    container: HTMLElement;                     // 렌즈가 그릴 DOM 영역
    eventBus: EventBus;                         // 구독·발행
    catalog: Catalog;                           // 메타데이터 조회
    expr: FacetExpr;                            // 어떤 (컨테이너, 본체) 쌍인지
  }): LensInstance;
};

type LensInstance = {
  destroy(): void;
};
```

렌즈가 하는 일:
1. mount 시 자기 DOM 구조 생성
2. eventBus 구독 시작 (필요한 이벤트만)
3. 카탈로그에서 자기에게 필요한 정보 조회 (예: 코드 렌즈는 패러다임/언어/source_map)
4. 이벤트 받으면 자기 DOM 갱신
5. UI 액션이 발생하면 eventBus로 발행

### 회로 렌즈 (`@facet/lens-circuit`)

- DOM: SVG 캔버스, 컨테이너 노드(원), 본체 박스, 와이어
- 본체 박스 내부 렌더링은 본체 인스턴스의 `render()` 호출 (본체가 자기 그림 책임)
- 펄스 애니메이션, 와이어 색 변화, complete 신호 역방향 펄스
- 본체 컨트롤 UI (본체의 `controls` 스키마에서 자동 생성)
- 시작/정지/스텝/속도 버튼

### 코드 렌즈 (`@facet/lens-code`)

- DOM: 패러다임 토글, 언어 탭, 코드 표시 영역(들)
- 카탈로그에서 본체의 패러다임 옵션과 호환 변환기 조회 → UI 자동 생성
- 변환기 호출하여 코드 + source_map 획득
- `body:phase` 이벤트 받으면 같은 phase 태그가 있는 라인 하이라이트

코드 렌즈의 표시 모드:
- **단일 모드**: 한 패러다임 + 한 언어 = 한 코드 블록
- **이중 모드**: 두 패러다임 동시 비교 (v7 데모 형태) — 한 언어 안에서 명령형/함수형 좌우 배치

v1에서는 이중 모드를 디폴트로 (학습 메시지 강조).

## 속도 제어

속도는 시각화 레이어의 속성. 컨테이너의 tick 발생 주기와 본체 동작 시간이 모두 영향받음. 코어가 단일 배율로 관리.

```typescript
eventBus.emit({ type: 'ui:speed-changed', multiplier: 1.4 });
```

컨테이너와 본체가 각자 자기 시간 계산에 이 배율 적용. 렌즈도 애니메이션 시간에 적용.

## 호스트 독립성

코어는 다음에 의존하지 않는다:
- 특정 마크다운 파서 (호스트가 이미 자기 것 가짐)
- 특정 프레임워크 (React, Vue, Svelte 등)
- 특정 빌드 도구

코어는 순수 TypeScript + DOM API만 사용. 호스트 어댑터가 호스트 환경에 통합.

## 라이프사이클

```
호스트가 마크다운에서 {facet:loop facet:bubbleSort} 발견
  ↓
호스트가 그 자리에 div 삽입 + createInstance 호출
  ↓
코어가 카탈로그 조회, 인스턴스 생성, 렌즈 마운트
  ↓
사용자 인터랙션 (시작 버튼)
  ↓
이벤트 버스를 통한 컨테이너↔본체↔렌즈 협업
  ↓
호스트가 그 div 제거 (편집기에서 표현식 삭제 등)
  ↓
instance.destroy() 호출 → 렌즈 해제 → 이벤트 구독 해제
```
