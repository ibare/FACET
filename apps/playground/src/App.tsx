import { useEffect, useRef } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { FacetExtension } from '@facet/host-tiptap';
import { getCatalog } from '@facet/core';
import { bootstrapFacet } from './facet-bootstrap.js';

const INITIAL_CONTENT = `
<h1>FACET Playground</h1>
<p>본체가 phase 이름만 알립니다. 시각화와 두 패러다임 코드가 같은 phase 어휘를 공유하므로, 한 동작이 일어날 때 모든 렌즈가 동시에 그 위치를 비춥니다.</p>
<p>아래 DSL 표현이 Tiptap 편집기 안에서 인터랙티브 영역으로 렌더링됩니다. <code>{facet:loop facet:bubbleSort}</code></p>
<p><span data-facet="true" data-raw="{facet:loop facet:bubbleSort}"></span></p>
<p>위 시뮬레이션은 편집기 안에서 실행됩니다. 분포·크기를 바꾸고 시작 버튼을 눌러보세요. 아래에 새 표현을 직접 타이핑해도 노드로 변환됩니다.</p>
<p></p>
`;

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);

  useEffect(() => {
    bootstrapFacet();
    if (!hostRef.current) return;

    const editor = new Editor({
      element: hostRef.current,
      extensions: [
        StarterKit,
        FacetExtension.configure({
          catalog: getCatalog(),
          lenses: ['circuit', 'code'],
        }),
      ],
      content: INITIAL_CONTENT,
      autofocus: false,
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  return (
    <div className="playground">
      <header className="playground__header">
        <div className="playground__brand">FACET · Playground</div>
        <div className="playground__sub">Tiptap 편집기 안에서 인터랙티브 DSL 렌더링</div>
      </header>
      <div ref={hostRef} className="playground__editor" />
      <footer className="playground__footer">
        <span>편집기 안에 <code>{'{facet:loop facet:bubbleSort}'}</code>를 타이핑하면 노드로 변환됩니다.</span>
      </footer>
    </div>
  );
}
