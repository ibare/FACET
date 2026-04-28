/**
 * @facet/host-tiptap-bundle — methii 등 외부 호스트 앱이 단일 의존으로 소비하는 ESM 번들 진입점.
 *
 * 책임:
 *  - @facet/host-tiptap 의 공개 표면 (FacetExtension, parseFacetRaw, createFacetNodeView, renderFacetMarkdown) 재노출.
 *  - bootstrapFacet() 으로 view / transpiler 정적 등록 + 21 facet 의 lazy loader 등록.
 *
 * 호스트 사용 흐름:
 *   import { FacetExtension, bootstrapFacet } from '@facet/host-tiptap-bundle';
 *   bootstrapFacet();                                      // 앱 부팅 1회
 *   new Editor({ extensions: [FacetExtension, ...] });     // Tiptap 통합
 *
 * lazy 보존:
 *  - bootstrap.ts 의 import('@facet/algorithm-*') 가 rollup 의 dynamic import 로 살아남아
 *    facet 별 chunk 로 분리된다. 호스트 Vite 가 그 chunk 그래프를 그대로 이어받는다.
 */

export {
  FacetExtension,
  parseFacetRaw,
  createFacetNodeView,
  renderFacetMarkdown,
  type FacetExtensionOptions,
} from '@facet/host-tiptap';

export { bootstrapFacet } from './bootstrap.js';
