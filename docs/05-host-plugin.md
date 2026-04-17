# 05. Host Plugin

호스트 어댑터는 FACET 런타임을 특정 마크다운 환경에 통합한다. 호스트마다 마크다운을 다루는 방식이 다르므로 (Tiptap의 노드 시스템, ProseMirror 스키마, 정적 마크다운 렌더러의 토큰 변환 등), 어댑터가 그 차이를 흡수한다.

## 어댑터의 책임

1. **DSL 발견**: 호스트의 마크다운 콘텐츠에서 `{facet:...}` 패턴을 식별
2. **마운트 영역 확보**: 발견된 위치에 인터랙티브 영역을 띄울 DOM 노드 준비
3. **런타임 호출**: `@facet/core`의 `createInstance` 호출
4. **라이프사이클 관리**: 호스트가 노드를 삭제·이동·복제할 때 인스턴스 정리·재생성
5. **편집기 통합**: 편집기 호스트의 경우, 표현식 작성 보조 (자동완성, 카탈로그 검색 등)

## Tiptap 어댑터

Tiptap (ProseMirror 기반)은 노드 단위로 콘텐츠를 다룬다. FACET 표현식은 인라인 노드(혹은 블록 노드)로 표현된다.

### 패키지: `@facet/host-tiptap`

```
@facet/host-tiptap/
  src/
    facet-extension.ts      — Tiptap Extension (노드 정의)
    facet-node-view.ts      — NodeView (DOM 렌더링)
    input-rule.ts           — 입력 규칙 (사용자가 {facet:...} 타이핑 시 노드 변환)
    paste-rule.ts           — 붙여넣기 규칙
    suggestion.ts           — 자동완성 (선택적, v2)
  package.json
  README.md
```

### Extension 정의

```typescript
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';  // 또는 다른 렌더러
import { FacetNodeView } from './facet-node-view';
import { parseFacetExpr } from '@facet/core';

export const FacetExtension = Node.create({
  name: 'facet',
  group: 'inline',          // 인라인 노드 (단락 안에 들어감)
  inline: true,
  atom: true,               // 내부 편집 불가능 (단일 객체)
  
  addAttributes() {
    return {
      raw: { default: '' },                  // 원본 표현식 문자열
      container: { default: null },          // 파싱된 컨테이너 식별자
      bodies: { default: [] },               // 파싱된 본체 식별자들
    };
  },
  
  parseHTML() {
    return [{ tag: 'span[data-facet]' }];
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-facet': 'true' })];
  },
  
  addNodeView() {
    return ReactNodeViewRenderer(FacetNodeView);
  },
  
  addInputRules() {
    // 사용자가 `{facet:loop facet:bubbleSort}` 타이핑 후 닫는 `}` 입력 시
    // 그 텍스트를 facet 노드로 변환
    return [
      {
        find: /\{facet:[^\}]+\}$/,
        handler: ({ state, range, match }) => {
          const text = match[0];
          const parsed = parseFacetExpr(text);
          if (!parsed) return null;
          
          const { tr } = state;
          tr.replaceWith(range.from, range.to, this.type.create({
            raw: text,
            container: parsed.container.name,
            bodies: parsed.bodies.map(b => b.name),
          }));
          return tr;
        },
      },
    ];
  },
});
```

### NodeView (인터랙티브 영역 렌더링)

```typescript
import { NodeViewWrapper } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { createInstance, getCatalog } from '@facet/core';

export function FacetNodeView({ node }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ReturnType<typeof createInstance> | null>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const instance = createInstance({
      expr: {
        container: node.attrs.container,
        bodies: node.attrs.bodies,
      },
      catalog: getCatalog(),         // 글로벌 카탈로그
      lenses: ['circuit', 'code'],
      mountPoint: containerRef.current,
    });
    
    instanceRef.current = instance;
    
    return () => {
      instance.destroy();
    };
  }, [node.attrs.container, node.attrs.bodies.join(',')]);
  
  return (
    <NodeViewWrapper as="span" className="facet-node">
      <div ref={containerRef} className="facet-mount" />
    </NodeViewWrapper>
  );
}
```

