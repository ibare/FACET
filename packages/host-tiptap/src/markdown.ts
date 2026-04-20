/**
 * 마크다운 → HTML 변환. 본문에 등장하는 `{facet:<id>}` 토큰을
 * `<span data-facet="true" data-facet-id="<id>"></span>` 로 치환한다.
 *
 * inline-level marked extension 으로 등록하므로 \`코드\` 블록과 ```펜스 안의
 * 동일 패턴은 치환되지 않는다.
 */

import { marked, type MarkedExtension, type TokenizerAndRendererExtension } from 'marked';

type FacetToken = {
  type: 'facetInline';
  raw: string;
  id: string;
};

const facetInlineExtension: TokenizerAndRendererExtension = {
  name: 'facetInline',
  level: 'inline',
  start(src: string): number | undefined {
    const i = src.indexOf('{facet:');
    return i < 0 ? undefined : i;
  },
  tokenizer(src: string): FacetToken | undefined {
    const m = /^\{(facet:[a-zA-Z][a-zA-Z0-9-]*)\}/.exec(src);
    if (!m) return undefined;
    return { type: 'facetInline', raw: m[0], id: m[1] };
  },
  renderer(token): string {
    const t = token as unknown as FacetToken;
    return `<span data-facet="true" data-facet-id="${t.id}"></span>`;
  },
};

let installed = false;
function ensureInstalled(): void {
  if (installed) return;
  installed = true;
  marked.use({ extensions: [facetInlineExtension] } satisfies MarkedExtension);
}

/** 마크다운 문자열을 HTML 로 변환. facet 토큰은 인라인 placeholder span 으로. */
export function renderFacetMarkdown(md: string): string {
  ensureInstalled();
  return marked.parse(md, { async: false }) as string;
}
