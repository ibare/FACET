# 03. Catalog

카탈로그는 FACET의 모든 동적 가능성이 사는 곳이다. DSL에 적히지 않은 모든 것 — 알고리즘 데이터, 시각화 로직, 코드 표현, 패러다임 옵션, 언어 지원 — 이 카탈로그 메타데이터의 매칭으로 결정된다.

## 카테고리

```
catalog = {
  containers:  Container[],
  algorithms:  Algorithm[],
  bodies:      Body[],
  irs:         IR[],
  transpilers: Transpiler[]
}
```

## Container

```typescript
type Container = {
  id: string;           // 'loop'
  
  // 런타임 인터페이스
  init(params: object): ContainerInstance;
};

type ContainerInstance = {
  // tick을 발생시키는 측. 본체에 onTick 콜백 등록받음.
  onTick(callback: () => void): void;
  onComplete(callback: () => void): void;
  
  // 외부 제어
  start(): void;
  stop(): void;
  reset(): void;
  
  // 본체로부터 종료 신호 받음
  signalComplete(): void;
  
  // 자기 시각화 그릴 때 필요한 상태 노출
  getState(): { tickCount: number; running: boolean; complete: boolean };
};
```

v1 컨테이너: `loop` 한 종류.

## Algorithm

```typescript
type Algorithm = {
  id: string;           // 'bubbleSort'
  description: string;  // '인접한 두 원소를 비교해 큰 것을 뒤로 보내는 정렬'
  
  // phase 어휘 — 본체와 IR이 공유
  phases: string[];     // ['outer_loop', 'comparing', 'swapping', 'pass_complete']
  
  // 메타데이터 (RAG·UI 보조)
  category?: string;    // 'sorting'
  complexity?: { time: string; space: string };  // { time: 'O(n^2)', space: 'O(1)' }
  related?: string[];   // ['selectionSort', 'insertionSort']
};
```

알고리즘 항목 자체는 동작이 없다. **데이터 + 어휘 사전**이다.

v1 알고리즘: `bubbleSort` 한 종류.

## Body

```typescript
type Body = {
  id: string;                    // 'bubbleSort-bars'
  algorithm: string;             // 'bubbleSort' — 알고리즘 식별자
  
  // 호환 IR 식별자 목록
  available_irs: string[];       // ['bubbleSort-imperative', 'bubbleSort-functional']
  default_ir: string;            // 'bubbleSort-imperative'
  
  // 본체 컨트롤 스키마 (UI 자동 생성용)
  controls: BodyControl[];
  
  // 런타임 인터페이스
  init(params: object): BodyInstance;
};

type BodyControl =
  | { type: 'preset'; id: string; label: string; options: { value: string; label: string }[]; default: string }
  | { type: 'range'; id: string; label: string; min: number; max: number; default: number; step?: number };

type BodyInstance = {
  // 컨테이너로부터 tick 받음
  onTick(): void;
  
  // 본체가 phase 발생시킴 — UI 구독자들이 등록
  onPhase(callback: (phase: string) => void): void;
  
  // 본체가 자기 종료 결정 — 컨테이너가 등록
  onComplete(callback: () => void): void;
  
  // 본체의 컨트롤 값이 바뀌었을 때
  setControl(id: string, value: unknown): void;
  
  // 본체가 자기 시각화 그릴 때 필요한 상태
  getState(): object;  // 본체별로 다름
  
  // 자기 시각화를 SVG/HTML로 그리는 메서드
  render(container: HTMLElement): void;
  
  reset(): void;
};
```

본체는 알고리즘 식별자로만 IR/변환기와 연결된다. 본체가 IR 객체나 변환기 객체에 직접 접근하지 않는다.

v1 본체: `bubbleSort-bars` 한 종류.

## IR

```typescript
type IR = {
  id: string;            // 'bubbleSort-imperative'
  algorithm: string;     // 'bubbleSort'
  paradigm: string;      // 'imperative' | 'functional'
  
  // IR 트리 (변환기가 펼칠 입력)
  tree: IRNode;
};

type IRNode = {
  type: string;          // 'block' | 'forRange' | 'if' | 'assign' | 'swap' | ...
  phase?: string;        // 알고리즘의 phases에 속한 식별자 (선택)
  children?: IRNode[];
  // type별 추가 속성
  [key: string]: unknown;
};
```

