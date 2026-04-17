# 06. First Plugin: loop + bubbleSort

v7 데모에서 합의된 모든 결정을 실제 코드로 옮기는 가이드. 이 문서를 따라가면 동작하는 첫 FACET 플러그인이 완성된다.

## 결과물

```
{facet:loop facet:bubbleSort}
```

이 표현이 마크다운에 들어가면, Tiptap 편집기에서 다음이 렌더링된다:

- 회로 시각화: 왼쪽 작은 원(컨테이너 발진기) — 오른쪽 큰 박스(본체) — 펄스가 흐르는 와이어
- 본체 박스 안: 막대 차트, 분포 프리셋, 크기 슬라이더, 메트릭(패스/비교/교환/상태)
- 본체 박스 위: 현재 phase 라벨 (comparing/swapping/pass_complete/outer_loop)
- 하단 코드 렌즈: 명령형/함수형 두 패러다임 좌우 동시 표시, Python/JavaScript 탭, 본체 phase에 따른 라인 동시 하이라이트
- 컨트롤: 시작/정지/한 펄스/리셋/속도(빠르게·보통·느리게)

## 패키지별 구현

### `@facet/core`

#### types.ts

```typescript
export type FacetExpr = {
  container: { ns: 'facet'; name: string };
  bodies: { ns: 'facet'; name: string }[];
  raw: string;
};

export type Container = {
  id: string;
  init(params?: object): ContainerInstance;
};

export type ContainerInstance = {
  start(): void;
  stop(): void;
  reset(): void;
  signalComplete(): void;
  onTick(cb: () => void): () => void;       // unsubscribe 반환
  setSpeed(multiplier: number): void;
  getState(): { tickCount: number; running: boolean; complete: boolean };
};

export type Algorithm = {
  id: string;
  description: string;
  phases: string[];
  category?: string;
  complexity?: { time: string; space: string };
};

export type BodyControl =
  | { type: 'preset'; id: string; label: string; options: { value: string; label: string }[]; default: string }
  | { type: 'range'; id: string; label: string; min: number; max: number; default: number; step?: number };

export type Body = {
  id: string;
  algorithm: string;
  available_irs: string[];
  default_ir: string;
  controls: BodyControl[];
  init(params?: object): BodyInstance;
};

export type BodyInstance = {
  tick(): void;                              // 컨테이너가 호출
  reset(): void;
  setControl(id: string, value: unknown): void;
  setSpeed(multiplier: number): void;
  onPhase(cb: (phase: string) => void): () => void;
  onComplete(cb: () => void): () => void;
  onStateChange(cb: (state: object) => void): () => void;
  render(mount: HTMLElement): void;
  destroy(): void;
};

export type IR = {
  id: string;
  algorithm: string;
  paradigm: string;
  // v1: 변환기가 IR 내용을 직접 알지 않고 결과를 직접 가짐
  // 진짜 IR 트리는 v2 이후 도입
};

export type TranspileResult = {
  lines: { code: string; phase: string | null }[];
};

export type Transpiler = {
  id: string;
  paradigm: string;
  target: string;
  targetLabel: string;
  transpile(ir: IR): TranspileResult;
};

export type Catalog = {
  containers: Map<string, Container>;
  algorithms: Map<string, Algorithm>;
  bodies: Map<string, Body>;
  irs: Map<string, IR>;
  transpilers: Map<string, Transpiler>;
};
```

#### parser.ts

```typescript
import type { FacetExpr } from './types';

const FACET_PATTERN = /\{(facet:[a-zA-Z][a-zA-Z0-9_-]*(?:\s+facet:[a-zA-Z][a-zA-Z0-9_-]*)*)\}/g;

export function parseFacetExpr(text: string): FacetExpr | null {
  const match = text.match(/^\{(facet:[a-zA-Z][a-zA-Z0-9_-]*(?:\s+facet:[a-zA-Z][a-zA-Z0-9_-]*)*)\}$/);
  if (!match) return null;
  
  const tokens = match[1].split(/\s+/);
  const parsed = tokens.map(t => {
    const [ns, name] = t.split(':');
    return { ns: ns as 'facet', name };
  });
  
  return {
    container: parsed[0],
    bodies: parsed.slice(1),
    raw: text,
  };
}

export function findFacetExprs(markdown: string): { expr: FacetExpr; start: number; end: number }[] {
  const results = [];
  let match;
  while ((match = FACET_PATTERN.exec(markdown)) !== null) {
    const parsed = parseFacetExpr(match[0]);
    if (parsed) {
      results.push({ expr: parsed, start: match.index, end: match.index + match[0].length });
    }
  }
  return results;
}
```

