# FACET 리포 리팩토링 — 단계별 Claude Code 프롬프트

## 배경 컨텍스트 (모든 단계 공통, 매 프롬프트 시작에 포함)

```
FACET 리포의 아키텍처를 새로운 4-layer 구조로 리팩토링한다.

**기존 구조 (폐기 또는 변형):**
- Container 카테고리: 폐기. loop 같은 제어 흐름은 알고리즘 코드 안에 녹아듦.
- Body: 알고리즘 모듈 + Projector + 뷰 카탈로그의 셋으로 분해됨.
- Algorithm의 phases 사전: 표준 이벤트 어휘로 대체.
- Lens (circuit, code): 폐기. View Catalog의 일반 뷰로 대체.
- Catalog 자동 매칭으로 UI 도출: 폐기. JSON에 명시적 선언.

**유지되는 것:**
- IR / Transpiler 카탈로그: 그대로 유지. 코드 표면 표현용.
- Tiptap 호스트 어댑터: 표현 채널로 유지.
- 모노레포 패키지 분리: 유지.

**새 4-layer 구조:**
1. **알고리즘 모듈** (코드, async function): 알고리즘 로직 + emit 지점.
   await ctx.emit(event)이 yield 지점이며, 러너가 UI 처리 끝낼 때까지 대기.
2. **Projector 모듈** (코드): 알고리즘 이벤트를 받아 뷰 인스턴스를 직접 조작.
   알고리즘과 UI 사이의 번역기. 자기 시각화의 모든 시각 갱신 책임.
3. **JSON 선언** (데이터): 메타 정보, 알고리즘/Projector 참조, 초기 데이터,
   레이아웃, 블록 구성. 로직 한 줄도 없음.
4. **러너** (코드): View Catalog 제공, JSON 해석, 알고리즘 코루틴 실행,
   이벤트를 Projector로 라우팅, 컨트롤(재생/단계/정지/속도) 처리.

**알고리즘 컨텍스트 인터페이스:**
```typescript
interface FacetContext {
  data: any;
  emit(event: Event): Promise<void>;  // yield 지점
  metric(name: string, delta: number | 'inc'): void;
  cancelled: boolean;
}

interface Event {
  type: string;            // 'highlight' | 'mark' | 'state-changed' |
                           // 'enqueue' | 'dequeue' | 'append' | 'done' 등
  target?: string | string[];  // 'index:3' | 'node:A' | 'edge:A-B' | 'queue' 등
  payload?: any;
}
```

**식별자 문법:** `타입:식별자` 형태. 새 자료구조 추가 시 새 타입 prefix 정의.

**JSON 선언 예시 (bubbleSort):**
```json
{
  "id": "facet:bubbleSort",
  "title": "버블 정렬",
  "description": "...",
  "algorithm": "module:bubbleSort",
  "projector": "module:bubbleSortProjector",
  "initialData": { "type": "array", "values": [5, 2, 8, 1, 9, 3, 7, 4] },
  "layout": {
    "type": "column",
    "children": [
      { "ref": "header" },
      { "ref": "stage", "grow": 1 },
      { "ref": "controls" }
    ]
  },
  "blocks": {
    "header": { "type": "title-block" },
    "stage": { "type": "bar-chart" },
    "controls": {
      "type": "control-bar",
      "controls": ["play", "step", "pause", "reset", { "type": "speed-slider" }],
      "metrics": [
        { "name": "compare-count", "label": "비교", "initial": 0 },
        { "name": "swap-count", "label": "교환", "initial": 0 }
      ]
    }
  }
}
```

**IR/Transpiler 통합:**
- IR과 Transpiler는 카탈로그 모듈로 유지.
- "코드 표면"은 View Catalog의 `code-view` 컴포넌트.
- Projector가 알고리즘 이벤트를 받아 code-view.highlightLines(...) 호출로 동기 하이라이트.
- JSON에서 어떤 IR/언어를 쓸지 선언:
  ```json
  "codePanel": {
    "type": "code-view",
    "ir": "ir:bubbleSort-imperative",
    "transpiler": "transpiler:python-imperative"
  }
  ```

리팩토링은 단계별로 진행하며 각 단계 끝에서 검증한다.
```

