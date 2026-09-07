/**
 * PigeonholeCollision facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "해시 충돌은 왜 반드시 존재하는가?"
 *
 * 답은 확률이 아니라 셈이다. 자리가 16개면 17번째 입력은 갈 곳이 없다.
 * 그래서 화면은 자리를 실제로 다 채운 뒤에야 하나를 더 넣는다 — 채우기를
 * 건너뛰고 충돌만 보이면 "겹칠 수도 있다" 가 되지 "겹칠 수밖에 없다" 가 되지 않는다.
 *
 * 조각의 규범:
 *   - 필수 조작 없음. 다시 보기 하나만 둔다 (자리가 차는 운동이 논증의 일부다).
 *   - 제목 없음 — 제목은 글의 문단이 준다.
 *   - 짧음 — 네 걸음 재생하고 정지한다.
 *   - 한 주장 — 진행 캡션들은 한 논증의 단계이지 서로 다른 주장이 아니다.
 *   - 메트릭 없음.
 *
 * 데이터는 실측이다. 자리 번호는 SHA-256 의 마지막 니블이고, 16개 입력이 0~15 를
 * 하나씩 차지한다. 17번째 'ag' 는 'aa' 가 앉은 6번 자리로 떨어진다.
 *
 * 다만 그 16개는 자리를 하나씩 채우도록 고른 것이다. 무작위로 넣으면 이렇게 되지
 * 않는다 — 16개가 16칸을 하나씩 차지할 확률은 백만분의 1 남짓이고, 실제로는
 * 여섯 번째쯤에서 이미 겹친다 (사전순 'aa'부터라면 일곱 번째 'ag'). 이 인위성은
 * 감출 것이 아니라 밝힐 전제다 — 비둘기집 원리의 정확한 서술이 "아무리 고르게
 * 나눠도" 이기 때문이다. 가장 잘 나눠 담은 경우에조차 실패한다는 것이 논증이고,
 * 그 사실을 label.noteArrangement 가 화면에서 말한다.
 *
 * 16칸은 축척이다. 실제 SHA-256 은 2^256 칸이며 수가 클수록 겹치기까지 오래
 * 걸릴 뿐 셈은 같다 — 그 사실을 화면 각주 (label.note) 가 밝힌다.
 *
 * title / description / messages 는 en·ko 만 채웠다 (조각 방식 1차 시험).
 */

import type { FacetJson } from '@ffacet/core/runtime';

export const pigeonholeCollisionFacet: FacetJson = {
  id: 'facet:pigeonholeCollision',
  title: { en: 'Why Collisions Must Exist', ko: '충돌은 반드시 있다' },
  description: {
    en: 'Sixteen places, seventeen inputs — one of them has nowhere of its own',
    ko: '자리는 열여섯, 입력은 열일곱 — 하나는 제 자리를 가질 수 없다',
  },
  algorithm: 'module:pigeonholeCollision',
  projector: 'module:pigeonholeCollisionProjector',
  initialData: {
    type: 'pigeonhole',
    slotCount: 16,
    // SHA-256 마지막 니블을 자리 번호로 삼은 실측값. 16개가 0~15 를 하나씩 채운다.
    fillers: [
      { input: 'ba', slot: 0 },
      { input: 'ac', slot: 1 },
      { input: 'bg', slot: 2 },
      { input: 'ab', slot: 3 },
      { input: 'ao', slot: 4 },
      { input: 'az', slot: 5 },
      { input: 'aa', slot: 6 },
      { input: 'ad', slot: 7 },
      { input: 'ae', slot: 8 },
      { input: 'bf', slot: 9 },
      { input: 'bx', slot: 10 },
      { input: 'au', slot: 11 },
      { input: 'aw', slot: 12 },
      { input: 'af', slot: 13 },
      { input: 'al', slot: 14 },
      { input: 'ap', slot: 15 },
    ],
    overflow: { input: 'ag', slot: 6 },
    stepMs: 1000,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage', padding: '8px 0' }, { ref: 'controls' }],
  },
  messages: {
    'caption.base': {
      en: 'There are only so many places an output can land, so two inputs must eventually share one.',
      ko: '출력이 앉을 자리는 정해진 수뿐이라, 언젠가 두 입력이 한 자리를 나눠 갖게 된다.',
    },
    'caption.filled': {
      en: 'Spread as evenly as possible — one per place — all {count} are taken.',
      ko: '가장 고르게 나눠도 — 자리마다 하나씩 — {count} 자리가 모두 찬다.',
    },
    'caption.oneMore': {
      en: 'One more input arrives — input {n} for {count} places.',
      ko: '입력이 하나 더 온다 — 자리는 {count} 개인데 {n} 번째다.',
    },
    'caption.collide': {
      en: 'It has nowhere of its own — {overflow} sits where {occupant} already is.',
      ko: '제 자리가 없다 — {overflow} 가 {occupant} 가 앉은 자리에 함께 앉는다.',
    },
    'label.places': {
      en: '{count} places',
      ko: '자리 {count} 개',
    },
    'label.noteScale': {
      en: 'Shown with 16 places. SHA-256 has 2^256 — a larger number, the same counting.',
      ko: '여기서는 자리를 16개로 줄였다. SHA-256 은 2^256 개다 — 수가 클 뿐 셈은 같다.',
    },
    'label.noteArrangement': {
      en: 'This is the luckiest arrangement — one per place. In practice a collision shows up around the sixth input.',
      ko: '이 배치는 가장 운 좋은 경우다 — 자리마다 하나씩. 실제로는 여섯 번째쯤에서 이미 겹친다.',
    },
  },
  blocks: {
    stage: { type: 'pigeonhole-stage' },
    controls: {
      type: 'control-bar',
      // ReactiveMechanism 의 reset() 은 끝에 ensureStarted() 를 부른다 — 즉
      // reset 이 곧 다시 재생이다. 그래서 action 은 reset 이고 라벨만 다르다.
      controls: [
        {
          widget: 'button',
          action: 'reset',
          label: { en: 'Replay', ko: '다시 보기' },
        },
      ],
    },
  },
};