#### catalog.ts

```typescript
import type { Catalog, Container, Algorithm, Body, IR, Transpiler } from './types';

let globalCatalog: Catalog = {
  containers: new Map(),
  algorithms: new Map(),
  bodies: new Map(),
  irs: new Map(),
  transpilers: new Map(),
};

export function registerCatalog(items: {
  containers?: Container[];
  algorithms?: Algorithm[];
  bodies?: Body[];
  irs?: IR[];
  transpilers?: Transpiler[];
}) {
  items.containers?.forEach(c => globalCatalog.containers.set(c.id, c));
  items.algorithms?.forEach(a => globalCatalog.algorithms.set(a.id, a));
  items.bodies?.forEach(b => globalCatalog.bodies.set(b.id, b));
  items.irs?.forEach(i => globalCatalog.irs.set(i.id, i));
  items.transpilers?.forEach(t => globalCatalog.transpilers.set(t.id, t));
}

export function getCatalog(): Catalog {
  return globalCatalog;
}

export function deriveUIOptions(bodyId: string, catalog: Catalog) {
  const body = catalog.bodies.get(bodyId);
  if (!body) return null;
  const algorithm = catalog.algorithms.get(body.algorithm);
  if (!algorithm) return null;
  
  const paradigms = body.available_irs
    .map(irId => {
      const ir = catalog.irs.get(irId);
      return ir ? { id: ir.paradigm, irId: ir.id } : null;
    })
    .filter(Boolean);
  
  const languages = new Set<string>();
  paradigms.forEach(p => {
    [...catalog.transpilers.values()]
      .filter(t => t.paradigm === p!.id)
      .forEach(t => languages.add(t.target));
  });
  
  return {
    paradigms,
    languages: [...languages],
    phases: algorithm.phases,
    controls: body.controls,
  };
}
```

#### instance.ts

```typescript
import type { FacetExpr, Catalog, ContainerInstance, BodyInstance } from './types';
import { EventBus } from './event-bus';

export type InstanceParams = {
  expr: FacetExpr;
  catalog: Catalog;
  lenses: string[];                        // 'circuit', 'code'
  lensRegistry: Map<string, LensFactory>;  // 호스트가 주입
  mountPoint: HTMLElement;
};

export type LensFactory = (params: {
  container: HTMLElement;
  eventBus: EventBus;
  catalog: Catalog;
  expr: FacetExpr;
  containerInstance: ContainerInstance;
  bodyInstance: BodyInstance;
}) => { destroy(): void };

export function createInstance(params: InstanceParams) {
  const { expr, catalog, lenses, lensRegistry, mountPoint } = params;
  
  // 카탈로그 검증
  const containerDef = catalog.containers.get(expr.container.name);
  if (!containerDef) throw new Error(`Unknown container: ${expr.container.name}`);
  if (expr.bodies.length !== 1) throw new Error('v1 supports exactly one body');
  const bodyDef = catalog.bodies.get(expr.bodies[0].name);
  if (!bodyDef) throw new Error(`Unknown body: ${expr.bodies[0].name}`);
  
  // 인스턴스 생성
  const containerInstance = containerDef.init();
  const bodyInstance = bodyDef.init();
  
  // 프로토콜 결선
  const unsubTick = containerInstance.onTick(() => bodyInstance.tick());
  const unsubComplete = bodyInstance.onComplete(() => containerInstance.signalComplete());
  
  // 이벤트 버스 (렌즈들이 공유)
  const eventBus = new EventBus();
  bodyInstance.onPhase(p => eventBus.emit({ type: 'body:phase', phase: p }));
  bodyInstance.onStateChange(s => eventBus.emit({ type: 'body:state-changed', state: s }));
  
  // 렌즈 마운트
  const lensInstances = lenses
    .map(id => lensRegistry.get(id))
    .filter(Boolean)
    .map(factory => factory!({
      container: mountPoint,
      eventBus,
      catalog,
      expr,
      containerInstance,
      bodyInstance,
    }));
  
  return {
    start: () => containerInstance.start(),
    stop: () => containerInstance.stop(),
    reset: () => { containerInstance.reset(); bodyInstance.reset(); },
    setSpeed: (m: number) => { containerInstance.setSpeed(m); bodyInstance.setSpeed(m); },
    destroy: () => {
      lensInstances.forEach(l => l.destroy());
      bodyInstance.destroy();
      unsubTick();
      unsubComplete();
    },
  };
}
```