---

## 단계 1 — 새 코어 뼈대 구축

```
[배경 컨텍스트 삽입]

이 단계의 목표: 새 4-layer 구조의 뼈대를 @facet/core 패키지에 구축한다.
기존 코드는 손대지 않고 새 모듈만 추가한다 (병행 진화).

작업:

1. @facet/core에 새 디렉토리/파일 추가:
   - src/runtime/runner.ts          — runFacet(json, mountEl) 진입점
   - src/runtime/context.ts         — FacetContext 구현
   - src/runtime/event-bus.ts       — 알고리즘↔Projector 이벤트 라우팅
   - src/runtime/layout-builder.ts  — JSON layout → DOM 트리
   - src/runtime/registry.ts        — 알고리즘/Projector 모듈 등록·조회
   - src/views/index.ts             — View Catalog (이름→생성자 맵)
   - src/views/types.ts             — View 인터페이스 타입
   - src/types/facet-json.ts        — JSON 스키마 타입 정의
   - src/types/event.ts             — 표준 이벤트 타입 정의

2. 타입 정의 (src/types/):
   - FacetJson: 위 예시의 구조
   - FacetEvent: type, target, payload
   - 표준 이벤트 어휘는 union 타입으로 정의 (highlight | mark | state-changed |
     enqueue | dequeue | append | done | unhighlight)
   - 새 타입 추가가 쉽도록 확장 가능한 구조

3. 핵심 인터페이스만 구현, 동작 로직은 다음 단계에서:
   - runFacet 함수 시그니처와 빈 구현 (throw new Error('not implemented'))
   - View 인터페이스 (mount, destroy, 그 외는 뷰별 자유)
   - Projector 인터페이스 (onInit, onEvent, onReset)

4. 기존 카탈로그 시스템과의 격리:
   - 기존 Container/Body/IR/Transpiler 타입은 그대로 둔다
   - 새 코드는 별도 디렉토리에서 자기 타입을 가진다
   - 두 시스템이 충돌하지 않게 export 분리

5. 테스트:
   - 타입 컴파일 통과
   - 새 모듈 import 가능
   - 기존 코드 영향 없음 (기존 빌드 성공)

진행 후 다음을 보고:
- 새로 추가한 파일 목록
- 주요 타입 정의
- 다음 단계 진입 가능 여부

이 단계에서 동작은 없다. 뼈대만.
```

---

## 단계 2 — 러너와 View Catalog 최소 구현

