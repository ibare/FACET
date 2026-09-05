/**
 * Facet 개념(concept) authoring 메타데이터 스키마.
 *
 * ── 왜 facet 이 아니라 개념인가
 *
 * 호스트의 글 작성 파이프라인(plan → writer → 확장변환 → 조립)에서 writer 가
 * 고르는 단위는 개념이다. 실제 화면에 마운트되는 facet 은 한 개념에 여러 개
 * 붙을 수 있고(canonical 1 + aspect N), 시간이 지나면 추가·교체된다. 글에
 * 박히는 봉투가 개념을 가리키면 facet 이 바뀌어도 이미 발행된 글이 깨지지
 * 않는다.
 *
 * ── 두 종류의 필드를 섞지 않는다
 *
 *   surface  — 임베딩 재료. 호스트가 임베딩해 "이 글에 어떤 개념이 맞는가" 를
 *              가리는 데만 쓴다. 중립적이고 검색어에 걸리는 문장이어야 한다.
 *   briefing — 선택이 끝난 뒤 writer 에게 전달하는 집필 재료. 화면에서 실제로
 *              무엇이 관찰되는지, 어떤 용어를 써야 화면과 글이 맞물리는지.
 *
 * 한 필드에 두 용도를 겹치면 양쪽 다 나빠진다. FacetJson.description 의 시적인
 * 한 줄("컨베이어 벨트 — 가장 오래 기다린 것이 가장 먼저 떠나는 기계")이 좋은
 * 글이면서도 검색어에 안 걸리는 것이 그 예다.
 *
 * ── 의존 0
 *
 * 이 패키지는 @ffacet/core 를 포함해 어떤 워크스페이스 패키지도 import 하지
 * 않는다. 소비자가 브라우저 런타임이 아니라 호스트의 LLM 서버이기 때문에,
 * 개념 메타를 읽는 대가로 View / transpiler 코드가 딸려오면 안 된다.
 * (core 의 LocaleStr 은 bare string 을 허용해 locale 을 특정할 수 없으므로
 * 임베딩 대상 언어를 지목해야 하는 여기서는 쓸 수 없기도 하다.)
 */

/**
 * 언어 코드 → 값.
 *
 * 이 스키마에서 언어 구분이 남는 곳은 `screen.labels` 하나뿐이다. 화면에 실제로
 * 박혀 있는 문자열이라 번역 대상이 아니기 때문이다 — 한국어 화면에는 "크기: 3 / 10"
 * 이라고 적혀 있고, 영어 definition 을 호스트가 번역해서 그 문자열을 복원할 수는
 * 없다. 나머지 필드는 전부 영어 단일이며, 다른 언어가 필요하면 호스트가 번역해
 * 쓴다.
 */
export type LocaleMap<T> = Partial<Record<string, T>>;

/**
 * 임베딩 재료. 호스트가 이 필드만 보고 글 ↔ 개념 매칭을 수행한다.
 *
 * definition 작성 기준:
 *  - 은유·수사 금지. 중립적 기술문.
 *  - 다루는 연산 / 경계 조건 / 실제로 쓰이는 맥락을 명시적 단어로 담는다.
 *    글이 "메시지 큐" 라고 썼을 때 걸리려면 definition 에 그 말이 있어야 한다.
 *  - 한 문단. 개념의 경계를 긋되 옆 개념까지 넘보지 않는다.
 */
export type ConceptSurface = {
  /**
   * 개념의 정체 한 문장. 영어 단일.
   *
   * 짧게 유지한다. 한 벡터가 정체·연산·경계조건·응용맥락을 전부 평균내면 중심이
   * 흐려져 검색 정확도가 떨어진다. 응용 맥락과 구어 표현은 exemplarKeywords 가
   * 맡으므로 definition 에 다시 넣지 않는다. 호스트 taxonomy 노드의 definition
   * 과 같은 입자 (한 문장, 20~30 단어) 를 목표로 한다.
   *
   * 언어별로 나눠 임베딩하면 같은 개념이 벡터 공간에서 두 점으로 갈라져 매칭
   * 점수가 글의 언어에 따라 흔들리므로 영어 하나만 둔다.
   *
   * 수정하면 definitionHash 가 바뀌어 재임베딩 대상이 된다.
   */
  definition: string;
  /**
   * 검색면 확장. definition 이 담지 않는 구어·약어·응용 맥락을 채운다.
   * 글이 "메시지 큐" 라고 썼을 때 걸리게 하는 것이 이 필드의 일이다.
   */
  exemplarKeywords: string[];
};