#### event-bus.ts

```typescript
export class EventBus {
  private listeners = new Map<string, Set<(event: any) => void>>();
  
  on(type: string, cb: (event: any) => void): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
    return () => this.listeners.get(type)?.delete(cb);
  }
  
  emit(event: { type: string; [key: string]: any }) {
    this.listeners.get(event.type)?.forEach(cb => cb(event));
  }
}
```

### `@facet/container-loop`

```typescript
import type { Container, ContainerInstance } from '@facet/core';

export const loopContainer: Container = {
  id: 'loop',
  
  init(): ContainerInstance {
    let tickCallbacks = new Set<() => void>();
    let completeCallbacks = new Set<() => void>();
    let speedMul = 1.4;
    let tickCount = 0;
    let running = false;
    let complete = false;
    let timer: number | null = null;
    
    const BASE_INTERVAL = 1200;  // ms (한 사이클: 펄스+본체+휴지)
    
    function emitTick() {
      if (complete) { stop(); return; }
      tickCount++;
      tickCallbacks.forEach(cb => cb());
    }
    
    function start() {
      if (complete) return;
      running = true;
      // 즉시 첫 tick
      emitTick();
      // 이후 주기적
      timer = window.setInterval(emitTick, BASE_INTERVAL * speedMul);
    }
    
    function stop() {
      running = false;
      if (timer !== null) { clearInterval(timer); timer = null; }
    }
    
    function reset() {
      stop();
      tickCount = 0;
      complete = false;
    }
    
    function signalComplete() {
      complete = true;
      stop();
      completeCallbacks.forEach(cb => cb());
    }
    
    function setSpeed(mul: number) {
      speedMul = mul;
      if (running) {
        stop();
        start();
      }
    }
    
    return {
      start, stop, reset, signalComplete,
      onTick: (cb) => { tickCallbacks.add(cb); return () => tickCallbacks.delete(cb); },
      setSpeed,
      getState: () => ({ tickCount, running, complete }),
    };
  },
};
```

**참고**: 위 구현은 단순화된 버전이다. 실제로는 v7 데모처럼 `requestAnimationFrame` 기반 미세 phase 제어가 필요하다. 본체가 한 tick 안에서 미세 phase(comparing → swapping)를 시간차로 emit하려면 본체와 컨테이너가 시간 모델을 공유해야 한다. 

실용적 절충: 컨테이너는 단순한 setInterval로 tick을 발생시키고, 본체가 자기 미세 phase의 시간 흐름을 자체 관리. 컨테이너는 다음 tick까지 충분한 시간(미세 phase가 완료될 시간)을 둠.

### `@facet/algorithm-bubblesort`