```
[배경 컨텍스트 삽입]

이전 단계에서 @facet/core에 새 4-layer 구조의 뼈대를 만들었다.
이 단계의 목표: 러너가 실제로 작동하게 만들고, 최소 View Catalog를 구현한다.
검증은 더미 알고리즘 + 더미 Projector + 단순 JSON으로 한다.

작업:

1. 러너 구현 (src/runtime/runner.ts):
   - JSON 로드, 알고리즘/Projector 모듈 import
   - layout-builder로 DOM 트리 구성
   - 블록 인스턴스화 (View Catalog 조회)
   - FacetContext 생성 (data 사본, emit, metric, cancelled)
   - 알고리즘 코루틴 실행
   - 이벤트를 Projector.onEvent로 전달
   - 컨트롤(재생/단계/정지/리셋/속도) 처리
   - 정지/단계 모드: emit Promise를 stepResolve로 제어

2. View Catalog 최소 구현 (src/views/):
   - title-block: 제목 + 설명 표시
   - control-bar: 버튼들 + 슬라이더 + 메트릭 배지
   - text-display: 단순 텍스트 표시 (검증용)

   각 View는 다음 인터페이스 따른다:
   ```typescript
   type View = {
     mount(container: HTMLElement, config: any): ViewInstance;
   };
   type ViewInstance = {
     destroy(): void;
     [methodName: string]: (...args: any[]) => any;  // 뷰별 자유 메서드
   };
   ```

3. 검증용 더미 만들기 (별도 디렉토리, 프로덕션 코드 아님):
   - dummy/algorithms/counter.ts: 1부터 N까지 세는 단순 알고리즘
     ```typescript
     export async function counter(ctx) {
       for (let i = 1; i <= ctx.data.target; i++) {
         if (ctx.cancelled) return;
         await ctx.emit({ type: 'state-changed', payload: { value: i } });
         ctx.metric('count', 'inc');
       }
       await ctx.emit({ type: 'done' });
     }
     ```
   - dummy/projectors/counterProjector.ts: state-changed 받으면 text-display에 표시
   - dummy/facets/counter.json: 위 두 모듈 참조하는 JSON

4. 통합 테스트:
   - 작은 HTML 페이지 (test/runner-test.html 등) 만들어서 더미 facet 로드
   - 재생 → 1부터 N까지 화면에 순차 표시 확인
   - 단계 진행, 정지, 리셋, 속도 조절 모두 작동 확인

5. 검증 후 더미는 제거하지 말고 남겨둔다 (다음 단계에서 회귀 테스트 용도).

진행 후 다음을 보고:
- 러너 핵심 코드 (요약)
- 작동하는 더미 시각화 스크린샷 또는 동작 설명
- 다음 단계로 진입 가능 여부

기존 코드는 여전히 손대지 않는다.
```

---

## 단계 3 — 표준 View Catalog 구축

```
[배경 컨텍스트 삽입]

러너가 작동한다. 이제 실제 시각화에 필요한 표준 뷰들을 구현한다.
이 단계는 다음 단계(QuickSort 마이그레이션)에서 쓸 뷰들을 미리 준비하는 것.

작업:

1. View Catalog 확장 (src/views/):
   각 뷰는 자기 파일에 구현. 인터페이스는 단계 2의 것 그대로.

   - bar-chart.ts:
     - setData(arr): 막대 배열 렌더
     - setItemState(index, state): 인덱스별 상태 (default/comparing/swapping/sorted 등)
     - clearItemState(index)
     - swapItems(i, j): 데이터 swap + 재렌더
     - reset()
     - 색상 팔레트는 뷰 내부에 정의 (디자인 시스템 토큰 사용)

   - graph-layout.ts:
     - setGraph(graphData, positions): 노드 + 엣지 렌더
     - setNodeState(id, state)
     - setEdgeState(a, b, state)
     - reset()

   - tree-layout.ts:
     - setTree(rootNode, layoutFn?): 트리 구조 자동 배치 + 렌더
     - setNodeState(nodeId, state)
     - setEdgeState(parentId, childId, state)
     - addNode(parentId, childData, position): 새 노드 추가
     - reset()

   - linked-list-chain.ts:
     - setList(values): 박스 + 화살표 체인 렌더
     - setItemState(index, state)
     - rewirePointer(fromIdx, toIdx): 포인터 재연결 애니메이션
     - insertAt(index, value): 새 노드 삽입 + 애니메이션
     - reset()

   - queue-display.ts:
     - enqueue(value), dequeue(), reset()
     - size 속성 노출

   - ordered-list.ts:
     - append(value), reset()

   - code-view.ts (★중요):
     - setSource(lines, sourceMap): 코드 라인들 + phase 매핑 표시
     - highlightPhase(phaseName): 같은 phase 태그 라인 강조
     - clearHighlight()
     - 이게 IR/Transpiler 통합 지점.
       JSON에서 ir과 transpiler를 지정하면 러너가 미리 transpile해서
       code-view.setSource()로 넘김.

2. 디자인 시스템 토큰:
   - src/views/design-tokens.ts에 색상·간격·폰트 정의
   - 각 뷰가 이 토큰만 참조 (하드코딩 금지)
   - 일관된 룩 보장

3. 각 뷰별 단위 테스트:
   - 뷰 인스턴스화
   - 메서드 호출 시 DOM이 예상대로 변하는지

4. 통합 테스트:
   - 단계 2의 더미 facet은 그대로 작동해야 함 (회귀 검증)
   - 새 더미 추가: bar-chart 뷰만 사용하는 단순 시각화
     (예: 막대들이 색만 바뀌는 데모)

진행 후 다음을 보고:
- 구현된 뷰 목록 + 각 뷰의 주요 메서드
- code-view가 IR/Transpiler를 어떻게 호출하는지의 인터페이스
- 다음 단계 진입 가능 여부
```

