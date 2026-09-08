/**
 * @piece 가지치기 — 가망이 없다고 확정되면 그 아래는 아예 가 보지 않는다.
 *
 * 답하는 질문 하나: **가지치기는 왜 답을 잃지 않는가.**
 * 뻗어 나가던 가지가 어떤 자리에서 더 뻗지 않고 닫힌다. 닫힌 자리 아래에는
 * 아무것도 그려지지 않고, 그 빈 자리가 화면에 남는다 — 다 뻗었을 때의 나무를
 * 옅게 함께 두는 것은 안 그린 것이 몇인지 견줄 대상이 있어야 하기 때문이다.
 *
 * 닫는 판정은 셈 하나다: 지금까지의 합이 목표를 넘었는가. 넘었으면 그 아래에서
 * 합이 다시 줄어들 길이 없으므로 답이 **있을 수 없다**. 대충 건너뛰는 것이
 * 아니라 없음이 증명된 곳을 안 보는 것이고, 그래서 답을 하나도 잃지 않는다.
 *
 * 조각이므로 header 도 metrics 도 두지 않는다 (S-piece). 제목은 글의 문단이 주고,
 * 열린 자리·안 연 자리의 수는 나무 구조에서 셈해 stage 가 그린다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const pruneBranchFacet: FacetJson = {
  id: 'facet:pruneBranch',
  title: { en: 'Pruning a branch', ko: '가지치기' },
  description: {
    en: 'Why skipping a whole subtree loses no answers.',
    ko: '가지를 통째로 접어도 답을 잃지 않는 이유.',
  },
  algorithm: 'module:pruneBranch',
  projector: 'module:pruneBranchProjector',

  initialData: {
    type: 'prune-branch',
    // 수 넷에서 골라 합이 6 이 되게 한다. 다 뻗으면 자리가 2^5 - 1 = 31,
    // 합이 6 을 넘은 자리에서 닫으면 15 만 열고 16 은 손도 대지 않는다.
    // 답은 [4, 2] 하나뿐이고 접어도 그대로 찾는다.
    values: [7, 5, 4, 2],
    target: 6,
    stepMs: 600,
  },

  blocks: {
    stage: { type: 'prune-branch-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },

  messages: {
    'caption.task': {
      en: 'Pick from {list} and make the sum come out exactly — the target is {target}.',
      ko: '{list} 가운데 골라서 합을 정확히 맞춘다 — 목표는 {target}.',
    },
    'caption.start': {
      en: 'Nothing chosen yet. The running sum is {sum}.',
      ko: '아직 아무것도 안 골랐다. 지금까지의 합은 {sum}.',
    },
    'caption.take': {
      en: 'Put {value} in — the running sum is now {sum}.',
      ko: '{value} — 넣는다. 지금까지의 합은 {sum}.',
    },
    'caption.skip': {
      en: 'Leave {value} out — the running sum stays {sum}.',
      ko: '{value} — 안 넣는다. 합은 {sum} 그대로.',
    },
    'caption.cut': {
      en: 'The running sum is already over: {sum} > {target}. Nothing below can bring it back down, so the {below} spots under this one never open.',
      ko: '합이 이미 목표를 넘었다 ({sum} > {target}). 아래로 내려가도 합이 줄어들 길은 없으니, 이 자리 아래 {below} 자리는 끝내 열리지 않는다.',
    },
    'caption.cutLeaf': {
      en: 'Over again: {sum} > {target}. This spot closes too — on the last row there was nothing left underneath to skip.',
      ko: '또 넘었다 ({sum} > {target}). 여기서도 닫는다 — 다만 마지막 층이라 아래에 건너뛸 자리가 없었을 뿐이다.',
    },
    'caption.dead': {
      en: 'All {count} decided, and {sum} is not {target}. Nothing here.',
      ko: '{count}개를 다 정했지만 합이 목표가 아니다 ({sum} ≠ {target}). 여기엔 답이 없다.',
    },
    'caption.answer': {
      en: '{list} — the sum is exactly {target}.',
      ko: '{list} — 합이 정확히 {target}.',
    },
    'caption.done': {
      en: '{opened} spots opened, {skipped} never touched — and not one answer was lost. Below a sum that is already over, no answer can exist.',
      ko: '연 자리 {opened}, 손도 대지 않은 자리 {skipped}. 그런데도 잃은 답은 하나도 없다 — 합이 이미 목표를 넘은 자리 아래에는 답이 있을 수 없기 때문이다.',
    },

    'label.opened': { en: 'opened {n}', ko: '연 자리 {n}' },
    'label.skipped': { en: 'never opened {n}', ko: '안 연 자리 {n}' },
    'label.target': { en: 'target = {n}', ko: '목표 = {n}' },
    'label.branchKey': {
      en: 'left branch = put it in · right branch = leave it out',
      ko: '왼쪽 가지 = 넣는다 · 오른쪽 가지 = 안 넣는다',
    },
  },
};