```typescript
import type { Algorithm, Body, BodyInstance, IR, Transpiler } from '@facet/core';

// 알고리즘 정의 (어휘 사전)
export const bubbleSortAlgorithm: Algorithm = {
  id: 'bubbleSort',
  description: '인접한 두 원소를 비교해 큰 것을 뒤로 보내는 정렬 알고리즘',
  phases: ['outer_loop', 'comparing', 'swapping', 'pass_complete'],
  category: 'sorting',
  complexity: { time: 'O(n²)', space: 'O(1)' },
};

// IR (v1에서는 식별자만 의미 — 변환기가 직접 코드 생성)
export const bubbleSortIRs: IR[] = [
  { id: 'bubbleSort-imperative', algorithm: 'bubbleSort', paradigm: 'imperative' },
  { id: 'bubbleSort-functional', algorithm: 'bubbleSort', paradigm: 'functional' },
];

// 본체 (시각화 + 알고리즘 상태)
export const bubbleSortBars: Body = {
  id: 'bubbleSort-bars',
  algorithm: 'bubbleSort',
  available_irs: ['bubbleSort-imperative', 'bubbleSort-functional'],
  default_ir: 'bubbleSort-imperative',
  controls: [
    {
      type: 'preset',
      id: 'distribution',
      label: '분포',
      options: [
        { value: 'random', label: '랜덤' },
        { value: 'reversed', label: '역순' },
        { value: 'nearly', label: '거의 정렬' },
      ],
      default: 'reversed',
    },
    {
      type: 'range',
      id: 'size',
      label: '개수',
      min: 4,
      max: 9,
      default: 5,
      step: 1,
    },
  ],
  
  init(): BodyInstance {
    let arr: number[] = [];
    let i = 0, pass = 0, swappedThisPass = false;
    let comparisons = 0, swaps = 0;
    let lastComp: [number, number] | null = null;
    let lastSwap: [number, number] | null = null;
    let bodyState: 'ready' | 'running' | 'complete' = 'ready';
    let microPhase: string | null = null;
    let microPhaseStart = 0;
    let pendingSwap = false;
    let speedMul = 1.4;
    let distribution = 'reversed';
    let size = 5;
    let mountEl: HTMLElement | null = null;
    
    const phaseCallbacks = new Set<(p: string) => void>();
    const completeCallbacks = new Set<() => void>();
    const stateCallbacks = new Set<(s: object) => void>();
    
    function emitPhase(p: string) { phaseCallbacks.forEach(cb => cb(p)); }
    function emitState() {
      stateCallbacks.forEach(cb => cb({ arr, pass, comparisons, swaps, bodyState, lastComp, lastSwap, microPhase }));
    }
    
    function genArray() {
      arr = [];
      if (distribution === 'random') {
        const pool = Array.from({ length: size }, (_, k) => k + 1);
        for (let k = pool.length - 1; k > 0; k--) {
          const j = Math.floor(Math.random() * (k + 1));
          [pool[k], pool[j]] = [pool[j], pool[k]];
        }
        arr = pool;
      } else if (distribution === 'reversed') {
        arr = Array.from({ length: size }, (_, k) => size - k);
      } else {
        arr = Array.from({ length: size }, (_, k) => k + 1);
        const swapsToDo = Math.max(1, Math.floor(size * 0.2));
        for (let s = 0; s < swapsToDo; s++) {
          const a = Math.floor(Math.random() * (size - 1));
          [arr[a], arr[a + 1]] = [arr[a + 1], arr[a]];
        }
      }
    }
    
    function reset() {
      i = 0; pass = 0; swappedThisPass = false;
      comparisons = 0; swaps = 0;
      lastComp = null; lastSwap = null;
      bodyState = 'ready';
      microPhase = null;
      pendingSwap = false;
      genArray();
      emitState();
    }
    
    function tick() {
      // 컨테이너가 한 tick 보냈음 — 한 단계 진행 + 미세 phase 시작
      if (bodyState === 'complete') return;
      bodyState = 'running';
      
      const limit = size - pass - 1;
      if (i >= limit) {
        pass++;
        if (!swappedThisPass) {
          bodyState = 'complete';
          lastComp = null; lastSwap = null;
          emitPhase('pass_complete');
          emitState();
          completeCallbacks.forEach(cb => cb());
          return;
        }
        swappedThisPass = false;
        i = 0;
        const newLimit = size - pass - 1;
        if (newLimit <= 0) {
          bodyState = 'complete';
          emitPhase('pass_complete');
          emitState();
          completeCallbacks.forEach(cb => cb());
          return;
        }
        emitPhase('outer_loop');
        emitState();
      }
      
      // 비교 phase
      comparisons++;
      lastComp = [i, i + 1];
      pendingSwap = arr[i] > arr[i + 1];
      if (!pendingSwap) lastSwap = null;
      emitPhase('comparing');
      emitState();
      
      // 미세 phase 진행: 일정 시간 후 (필요시) swap → 다음 단계
      const microDelay = 350 * speedMul;
      setTimeout(() => {
        if (pendingSwap) {
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
          swaps++;
          swappedThisPass = true;
          lastSwap = [i, i + 1];
          emitPhase('swapping');
          emitState();
          setTimeout(() => { i++; emitState(); }, microDelay);
        } else {
          i++;
          emitState();
        }
      }, microDelay);
    }
    
    function setControl(id: string, value: unknown) {
      if (id === 'distribution') distribution = value as string;
      if (id === 'size') size = value as number;
      reset();
    }
    
    function setSpeed(mul: number) { speedMul = mul; }
    
    function render(mount: HTMLElement) {
      mountEl = mount;
      // 본체의 SVG/HTML 그리기는 본체 자신이 — 회로 렌즈가 이 mount를 본체 박스 안에 둠
      // 구체 렌더 코드는 v7 데모 참조 (드로잉 함수 분리)
      // 여기서는 생략 — 실제 구현 시 v7 데모의 막대 차트 + 메트릭 코드 재사용
    }
    
    function destroy() { mountEl = null; }
    
    genArray();
    
    return {
      tick, reset, setControl, setSpeed, render, destroy,
      onPhase: (cb) => { phaseCallbacks.add(cb); return () => phaseCallbacks.delete(cb); },
      onComplete: (cb) => { completeCallbacks.add(cb); return () => completeCallbacks.delete(cb); },
      onStateChange: (cb) => { stateCallbacks.add(cb); return () => stateCallbacks.delete(cb); },
    };
  },
};

export const bubbleSortBundle = {
  algorithm: bubbleSortAlgorithm,
  body: bubbleSortBars,
  irs: bubbleSortIRs,
};
```