---

## 단계 4 — QuickSort 마이그레이션

```
[배경 컨텍스트 삽입]

기존 MVP의 QuickSort 예제를 새 4-layer 구조로 마이그레이션한다.
이게 첫 실제 검증. 이전 구조의 동작이 새 구조에서 동등하거나 더 나은지 확인.

작업:

1. 기존 QuickSort 코드 분석:
   - 어디에 알고리즘 로직이 있는지
   - 어디에 시각화 로직이 있는지
   - phase emit 패턴 파악
   - IR/Transpiler가 어떻게 연결돼있는지

2. 새 구조로 분해:

   (a) 알고리즘 모듈 (packages/algorithms/quicksort/src/index.ts):
   ```typescript
   export async function quicksort(ctx) {
     const arr = ctx.data.values;
     await partitionRecurse(arr, 0, arr.length - 1, ctx);
     await ctx.emit({ type: 'done' });
   }

   async function partitionRecurse(arr, lo, hi, ctx) {
     if (ctx.cancelled || lo >= hi) return;
     const pivot = arr[hi];
     await ctx.emit({ type: 'highlight', target: `index:${hi}`,
                     payload: { kind: 'pivot' } });
     // ... partition 로직 + 재귀
   }
   ```
   
   - 기존 phase 어휘를 표준 이벤트 어휘로 변환 (highlight/mark/state-changed 등)
   - 재귀 콜스택은 알고리즘 자기가 가짐 (코루틴 자연스러움)
   - ctx.metric으로 비교/교환 카운트

   (b) Projector 모듈 (packages/algorithms/quicksort/src/projector.ts):
   ```typescript
   export function quicksortProjector(views) {
     const { stage, codePanel, controls } = views;
     return {
       onInit(initialData) {
         stage.setData(initialData.values);
       },
       onEvent(event) {
         switch (event.type) {
           case 'highlight':
             // index 추출, stage.setItemState 호출
             // codePanel.highlightPhase 호출 (이벤트 종류로 phase 매핑)
             break;
           // ...
         }
       },
       onReset() { stage.reset(); codePanel.clearHighlight(); }
     };
   }
   ```
   
   - 알고리즘 이벤트 → 뷰 메서드 매핑이 핵심 책임
   - code-view 동기화도 여기서 처리 (이벤트 → phase → highlight)

   (c) IR과 Transpiler:
   - 기존 IR/Transpiler 코드를 그대로 살린다
   - 패키지 구조도 유지 (@facet/algorithm-quicksort 안에 ir, transpiler 모듈)
   - 알고리즘 모듈이 ir·transpiler를 직접 참조하지 않음
   - JSON에서 code-view 블록의 ir·transpiler 필드로 연결

   (d) JSON 선언 (packages/algorithms/quicksort/src/facet.json):
   ```json
   {
     "id": "facet:quickSort",
     "title": "퀵 정렬",
     "algorithm": "module:quicksort",
     "projector": "module:quicksortProjector",
     "initialData": { "type": "array", "values": [...] },
     "layout": {
       "type": "column",
       "children": [
         { "ref": "header" },
         {
           "type": "row", "grow": 1,
           "children": [
             { "ref": "stage", "grow": 1 },
             { "ref": "codePanel", "grow": 1 }
           ]
         },
         { "ref": "controls" }
       ]
     },
     "blocks": {
       "header": { "type": "title-block" },
       "stage": { "type": "bar-chart" },
       "codePanel": {
         "type": "code-view",
         "ir": "ir:quickSort-imperative",
         "transpiler": "transpiler:python-imperative"
       },
       "controls": { ... }
     }
   }
   ```

3. 러너 확장 — IR/Transpiler 통합:
   - JSON 로드 시 code-view 블록이 있으면 IR + Transpiler 조회
   - 러너가 transpile 호출, 결과를 code-view.setSource로 넘김
   - Projector가 onEvent에서 codePanel.highlightPhase 호출 가능

4. 검증:
   - 새 구조의 quickSort가 기존과 시각적으로 동등한지
   - 코드 패널이 phase 동기화되는지
   - 재생/정지/단계/리셋/속도 모두 작동
   - 단계 2/3의 더미들도 여전히 작동 (회귀 없음)

5. 기존 QuickSort 코드는 아직 제거하지 않는다 (다음 단계에서 비교용).

진행 후 다음을 보고:
- 알고리즘 모듈 코드 (요약)
- Projector 모듈 코드 (요약)
- JSON 파일
- 작동 스크린샷 또는 영상
- 기존 vs 새 구조 비교 (코드 라인 수, 명확성 등)
- 다음 단계 진입 가능 여부
```