### 사용

호스트 앱이 Tiptap 에디터 설정 시 Extension 추가:

```typescript
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { FacetExtension } from '@facet/host-tiptap';

// 카탈로그 등록
import { registerCatalog } from '@facet/core';
import { loopContainer } from '@facet/container-loop';
import { bubbleSortBundle } from '@facet/algorithm-bubblesort';
import { mainstreamTranspilers } from '@facet/transpilers-mainstream';

registerCatalog({
  containers: [loopContainer],
  algorithms: [bubbleSortBundle.algorithm],
  bodies: [bubbleSortBundle.body],
  irs: bubbleSortBundle.irs,
  transpilers: mainstreamTranspilers,
});

// 에디터 생성
const editor = new Editor({
  extensions: [
    StarterKit,
    FacetExtension,
  ],
  content: `
    <p>정렬 알고리즘은 입력 배열을 정렬된 순서로 재배치합니다.</p>
    <p><span data-facet="true" data-raw="{facet:loop facet:bubbleSort}"></span></p>
    <p>위 시뮬레이션을 다양한 분포로 시도해보세요.</p>
  `,
});
```

## 다른 호스트 구현 가이드 (예시)

### 정적 마크다운 렌더러 (예: marked, markdown-it)

```typescript
import MarkdownIt from 'markdown-it';
import { createInstance, getCatalog, parseFacetExpr } from '@facet/core';

const md = new MarkdownIt();

// 인라인 토큰으로 facet 표현식 인식
md.inline.ruler.after('emphasis', 'facet', (state, silent) => {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== 0x7B /* { */) return false;
  
  const match = state.src.slice(start).match(/^\{facet:[^\}]+\}/);
  if (!match) return false;
  
  if (!silent) {
    const token = state.push('facet', '', 0);
    token.content = match[0];
  }
  state.pos += match[0].length;
  return true;
});

md.renderer.rules.facet = (tokens, idx) => {
  const raw = tokens[idx].content;
  return `<div class="facet-mount" data-raw="${raw}"></div>`;
};

// 렌더 후 마운트 포인트 찾아서 인스턴스 생성
function hydrateFacetMounts(rootEl: HTMLElement) {
  rootEl.querySelectorAll('.facet-mount').forEach(el => {
    const raw = el.getAttribute('data-raw');
    const parsed = parseFacetExpr(raw);
    if (!parsed) return;
    createInstance({
      expr: { container: parsed.container.name, bodies: parsed.bodies.map(b => b.name) },
      catalog: getCatalog(),
      lenses: ['circuit', 'code'],
      mountPoint: el as HTMLElement,
    });
  });
}
```

### Notion 임베드, ProseMirror 직접 사용 등

각자 호스트의 노드/렌더링 모델에 맞춰 같은 패턴 반복:
1. DSL 패턴 발견
2. 그 자리에 마운트 영역 삽입
3. createInstance 호출
4. 라이프사이클 관리

## 첫 호스트 어댑터의 우선순위

`@facet/host-tiptap`이 첫 어댑터다. 이유:
- Tiptap이 학습 콘텐츠 작성 도구로 적합 (Notion 스타일 편집기)
- ProseMirror 기반이라 다른 ProseMirror 호스트로 패턴 이전 쉬움
- React 생태계 친화 (FACET 렌즈 구현이 React 친화적이면 통합이 매끄러움)

이후 호스트 어댑터 후보:
- `@facet/host-markdown-it` — 정적 마크다운 (블로그, 학습 자료)
- `@facet/host-mdx` — MDX 통합 (문서 사이트)
- `@facet/host-vscode` — VS Code 마크다운 미리보기 확장

각 호스트 어댑터는 코어를 건드리지 않는다. 코어가 호스트 무관하게 작동하는지가 어댑터 패턴의 검증.
