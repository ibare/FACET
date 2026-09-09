/**
 * 커널 트릭 조각 facet JSON 선언.
 *
 * @piece — 질문 하나에 답하고 멈추는 조각 (S-piece).
 *
 * 질문: 직선으로 도저히 못 가르는 것은 어떻게 하는가.
 *
 * 선언이 담는 것은 구조뿐이다 — 한 줄 위의 자리 일곱과 그 이름표, 그리고 올리는
 * 법(제곱). 자름 자리도 · 오르는 높이도 · 가르는 높이 2.5 도 여기 없다. 전부
 * 파생값이라 algorithm 이 셈하고, 좌표는 stage 가 캔버스에서 역산한다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

/**
 * 한 줄 위의 일곱. 가운데 셋이 A, 바깥 넷이 B 라 A 가 B 사이에 끼어 있다 —
 * 그래서 한 줄 위에서는 어느 자리를 잘라도 갈리지 않는다.
 */
const POINTS: ReadonlyArray<{ x: number; label: string }> = [
  { x: -3, label: 'B' },
  { x: -2, label: 'B' },
  { x: -1, label: 'A' },
  { x: 0, label: 'A' },
  { x: 1, label: 'A' },
  { x: 2, label: 'B' },
  { x: 3, label: 'B' },
];

export const kernelLiftsFacet: FacetJson = {
  id: 'facet:kernelLifts',
  title: {
    en: 'Kernel Trick — lift it until a straight line will do',
    ko: '커널 트릭 — 곧은 선으로 될 때까지 들어올린다',
  },
  description: {
    en: 'A line that cannot be split can become one that can, one dimension up',
    ko: '못 가르던 것이 차원을 하나 올리면 갈린다',
  },
  algorithm: 'module:kernelLifts',
  projector: 'module:kernelLiftsProjector',
  initialData: {
    type: 'kernel-lifts',
    points: POINTS.map((p) => ({ ...p })),
    lift: { power: 2 },
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'kernel-lifts-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.line': {
      en: 'They all sit on one line — A in the middle, B outside.',
      ko: '모두 한 줄 위에 있다. 가운데는 A, 바깥은 B.',
    },
    'caption.cut': {
      en: 'Cut here — one side still holds both. ({k}/{n})',
      ko: '여기서 잘라도 한쪽에 A 와 B 가 함께 남는다. ({k}/{n})',
    },
    'caption.noCut': {
      en: 'Every cut on the line has been tried. None works.',
      ko: '자를 수 있는 자리를 다 해 봤다. 되는 것이 없다.',
    },
    'caption.open': {
      en: 'So open a direction that was not there — up.',
      ko: '그래서 없던 쪽을 연다 — 위로.',
    },
    'caption.rise': {
      en: 'Each rises by its own value squared — height {h}.',
      ko: '제 자리를 제곱한 만큼 오른다. 오른 높이: {h}.',
    },
    'caption.curve': {
      en: 'Where they landed is not flat. It curves.',
      ko: '앉은 자리는 평평하지 않다. 굽어 있다.',
    },
    'caption.place': {
      en: 'Now one straight line comes down — height {h}.',
      ko: '이제 곧은 선 하나가 내려온다. 멈춘 높이: {h}.',
    },
    'caption.verify': {
      en: 'All {below} below, all {above} above — nothing mixed.',
      ko: '아래는 모두 {below}, 위는 모두 {above}. 섞인 것이 없다.',
    },
    'caption.done': {
      en: 'It was never unsplittable. The room was too small.',
      ko: '가를 수 없던 것이 아니다. 자리가 좁았던 것이다.',
    },
  },
};