---

## 단계 5 — Tiptap 호스트 어댑터 마이그레이션

```
[배경 컨텍스트 삽입]

QuickSort가 새 구조로 작동한다. 이제 Tiptap 어댑터를 새 러너에 연결한다.
DSL 표기와 NodeView가 새 createInstance를 호출하도록 변경.

작업:

1. DSL 변경:
   - 기존: {facet:loop facet:bubbleSort} (두 식별자)
   - 새: {facet:quickSort} (단일 식별자)
   - 파서 단순화: 단일 식별자만 받도록
   - 식별자가 facet:* 카탈로그에 있는지 확인 (카탈로그는 등록된 JSON id 목록)

2. Tiptap Extension 변경 (packages/host-tiptap/):
   - addAttributes: { id: string } 단일 필드
   - input rule: {facet:[a-z-]+} 매치하면 id 추출 후 노드 변환
   - parseHTML / renderHTML 갱신

3. NodeView 변경:
   ```typescript
   export function FacetNodeView({ node }) {
     const containerRef = useRef<HTMLDivElement>(null);
     const instanceRef = useRef(null);
     
     useEffect(() => {
       if (!containerRef.current) return;
       
       const facetJson = getFacetById(node.attrs.id);  // 등록된 JSON 조회
       if (!facetJson) {
         containerRef.current.textContent = `[unknown facet: ${node.attrs.id}]`;
         return;
       }
       
       const instance = runFacet(facetJson, containerRef.current);
       instanceRef.current = instance;
       
       return () => instance.destroy();
     }, [node.attrs.id]);
     
     return (
       <NodeViewWrapper as="span" className="facet-node">
         <div ref={containerRef} className="facet-mount" />
       </NodeViewWrapper>
     );
   }
   ```

4. 카탈로그 등록 API 변경:
   - 기존: registerCatalog({ containers, algorithms, bodies, irs, transpilers })
   - 새: registerFacets([facetJson1, facetJson2, ...])
         registerAlgorithm('quicksort', quicksortFn)
         registerProjector('quicksortProjector', quicksortProjectorFn)
         registerIR(...), registerTranspiler(...)  // IR/Transpiler 보존

   호스트 앱이 setup 시:
   ```typescript
   import { registerAlgorithm, registerProjector, registerFacets,
            registerIR, registerTranspiler } from '@facet/core';
   import { quicksort, quicksortProjector,
            quicksortFacet, quicksortIRs, quicksortTranspilers
          } from '@facet/algorithm-quicksort';

   registerAlgorithm('quicksort', quicksort);
   registerProjector('quicksortProjector', quicksortProjector);
   quicksortIRs.forEach(ir => registerIR(ir.id, ir));
   quicksortTranspilers.forEach(t => registerTranspiler(t.id, t));
   registerFacets([quicksortFacet]);
   ```

5. 검증:
   - Tiptap 에디터에서 {facet:quickSort} 입력 → 인터랙티브 영역 등장
   - 노드 삭제 시 instance.destroy() 호출 (메모리 누수 없음)
   - 노드 복제, 이동 시 라이프사이클 정상

6. 기존 코드 정리:
   - 더 이상 쓰이지 않는 기존 Container/Body/Lens 코드를 deprecated 마킹 또는 제거 검토
   - 단, IR/Transpiler 관련 코드는 보존

진행 후 다음을 보고:
- Tiptap 어댑터 변경 코드 (요약)
- 호스트 앱 setup 변경
- 에디터에서 작동하는 모습
- 기존 코드 중 제거 가능한 것 목록
- 다음 단계 진입 가능 여부
```

