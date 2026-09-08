/**
 * overlappingSubproblems facet JSON 선언.
 *
 * @piece 조각 — "재귀 정의를 곧이곧대로 따르면 같은 항을 몇 번이나 다시
 * 푸는가" 하나에만 답한다. 캔버스와 컨트롤바뿐이라 `layout` 은 러너에 맡기고,
 * 제목(title-block)과 metrics 는 두지 않는다 (S-piece).
 *
 * 진행 모델은 reactive — mount 하면 스스로 펼치기 시작하고, 걸음 간격은
 * `initialData.stepMs` 가 정한다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL } from '@ffacet/core/runtime';

export const overlappingSubproblemsFacet: FacetJson = {
  id: 'facet:overlappingSubproblems',
  title: {
    en: 'Overlapping Subproblems',
    ko: '중복 부분 문제',
  },
  description: {
    en: 'Follow the recursive definition literally and the same term sprouts again and again on different branches',
    ko: '재귀 정의를 곧이곧대로 따르면 같은 항이 다른 가지에서 자꾸 다시 돋는다',
  },
  algorithm: 'module:overlappingSubproblems',
  projector: 'module:overlappingSubproblemsProjector',
  initialData: {
    type: 'overlapping-subproblems',
    n: 5,
    stepMs: 600,
  },
  messages: {
    'caption.newTerm': {
      en: 'f({n}) — solving this term for the first time',
      ko: 'f({n}) — 처음 푸는 항이다',
    },
    'caption.repeatTerm': {
      en: 'f({n}) turns up again — that is {count} times now',
      ko: 'f({n}) 이 또 나왔다 — 이걸로 {count} 번째다',
    },
    'caption.summary': {
      en: '{calls} calls to reach {value}, yet only {distinct} different terms — f({worst}) alone was solved {count} times',
      ko: '{value} 하나를 얻는 데 {calls} 번 — 서로 다른 항은 {distinct} 개뿐인데 f({worst}) 만 {count} 번 풀렸다',
    },
  },
  blocks: {
    stage: { type: 'overlapping-subproblems-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
};
