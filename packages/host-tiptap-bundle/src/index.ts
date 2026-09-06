/**
 * @ffacet/host-tiptap-bundle — methii 등 외부 호스트 앱이 단일 의존으로 소비하는 ESM 번들 진입점.
 *
 * 책임 (얇은 포장):
 *  - @ffacet/host-tiptap 의 공개 표면 재노출 (FacetExtension, parseFacetRaw, createFacetNodeView, renderFacetMarkdown).
 *  - @ffacet/bootstrap 의 bootstrapFacet 재노출 (카탈로그 단일 출처).
 *  - @ffacet/bootstrap 의 getFacetCatalog 재노출 — 호스트가 facet 모듈 로드 없이
 *    추가 가능 시각화 목록(id/title/description/domain)에 접근하는 경로.
 *  - @ffacet/bootstrap 의 loadFrameworkMessages 재노출 — 빌트인 view 문구(C10 의
 *    프레임워크 층)를 호스트 locale 로 주입하는 경로. 이 번들을 단일 의존으로 쓰는
 *    호스트에는 여기 말고 다른 주입 수단이 없다.
 *
 * 호스트 사용 흐름:
 *   import { FacetExtension, bootstrapFacet } from '@ffacet/host-tiptap-bundle';
 *   bootstrapFacet();                                      // 앱 부팅 1회
 *   new Editor({ extensions: [FacetExtension, ...] });     // Tiptap 통합
 *
 * lazy 보존:
 *  - @ffacet/bootstrap 의 import('@ffacet/algorithm-*') 가 rollup 의 dynamic import 로 살아남아
 *    facet 별 chunk 로 분리된다. 호스트 Vite 가 그 chunk 그래프를 그대로 이어받는다.
 */

export {
  FacetExtension,
  parseFacetRaw,
  createFacetNodeView,
  renderFacetMarkdown,
  type FacetExtensionOptions,
} from '@ffacet/host-tiptap';

export {
  bootstrapFacet,
  getFacetCatalog,
  loadFrameworkMessages,
  type FacetCatalogEntry,
} from '@ffacet/bootstrap';