/** 인접 개념과의 대비 한 줄. 링크는 개념 간에만 둔다 (facet 간에 두면 N^2 로 터진다). */
export type ConceptContrast = {
  /** 상대 개념 id. */
  concept: string;
  note: string;
};

/**
 * 선택 이후 재료. plan LLM 의 최종 판단 근거이자 writer 의 집필 재료.
 *
 * ── 두 가지 금지
 *
 * 1. **화면에 없는 것을 쓰지 않는다.** 없는 기능을 "없다" 고 적으면 정보가 되는
 *    대신 그 개념을 맥락에 집어넣는 역효과만 낸다. 코드 패널이 없는 facet 이면
 *    코드 패널을 아예 언급하지 않는다. 부정 정보를 담는 필드는 avoidWhen 하나뿐
 *    이며, 그것은 도출 불가능한 정보라 존재 이유가 다르다.
 *
 *    구분 하나 — 화면에 **있는** 요소가 기대와 다르게 동작하는 것은 부정형이
 *    아니라 관찰이다. 카운터가 화면에 떠 있는데 재생 내내 0 이면 그것은 적는다.
 *
 * 2. **다른 facet 을 기준으로 삼지 않는다.** 각 시각화는 독립적이며, 무엇을
 *    보여주는지는 자기 화면만으로 기술된다. "queue facet 과 달리" 같은 서술은
 *    비교 대상을 모르는 소비자에게 무의미하고, 비교 대상이 바뀌면 함께 틀린다.
 *    개념 사이의 대비는 contrastWith 가 개념 층위에서만 다룬다.
 */
export type ConceptBriefing = {
  /** 화면에서 실제로 관찰되는 사건. 글이 가리킬 수 있는 것만 적는다. */
  observable: string[];
  /** 독자가 마주하는 인터페이스. 아래 ConceptScreen 참조. */
  screen: ConceptScreen;
  /**
   * 붙이면 안 되는 조건.
   *
   * "언제 쓰는가" 는 definition 과 observable 에서 도출되므로 따로 두지 않는다.
   * 반대로 "언제 쓰면 안 되는가" 는 어디에서도 도출되지 않는다 — definition 에
   * "queue" 가 들어 있는 한 우선순위 큐 글은 반드시 잘못 걸리며, 그 오류를 막는
   * 것은 이 필드뿐이다. 검색이 만드는 오검출을 되돌리는 유일한 장치다.
   */
  avoidWhen: string[];
  /** 인접 개념 대비. writer 가 비교 문단을 쓸 수 있게 한다. */
  contrastWith: ConceptContrast[];
};

/**
 * 독자가 실제로 마주하는 인터페이스.
 *
 * 글이 화면을 가리키려면 화면에 무슨 글자가 적혀 있는지, 독자가 무엇을 눌러야
 * 하는지를 알아야 한다. 이것을 모르면 writer 는 "front 게이트를 보라" 처럼
 * 화면에 없는 말을 쓰거나("OUT" 이라고 적혀 있다), "코드 패널의 파이썬 코드를
 * 보라" 처럼 독자가 버튼을 눌러야만 나타나는 것을 이미 보이는 양 쓴다.
 *
 * labels 는 view 구현과 facet.ts 선언에 원천이 있으므로, 손으로 옮겨 적으면
 * 어긋난다. codegen 이 붙기 전까지만 손으로 유지하고, 붙는 즉시 추출로 넘긴다.
 */
export type ConceptScreen = {
  /**
   * 독자가 할 수 있는 조작과 초기 상태. 영어 단일.
   *
   * 화면에 뜨는 문자열 목록(labels)은 여기 선언하지 않는다. 원천이 FacetJson 이라
   * 손으로 옮겨 적으면 반드시 어긋나므로 (실제로 title-block 제목과 stack 의
   * 입력/출력 트랙 라벨이 누락된 적이 있다) `pnpm screen:gen` 이 뽑은 표에서
   * 조회 시점에 붙인다.
   */
  affordances: string[];
};

