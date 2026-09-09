/**
 * relaxShorterPath facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "더 짧은 길을 찾았을 때, 정점이 이고 있던 수는 어떻게 되는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 제목 없음 / 메트릭 없음 / layout 없음 / 캔버스 폭 620 /
 * 컨트롤은 다시 보기와 한 걸음 둘뿐이며 눌러야 완성되는 화면이 아니다.
 *
 * 데이터는 구조만 적는다. 화면에 뜨는 수 — 7 이 5 로, 11 이 6 으로 내려가는
 * 그 수들 — 은 하나도 여기 없다. 전부 algorithm 이 이 구조를 순회하며 셈한다.
 *
 * 간선 여섯은 한 번의 순회에서 세 사건이 모두 나오도록 골랐다 — 처음 적히는 것,
 * 내려가는 것, 그리고 **더 짧지 않아 그대로 두는 것**. 셋째가 없으면 "더 짧은 길을
 * 찾으면" 의 조건이 화면에서 늘 참으로만 보인다.
 *
 * `scaleMax` 는 세로 자의 위 끝이다. 이 데이터에서 화면에 오르는 가장 큰 수는
 * 버려지는 후보 11 (= 2 + 9) 이고 12 는 그보다 크므로 어떤 수도 자 밖으로 나가지
 * 않는다. 눈금을 어디까지 그릴지는 화면을 읽는 속도를 정하는 저작 결정이라 선언에 둔다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const relaxShorterPathFacet: FacetJson = {
  id: 'facet:relaxShorterPath',
  title: { en: 'Relaxation', ko: '완화' },
  description: {
    en: 'A recorded distance is erased and rewritten lower when a shorter way turns up. It never goes back up.',
    ko: '더 짧은 길을 찾으면 적어 둔 거리를 지우고 낮은 수로 다시 적는다. 다시 올라가는 일은 없다.',
  },
  algorithm: 'module:relaxShorterPath',
  projector: 'module:relaxShorterPathProjector',
  initialData: {
    type: 'relax-shorter-path',
    vertices: ['S', 'A', 'B', 'C'],
    edges: [
      { from: 'S', to: 'A', weight: 7 },
      { from: 'S', to: 'B', weight: 2 },
      { from: 'S', to: 'C', weight: 8 },
      { from: 'B', to: 'A', weight: 3 },
      { from: 'A', to: 'C', weight: 1 },
      { from: 'B', to: 'C', weight: 9 },
    ],
    source: 'S',
    scaleMax: 12,
    stepMs: 950,
  },
  blocks: {
    stage: { type: 'relax-shorter-path-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'label.axis': {
      en: 'distance from {source}',
      ko: '{source} 에서의 거리',
    },
    'caption.start': {
      en: 'Only the start is known — {source} is 0, the rest have nothing written.',
      ko: '아는 것은 출발점뿐 — {source} 는 0, 나머지는 아직 적힌 수가 없다.',
    },
    'caption.settle': {
      en: '{vertex} holds the smallest number written so far ({dist}). Open the edges that leave it.',
      ko: '지금까지 적힌 수 가운데 {vertex} 가 가장 작다 ({dist}). 여기서 나가는 간선을 편다.',
    },
    'caption.write': {
      en: 'Nothing is written at {vertex} yet — the way through {from} puts {value} there.',
      ko: '{vertex} 에는 아직 적힌 수가 없다. {from} 를 거쳐 온 수를 처음 적는다 ({value}).',
    },
    'caption.probe': {
      en: 'Going through {from} costs {candidate}. {to} has {current} written.',
      ko: '{from} 를 거치면 {candidate}. 지금 {to} 에 적힌 수는 {current}.',
    },
    'caption.descend': {
      en: '{toValue} is shorter than {fromValue} — erase what was written and write the lower number.',
      ko: '{toValue} < {fromValue} — 적어 둔 수를 지우고 낮은 수로 다시 적는다.',
    },
    'caption.keep': {
      en: '{candidate} is not shorter than {current} — nothing is erased, the number stays where it is.',
      ko: '{candidate} ≥ {current} — 더 짧지 않다. 적어 둔 수를 지우지 않는다.',
    },
    'caption.done': {
      en: 'Every number that changed moved down. Not one of them ever went up.',
      ko: '바뀐 수는 모두 아래로 갔다. 한 번도 올라간 적이 없다.',
    },
  },
};