### `@facet/transpilers-mainstream`

```typescript
import type { Transpiler } from '@facet/core';

export const pythonImperative: Transpiler = {
  id: 'python-imperative',
  paradigm: 'imperative',
  target: 'python',
  targetLabel: 'Python',
  transpile() {
    return {
      lines: [
        { code: 'def bubble_sort(arr):',                                     phase: null },
        { code: '    n = len(arr)',                                          phase: null },
        { code: '    for i in range(n):',                                    phase: 'outer_loop' },
        { code: '        for j in range(n - i - 1):',                        phase: null },
        { code: '            if arr[j] > arr[j + 1]:',                       phase: 'comparing' },
        { code: '                arr[j], arr[j+1] = arr[j+1], arr[j]',       phase: 'swapping' },
        { code: '    return arr',                                            phase: 'pass_complete' },
      ],
    };
  },
};

export const pythonFunctional: Transpiler = {
  id: 'python-functional',
  paradigm: 'functional',
  target: 'python',
  targetLabel: 'Python',
  transpile() {
    return {
      lines: [
        { code: 'def bubble_pass(xs):',                                       phase: 'outer_loop' },
        { code: '    if len(xs) < 2: return xs',                              phase: null },
        { code: '    if xs[0] > xs[1]:',                                      phase: 'comparing' },
        { code: '        return [xs[1]] + bubble_pass([xs[0]] + xs[2:])',     phase: 'swapping' },
        { code: '    return [xs[0]] + bubble_pass(xs[1:])',                   phase: null },
        { code: '',                                                           phase: null },
        { code: 'def bubble_sort(xs):',                                       phase: null },
        { code: '    if len(xs) < 2: return xs',                              phase: null },
        { code: '    passed = bubble_pass(xs)',                               phase: null },
        { code: '    return bubble_sort(passed[:-1]) + [passed[-1]]',         phase: 'pass_complete' },
      ],
    };
  },
};

export const javascriptImperative: Transpiler = {
  id: 'javascript-imperative',
  paradigm: 'imperative',
  target: 'javascript',
  targetLabel: 'JavaScript',
  transpile() {
    return {
      lines: [
        { code: 'function bubbleSort(arr) {',                                  phase: null },
        { code: '  const n = arr.length;',                                     phase: null },
        { code: '  for (let i = 0; i < n; i++) {',                             phase: 'outer_loop' },
        { code: '    for (let j = 0; j < n - i - 1; j++) {',                   phase: null },
        { code: '      if (arr[j] > arr[j + 1]) {',                            phase: 'comparing' },
        { code: '        [arr[j], arr[j+1]] = [arr[j+1], arr[j]];',            phase: 'swapping' },
        { code: '      }',                                                     phase: null },
        { code: '    }',                                                       phase: null },
        { code: '  }',                                                         phase: null },
        { code: '  return arr;',                                               phase: 'pass_complete' },
        { code: '}',                                                           phase: null },
      ],
    };
  },
};

export const javascriptFunctional: Transpiler = {
  id: 'javascript-functional',
  paradigm: 'functional',
  target: 'javascript',
  targetLabel: 'JavaScript',
  transpile() {
    return {
      lines: [
        { code: 'const bubblePass = (xs) => {',                                phase: 'outer_loop' },
        { code: '  if (xs.length < 2) return xs;',                             phase: null },
        { code: '  return xs[0] > xs[1]',                                      phase: 'comparing' },
        { code: '    ? [xs[1], ...bubblePass([xs[0], ...xs.slice(2)])]',       phase: 'swapping' },
        { code: '    : [xs[0], ...bubblePass(xs.slice(1))];',                  phase: null },
        { code: '};',                                                          phase: null },
        { code: '',                                                            phase: null },
        { code: 'const bubbleSort = (xs) => {',                                phase: null },
        { code: '  if (xs.length < 2) return xs;',                             phase: null },
        { code: '  const passed = bubblePass(xs);',                            phase: null },
        { code: '  return [...bubbleSort(passed.slice(0,-1)), passed.at(-1)];',phase: 'pass_complete' },
      ],
    };
  },
};

export const mainstreamTranspilers = [
  pythonImperative,
  pythonFunctional,
  javascriptImperative,
  javascriptFunctional,
];
```