---

## 단계 6 — 정리 및 두 번째 시각화 추가

```
[배경 컨텍스트 삽입]

전체 구조가 새 4-layer로 완성됐다. 이제 정리와 두 번째 시각화 추가로 검증.

작업:

1. 기존 코드 정리:
   - 단계 5에서 식별한 deprecated 코드 제거
   - Container 카테고리, Lens 모듈, Catalog 자동 매칭 로직 등
   - IR/Transpiler 관련 코드는 그대로 유지
   - 빌드/테스트 통과 확인

2. 더미 코드 정리:
   - dummy/ 디렉토리의 검증용 코드 정리
   - 의미 있는 것은 examples/ 디렉토리로 이동
   - 의미 없는 것은 제거

3. 두 번째 시각화 추가 — bubbleSort:
   - QuickSort와 같은 방식으로 알고리즘 + Projector + IR + Transpiler + JSON
   - 기존 QuickSort 코드의 패턴을 그대로 따름
   - 차이점: bubbleSort는 재귀 없음, 단순 이중 루프
   - 검증: bar-chart 뷰가 QuickSort와 bubbleSort에서 모두 재사용되는지

4. README 갱신:
   - 새 4-layer 아키텍처 설명
   - 새 시각화 추가하는 방법 (algorithm + projector + JSON 작성 가이드)
   - 디렉토리 구조 도식

5. docs/ 갱신:
   - 01-architecture.md: 새 4-layer로 다시 씀
   - 02-dsl.md: 단일 식별자 문법으로 갱신
   - 03-catalog.md: 새 등록 API로 갱신
   - 04-runtime.md: 러너의 새 책임으로 갱신
   - 05-host-plugin.md: 새 createInstance 인터페이스로 갱신
   - 06-first-plugin-loop-bubblesort.md: 06-first-plugin-quicksort.md로 교체

6. 회귀 검증:
   - QuickSort, bubbleSort 모두 Tiptap에서 정상 작동
   - 빌드 깨끗
   - 타입 에러 없음

진행 후 다음을 보고:
- 제거된 파일 목록
- 새로 추가된 bubbleSort 파일들
- 갱신된 문서 요약
- 최종 디렉토리 구조 트리
- 다음 작업 후보 (BFS 등 추가 시각화) 제안
```

---

## 사용 시 주의사항

각 단계 프롬프트를 Claude Code에 줄 때:

1. **배경 컨텍스트는 매번 포함.** Claude Code는 단계 간 메모리가 없을 수 있으니 매번 큰 그림 제공.

2. **각 단계 끝에서 검증 후 다음 단계.** 한 단계라도 어긋나면 후속 단계가 모두 어긋나므로 반드시 사람이 중간 검증.

3. **단계 1, 2는 빠르게.** 뼈대만이라 30분~1시간. 단계 4가 가장 무거움 (3~5시간 예상).

4. **단계 5 이후 기존 코드 제거는 신중히.** Git 브랜치로 작업하고 단계마다 커밋. 문제 시 롤백 가능하게.

5. **각 단계의 "검증" 항목을 Claude Code가 실제로 수행하도록 강조.** "구현했다"가 아니라 "구현 + 작동 확인"까지.

6. **타입 안정성을 단계마다 강제.** TypeScript 빌드 깨끗 + lint 통과를 매 단계 종료 조건으로.