v1에서는 IR 트리를 변환기가 직접 가지고 있는 것으로 단순화 가능 (변환기 출력에 source_map만 있으면 됨). 진짜 IR 트리는 합성과 다중 변환기 공유가 의미를 가질 때 도입.

v1 IR: `bubbleSort-imperative`, `bubbleSort-functional` 두 종류.

## Transpiler

```typescript
type Transpiler = {
  id: string;            // 'python-imperative'
  paradigm: string;      // 어떤 패러다임의 IR을 받는지
  target: string;        // 'python' | 'javascript' | 'rust' | ...
  targetLabel: string;   // 'Python' (UI 표시용)
  
  // IR을 받아 코드 + source_map 반환
  transpile(ir: IR): TranspileResult;
};

type TranspileResult = {
  lines: { code: string; phase: string | null }[];
};
```

source_map은 라인별 phase 태그 배열. UI가 본체의 phase emit을 받아 같은 phase 태그가 있는 라인을 하이라이트.

v1 변환기: 4종 (`python-imperative`, `python-functional`, `javascript-imperative`, `javascript-functional`).

## 매칭 규칙

런타임이 카탈로그에서 (컨테이너, 본체) 쌍을 받으면 다음 매칭으로 UI 가능성을 도출:

```typescript
function deriveUIOptions(body: Body, catalog: Catalog) {
  const algorithm = catalog.algorithms.find(a => a.id === body.algorithm);
  
  // 패러다임 옵션
  const paradigms = body.available_irs.map(irId => {
    const ir = catalog.irs.find(i => i.id === irId);
    return { id: ir.paradigm, irId: ir.id };
  });
  
  // 언어 옵션 (패러다임당 호환 변환기들의 target)
  const languages = new Set<string>();
  paradigms.forEach(p => {
    catalog.transpilers
      .filter(t => t.paradigm === p.id)
      .forEach(t => languages.add(t.target));
  });
  
  // phase 어휘
  const phases = algorithm.phases;
  
  // 본체 컨트롤
  const controls = body.controls;
  
  return { paradigms, languages: [...languages], phases, controls };
}
```

UI는 이 결과로 토글, 탭, 슬라이더, 색상 팔레트를 자동 생성한다.

## 카탈로그 등록 방식

각 카테고리는 모듈로 외부에서 등록 가능하다:

```typescript
// 코어 패키지
import { createCatalog } from '@facet/core';

// 카탈로그 항목 패키지
import { loopContainer } from '@facet/container-loop';
import { bubbleSortAlgorithm, bubbleSortBars, bubbleSortIRs } from '@facet/algorithm-bubblesort';
import { pythonTranspilers, javascriptTranspilers } from '@facet/transpilers-mainstream';

const catalog = createCatalog();
catalog.register('container', loopContainer);
catalog.register('algorithm', bubbleSortAlgorithm);
catalog.register('body', bubbleSortBars);
bubbleSortIRs.forEach(ir => catalog.register('ir', ir));
[...pythonTranspilers, ...javascriptTranspilers].forEach(t => catalog.register('transpiler', t));
```

카탈로그는 모듈 시스템이 잘 작동하는 형태여야 한다. 새 알고리즘/본체/IR/변환기를 추가하는 게 npm 패키지 추가 + register 호출만으로 끝나야 한다.

## 검증 (개발 시)

카탈로그에 항목이 등록될 때 다음을 검증:
- 본체의 `algorithm`이 알고리즘 카탈로그에 존재
- 본체의 `available_irs`의 모든 IR이 IR 카탈로그에 존재
- 본체의 `default_ir`이 `available_irs`에 포함
- IR의 `algorithm`이 본체의 `algorithm`과 일치
- IR의 phase 태그들이 알고리즘의 `phases` 사전에 속함
- 변환기의 `paradigm`이 적어도 한 IR의 `paradigm`과 일치 (안 그러면 그 변환기는 호출되지 않음 — 경고)

검증 실패는 개발 시점에 콘솔 경고. 런타임 시점에는 매칭 안 되면 그냥 해당 옵션이 UI에 안 나타남.
