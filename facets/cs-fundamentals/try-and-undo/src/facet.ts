/**
 * @piece 가 보고 아니면 되돌린다 — 백트래킹.
 *
 * 답하는 질문 하나: **되돌리기는 왜 실패의 뒤처리가 아니라 절차의 한 짝인가.**
 * 끝까지 가 보지 않고는 아닌 줄 알 수 없으므로 가 보고 물린다. 놓는 운동과
 * 걷어내는 운동이 나란히 보이고, 물릴 때 판이 반쯤 남지 않고 정확히 이전
 * 상태로 돌아간다.
 *
 * 조각이므로 header 도 metrics 도 두지 않는다 (S-piece). 제목은 글의 문단이 주고,
 * 셀 것은 패널에 걸지 않는다 — 놓기와 물리기의 수는 마지막 캡션이 말한다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const tryAndUndoFacet: FacetJson = {
  id: 'facet:tryAndUndo',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'Backtracking', ko: '백트래킹' },
  description: {
    en: 'Why undoing a move is part of the procedure, not a failure to clean up.',
    ko: '되돌리기가 실패의 뒤처리가 아니라 절차의 한 짝인 까닭.',
  },
  algorithm: 'module:tryAndUndo',
  projector: 'module:tryAndUndoProjector',

  initialData: {
    type: 'try-and-undo',
    // 4×4 판에 말 넷. 같은 가로줄·세로줄·대각선에 둘이 서지 못한다.
    // 이 크기에서 놓기 여덟 · 물리기 넷 만에 답에 닿고, 첫 시도(행0 열0)는
    // 통째로 물린다 — 그 되돌아옴이 이 화면의 큰 마디다.
    boardSize: 4,
    stepMs: 460,
  },

  blocks: {
    stage: { type: 'try-and-undo-stage' },
    controls: { type: 'control-bar', controls: [CONTROL.replay, CONTROL.advance] },
  },

  messages: {
    'caption.start': {
      en: 'An empty board. One piece per row, from the top down.',
      ko: '빈 판이다. 위 행부터 한 줄에 하나씩 놓는다.',
    },
    'caption.place': {
      en: 'Row {row}: put a piece on column {col}.',
      ko: '행 {row} — 열 {col} 에 놓는다.',
    },
    'caption.blocked': {
      en: 'Row {row}: every square left is ruled out.',
      ko: '행 {row} — 남은 자리가 모두 막혔다.',
    },
    'caption.undo': {
      en: 'Take the row {row} piece back. Everything below it returns to what it was.',
      ko: '행 {row} 의 말을 걷어낸다. 그 아래는 처음으로 돌아간다.',
    },
    'caption.undoRoot': {
      en: 'Back past the very first move. The board is empty again.',
      ko: '첫 수까지 물렸다. 판이 처음처럼 비었다.',
    },
    'caption.solved': {
      en: 'All four stand — {placed} placements and {undone} take-backs.',
      ko: '넷이 다 섰다 — 놓기 {placed}번, 물리기 {undone}번.',
    },
  },
};