### `@facet/lens-circuit` & `@facet/lens-code`

v7 데모의 시각화 코드를 두 모듈로 분리:

- **lens-circuit**: SVG 회로(컨테이너 노드, 와이어, 펄스 애니메이션, 본체 박스 외곽 + 컨트롤 영역). 본체 박스 내부 콘텐츠는 본체의 `render()`를 호출해 위임. 시작/정지/리셋/속도 버튼. 본체 컨트롤 (분포 프리셋, 크기 슬라이더) — 본체의 `controls` 메타데이터로 자동 생성
- **lens-code**: 패러다임 토글, 언어 탭, 좌우 두 패러다임 코드 표시, phase 이벤트 받아 라인 하이라이트

두 렌즈 모두 `@facet/core`의 EventBus 구독.

v7 데모 코드(이 대화의 마지막 widget)를 직접 모듈로 옮기면 됨. 필요한 것은 모듈 경계 분리와 EventBus 통합.

### `@facet/host-tiptap`

[`05-host-plugin.md`](05-host-plugin.md) 참조.

## 통합 테스트

```typescript
// 호스트 앱의 진입점
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { FacetExtension } from '@facet/host-tiptap';
import { registerCatalog, registerLens } from '@facet/core';
import { loopContainer } from '@facet/container-loop';
import { bubbleSortBundle } from '@facet/algorithm-bubblesort';
import { mainstreamTranspilers } from '@facet/transpilers-mainstream';
import { circuitLens } from '@facet/lens-circuit';
import { codeLens } from '@facet/lens-code';

registerCatalog({
  containers: [loopContainer],
  algorithms: [bubbleSortBundle.algorithm],
  bodies: [bubbleSortBundle.body],
  irs: bubbleSortBundle.irs,
  transpilers: mainstreamTranspilers,
});

registerLens('circuit', circuitLens);
registerLens('code', codeLens);

const editor = new Editor({
  element: document.querySelector('#editor')!,
  extensions: [StarterKit, FacetExtension],
  content: '<p>{facet:loop facet:bubbleSort}</p>',
});
```

이 코드가 동작하면 첫 마일스톤 완성.

## 다음 단계

이 첫 플러그인이 동작한 후:

1. **두 번째 본체 변종 추가**: `bubbleSort-circles` 같은 다른 시각화. 같은 알고리즘에 다른 본체가 N개 가능함을 검증
2. **두 번째 알고리즘 추가**: `linearSearch` 같은 다른 알고리즘. phase 어휘가 알고리즘마다 다름을 검증
3. **두 번째 호스트 어댑터**: `@facet/host-markdown-it` 정도. 호스트 독립성 검증
4. **합성 도입**: `{facet:loop facet:loop}` 같은 중첩

각 단계마다 v7 합의가 어떻게 깎이는지 관찰하고, 이 문서를 갱신.
