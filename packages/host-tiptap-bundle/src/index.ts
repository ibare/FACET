/**
 * @facet/host-tiptap-bundle — methii 등 외부 호스트 앱이 단일 의존으로 소비하는 ESM 번들 진입점.
 *
 * 책임 (얇은 포장):
 *  - @facet/host-tiptap 의 공개 표면 재노출 (FacetExtension, parseFacetRaw, createFacetNodeView, renderFacetMarkdown).
 *  - @facet/bootstrap 의 bootstrapFacet 재노출 (카탈로그 단일 출처).
 *
 * 호스트 사용 흐름:
 *   import { FacetExtension, bootstrapFacet } from '@facet/host-tiptap-bundle';
 *   bootstrapFacet();                                      // 앱 부팅 1회
 *   new Editor({ extensions: [FacetExtension, ...] });     // Tiptap 통합
 *
 * lazy 보존:
 *  - @facet/bootstrap 의 import('@facet/algorithm-*') 가 rollup 의 dynamic import 로 살아남아
 *    facet 별 chunk 로 분리된다. 호스트 Vite 가 그 chunk 그래프를 그대로 이어받는다.
 */

export {
  FacetExtension,
  parseFacetRaw,
  createFacetNodeView,
  renderFacetMarkdown,
  type FacetExtensionOptions,
} from '@facet/host-tiptap';

export { bootstrapFacet } from '@facet/bootstrap';