/**
 * 공개 조회 API 가 내보내는 screen — 생성된 표에서 가져온 labels 가 요청 locale 로
 * 해석되어 붙은 형태.
 */
export type ResolvedConceptScreen = ConceptScreen & {
  /** 화면에 실제로 렌더되는 문자열. FacetJson 에서 기계 수집한 것이라 어긋나지 않는다. */
  labels: string[];
};

/**
 * 손으로 쓰는 개념 선언. concepts/<id>.ts 한 파일에 하나.
 */
export type FacetConceptSource = {
  /**
   * 개념 id. 봉투 `{FACET:<id>}` 의 <id> 이자 카탈로그 키. lowerCamelCase.
   *
   * **그 개념이 실제로 다루는 것을 특정한다.** 같은 일반 명사를 쓰는 다른 개념이
   * 이미 있거나 앞으로 생길 수 있으면 변별어를 붙인다 — `queue` 가 아니라
   * `queueFifo` 다. 우선순위 큐 · 원형 큐 · 덱이 모두 "큐" 를 자칭하는데 id 가
   * `queue` 면 봉투가 그 넓이를 그대로 물려받아, writer 가 우선순위 큐 글에
   * `{FACET:queue}` 를 아무 저항 없이 쓴다. id 의 변별력이 오선택을 막는 첫
   * 방어선이고, avoidWhen 은 그것을 통과한 나머지를 막는 두 번째 방어선이다.
   *
   * 반대로 변별이 필요 없으면 붙이지 않는다. 모든 스택이 LIFO 이므로 `stack`
   * 은 그대로 둔다. 쓰지도 않을 변별어는 id 를 길게만 만든다.
   *
   * facet id 와 같을 필요는 없다 (`queueFifo` ↔ `facet:queue`). 대응은
   * canonicalFacet 이 명시하며, 개념이 aspect 를 여럿 거느리면 애초에 같을 수
   * 없다.
   */
  id: string;
  /**
   * 사람이 읽는 이름. plan 인덱스에 뜨는 것이 이 값이다.
   *
   * id 가 변별을 담더라도 label 을 일반 명사로 줄이지 않는다. 목록에서
   * `Queue` 와 `Priority Queue` 가 나란히 있으면 앞이 상위 개념으로 읽히는데
   * 실제로는 형제다.
   */
  label: string;
  /** facet 디렉터리 구조에서 오는 도메인 (cs-fundamentals / network / os ...). */
  domain: string;
  /**
   * 이 개념의 기본 진입점 facet id. 정확히 하나.
   * `{FACET:<id>}` 는 언제나 이것으로 해석되므로 선택의 모호함이 남지 않는다.
   */
  canonicalFacet: string;
  /**
   * 개념의 한 대목만 확대한 보조 facet. 기본 인덱스에 노출하지 않는다.
   * 부모 개념이 이미 선택된 뒤에만 writer 에게 보인다.
   */
  aspects?: string[];
  /**
   * 상위 개념 id. 글의 주제가 어중간하거나 이 개념의 facet 이 사라졌을 때
   * 거슬러 올라갈 방향을 준다.
   */
  specializes?: string;
  surface: ConceptSurface;
  briefing: ConceptBriefing;
};

/**
 * 공개 조회 API 가 반환하는 형태 — 선언 + 파생값.
 *
 * definition 이 영어 단일이므로 definitionHash 도 하나다.
 *
 * 향후 codegen 확장 시 여기에 기계 추출 필드가 붙는다 — facet.ts 의 metrics /
 * features / controls, irs.ts 의 phase 어휘, 레지스트리의 transpiler 지원 언어.
 * 손으로 쓰지 않으므로 선언과 어긋날 수 없다. 지금은 추출기가 없어 선언하지
 * 않는다 (채우지 않을 필드를 타입에 두지 않는다).
 */
export type FacetConcept = Omit<FacetConceptSource, 'briefing'> & {
  briefing: Omit<ConceptBriefing, 'screen'> & { screen: ResolvedConceptScreen };
  /** definition 콘텐츠 해시. 이 값이 그대로면 재임베딩할 필요가 없다. */
  definitionHash: string;
  /** screen.labels 를 해석할 때 실제로 적용된 locale. 요청 locale 이 없으면 'en'. */
  locale: string;
};
