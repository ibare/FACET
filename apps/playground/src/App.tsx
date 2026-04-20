import { useEffect, useRef } from 'react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { FacetExtension } from '@facet/host-tiptap';
import { bootstrapFacet } from './facet-bootstrap.js';

const INITIAL_CONTENT = `
<h1>FACET Playground</h1>
<p>알고리즘이 표준 이벤트(highlight/swap/state-changed/...)를 발신하면, Projector 가 등록된 View 들에 매핑합니다. 시각화·코드 패널·메트릭이 동일한 한 흐름에서 갱신됩니다.</p>
<p>아래 DSL 표현이 Tiptap 편집기 안에서 인터랙티브 영역으로 렌더링됩니다. <code>{facet:quickSort}</code></p>
<p><span data-facet="true" data-facet-id="facet:quickSort"></span></p>
<p>편집기 안에 <code>{facet:quickSort}</code> 를 그대로 타이핑해도 노드로 변환됩니다.</p>
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
      extensions: [StarterKit, FacetExtension],
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
        <span>편집기 안에 <code>{'{facet:quickSort}'}</code>를 타이핑하면 노드로 변환됩니다.</span>
      </footer>
    </div>
  );
}
