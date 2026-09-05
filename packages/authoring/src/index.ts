/**
 * @ffacet/authoring — facet 개념 authoring 메타데이터.
 *
 * 호스트의 글 작성 파이프라인이 달성해야 하는 두 가지를 각각 다른 필드가
 * 담당한다.
 *
 *   1. 글에 들어갈 시각화 선택
 *      → `surface` (definition + exemplarKeywords). 호스트가 임베딩해
 *        글 ↔ 개념 매칭에 쓴다. `definitionHash` 로 바뀐 것만 재임베딩한다.
 *        `briefing.avoidWhen` 은 그 검색이 만드는 오검출을 되돌린다.
 *
 *   2. 선택된 시각화의 내용을 writer 에게 전달
 *      → `briefing` (observable / screen / avoidWhen / contrastWith).
 *        선택이 끝난 뒤에만 쓰인다.
 *
 * 이 패키지는 어떤 워크스페이스 패키지도 import 하지 않는다. 소비자가 브라우저
 * 런타임이 아니라 호스트의 LLM 서버라서, 개념 메타를 읽는 대가로 View /
 * transpiler 코드가 딸려오면 안 되기 때문이다.
 */

import type {
  ConceptScreen,
  FacetConcept,
  FacetConceptSource,
  ResolvedConceptScreen,
} from './concept-types.js';
import { CONCEPT_SOURCES } from './concepts/index.js';
import { contentHash } from './hash.js';
import { SCREEN_LABELS } from './screen-labels.generated.js';

export type {
  FacetConcept,
  FacetConceptSource,
  ConceptSurface,
  ConceptBriefing,
  ConceptScreen,
  ResolvedConceptScreen,
  ConceptContrast,
  LocaleMap,
} from './concept-types.js';
export { contentHash } from './hash.js';

/**
 * 생성된 screen 라벨 표에 요청 locale 이 없을 때의 대체 언어.
 *
 * view 들의 라벨 조회 (conveyor-queue pickLabels 등) 가 같은 규칙이라, 미지원
 * locale 에서 화면이 실제로 영어로 뜨는 것과 일치한다. 즉 fallback 은 편의가
 * 아니라 화면 사실의 반영이다.
 */
const FALLBACK_LOCALE = 'en';

/**
 * id 중복 검사 + definitionHash 계산. 모듈 로드 시 1회.
 *
 * id 가 중복되면 여기서 throw 하므로 import 자체가 실패한다. 의도된 fail-fast
 * 다 — 소비자가 호스트의 LLM 서버라, 중복 개념이 조용히 하나로 덮여 임베딩
 * 인덱스가 어긋난 채 돌아가는 것보다 부팅에서 멈추는 편이 낫다.
 */
function validate(): readonly (FacetConceptSource & { definitionHash: string })[] {
  const seen = new Set<string>();
  return CONCEPT_SOURCES.map((source) => {
    if (seen.has(source.id)) {
      throw new Error(`개념 id 중복 선언: ${source.id}`);
    }
    seen.add(source.id);
    return { ...source, definitionHash: contentHash(source.surface.definition) };
  });
}

/** contrastWith 가 실재하는 개념만 가리키는지 확인. 미선언 id 는 오타다. */
function validateContrasts(concepts: readonly FacetConceptSource[]): void {
  const ids = new Set(concepts.map((c) => c.id));
  for (const c of concepts) {
    for (const x of c.briefing.contrastWith) {
      if (!ids.has(x.concept)) {
        throw new Error(`미선언 개념 참조: ${c.id}.contrastWith → ${x.concept}`);
      }
    }
  }
}

const VALIDATED = validate();
validateContrasts(VALIDATED);

/**
 * screen.labels 를 요청 locale 하나로 접는다.
 *
 * 실제로 적용된 locale 을 함께 돌려준다. 요청 locale 에 라벨이 없으면 영어가
 * 나가는데, 그 사실을 숨기면 호스트가 화면에 뜨지도 않을 문자열을 그 언어의
 * 라벨로 믿게 된다.
 */
function resolveScreen(
  screen: ConceptScreen,
  canonicalFacet: string,
  locale: string,
): { screen: ResolvedConceptScreen; applied: string } {
  const byLocale = SCREEN_LABELS[canonicalFacet] ?? {};
  const direct = byLocale[locale];
  if (direct !== undefined) {
    return { screen: { ...screen, labels: direct }, applied: locale };
  }
  return {
    screen: { ...screen, labels: byLocale[FALLBACK_LOCALE] ?? [] },
    applied: FALLBACK_LOCALE,
  };
}

const CACHE = new Map<string, readonly FacetConcept[]>();

function build(locale: string): readonly FacetConcept[] {
  const cached = CACHE.get(locale);
  if (cached) return cached;

  const built = VALIDATED.map((c) => {
    const { screen, applied } = resolveScreen(c.briefing.screen, c.canonicalFacet, locale);
    return { ...c, briefing: { ...c.briefing, screen }, locale: applied };
  });
  CACHE.set(locale, built);
  return built;
}

/**
 * 전체 개념 목록. 선언 순서를 유지한다.
 *
 * `locale` 은 `screen.labels` 를 어느 언어로 접을지만 결정한다. 나머지 필드는
 * 전부 영어 단일이며, 다른 언어가 필요하면 호스트가 번역해 쓴다. 미지원
 * locale 이면 영어로 대체되며, 그 경우 반환된 `locale` 필드는 'en' 이 된다 —
 * 호스트가 대체 여부를 알 수 있어야 화면에 없는 라벨을 그 언어의 것으로 믿지
 * 않는다.
 */
export function getFacetConcepts(locale: string = FALLBACK_LOCALE): readonly FacetConcept[] {
  return build(locale);
}

/** 개념 단건 조회. 봉투 `{FACET:<id>}` 의 <id> 로 찾는다. */
export function getFacetConcept(
  id: string,
  locale: string = FALLBACK_LOCALE,
): FacetConcept | undefined {
  return build(locale).find((c) => c.id === id);
}
