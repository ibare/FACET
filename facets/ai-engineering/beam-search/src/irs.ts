/**
 * beam-search IR — 빔과 후보를 배열로 펴고, 솎기를 "가장 큰 것을 폭 번 고르기" 로 쓴다.
 *
 * 표는 부르는 쪽이 마디 번호로 편다 (`encodeBeamTables`). 마디 = 앞말 하나, 빈 앞말이 0.
 *   child[마디 × 3 + r]  자식 마디, 없으면 −1
 *   prob[마디 × 3 + r]   확률 %
 *   lastWord[마디]       그 앞말의 마지막 낱말 번호, 빈 앞말은 −1
 *   ended[마디]          `.` 으로 끝나면 1
 *   article[낱말]        0 관사 아님 · 1 `a` (자음을 바람) · 2 `an` (모음을 바람)
 *   sound[낱말]          −1 첫소리 없음 · 0 자음 · 1 모음
 * 버퍼 넷(beamNode · beamScore · candNode · candScore)도 부르는 쪽이 만든다 — IR 은 배열을
 * 만들 수 없다. 빔 8 · 후보 16 이면 넉넉하다 (이 자료의 후보는 많아야 폭 4 × 3 = 12).
 *
 * 돌려주는 값은 견준 후보 수. 답은 `beamNode[0]` · `beamScore[0]` 에 남는다.
 *
 * - 지우기 판정은 `if` 를 겹친다. `ir-interpreter` 의 `&&` 는 짧은 회로가 아니라서
 *   `lastWord[node]` 가 −1 일 때 `article[−1]` 을 읽게 된다.
 * - 솎기는 **엄격히 클 때만** 바꾼다 — 동률이면 앞에 만들어진 것이 남는다.
 * - 정수 중간값의 최대는 1,000,000 × 45 = 45,000,000 (int32 안).
 */

import type { IR, IRExpr, IRStmt } from '@ffacet/core/runtime';

const INT = { kind: 'int' } as const;
const INT_LIST = { kind: 'list', of: INT } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '*' | '//' | '==' | '!=' | '>', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});
const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({
  kind: 'var',
  name,
  type: INT,
  init,
  phase,
});
const put = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({
  kind: 'assign',
  target,
  expr,
  phase,
});
const slot = (node: IRExpr, r: IRExpr): IRExpr => op('+', op('*', node, n(3)), r);

export const beamSearchImperativeIR: IR = {
  id: 'beam-search-imperative',
  algorithm: 'beamSearch',
  paradigm: 'imperative',
  functions: [
    {
      name: 'beamSearch',
      params: [
        { name: 'child', type: INT_LIST },
        { name: 'prob', type: INT_LIST },
        { name: 'lastWord', type: INT_LIST },
        { name: 'ended', type: INT_LIST },
        { name: 'article', type: INT_LIST },
        { name: 'sound', type: INT_LIST },
        { name: 'width', type: INT },
        { name: 'erase', type: INT },
        { name: 'depth', type: INT },
        { name: 'beamNode', type: INT_LIST },
        { name: 'beamScore', type: INT_LIST },
        { name: 'candNode', type: INT_LIST },
        { name: 'candScore', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'The beam starts from one empty prefix. A score is the product of probabilities, kept as an integer per million.' },
        put(at('beamNode', n(0)), n(0), 'expand'),
        put(at('beamScore', n(0)), n(1000000), 'expand'),
        decl('beamLen', n(1), 'expand'),
        decl('scored', n(0), 'expand'),
        {
          kind: 'for-range',
          var: 'step',
          from: n(0),
          to: v('depth'),
          inclusive: false,
          phase: 'expand',
          body: [
            decl('candLen', n(0), 'expand'),
            {
              kind: 'for-range',
              var: 'b',
              from: n(0),
              to: v('beamLen'),
              inclusive: false,
              phase: 'expand',
              body: [
                decl('node', at('beamNode', v('b')), 'expand'),
                {
                  kind: 'if',
                  cond: op('==', at('ended', v('node')), n(1)),
                  phase: 'expand',
                  then: [
                    { kind: 'comment', text: 'A finished line is not expanded; it is carried with its score (not counted as scored).' },
                    put(at('candNode', v('candLen')), v('node'), 'expand'),
                    put(at('candScore', v('candLen')), at('beamScore', v('b')), 'expand'),
                    put(v('candLen'), op('+', v('candLen'), n(1)), 'expand'),
                  ],
                  else: [
                    {
                      kind: 'for-range',
                      var: 'r',
                      from: n(0),
                      to: n(3),
                      inclusive: false,
                      phase: 'expand',
                      body: [
                        decl('kid', at('child', slot(v('node'), v('r'))), 'expand'),
                        {
                          kind: 'if',
                          cond: op('!=', v('kid'), n(-1)),
                          phase: 'expand',
                          then: [
                            decl('cut', n(0), 'erase'),
                            { kind: 'comment', text: 'Before scoring: erase the word if its first sound does not fit the article before it.' },
                            {
                              kind: 'if',
                              cond: op('==', v('erase'), n(1)),
                              phase: 'erase',
                              then: [
                                decl('lw', at('lastWord', v('node')), 'erase'),
                                {
                                  kind: 'if',
                                  cond: op('!=', v('lw'), n(-1)),
                                  phase: 'erase',
                                  then: [
                                    decl('art', at('article', v('lw')), 'erase'),
                                    {
                                      kind: 'if',
                                      cond: op('!=', v('art'), n(0)),
                                      phase: 'erase',
                                      then: [
                                        decl('snd', at('sound', at('lastWord', v('kid'))), 'erase'),
                                        {
                                          kind: 'if',
                                          cond: op('!=', v('snd'), n(-1)),
                                          phase: 'erase',
                                          then: [
                                            {
                                              kind: 'if',
                                              cond: op('!=', v('snd'), op('-', v('art'), n(1))),
                                              phase: 'erase',
                                              then: [put(v('cut'), n(1), 'erase')],
                                            },
                                          ],
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                            {
                              kind: 'if',
                              cond: op('==', v('cut'), n(0)),
                              phase: 'expand',
                              then: [
                                put(at('candNode', v('candLen')), v('kid'), 'expand'),
                                put(
                                  at('candScore', v('candLen')),
                                  op('//', op('*', at('beamScore', v('b')), at('prob', slot(v('node'), v('r')))), n(100)),
                                  'expand',
                                ),
                                put(v('candLen'), op('+', v('candLen'), n(1)), 'expand'),
                                put(v('scored'), op('+', v('scored'), n(1)), 'expand'),
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            { kind: 'comment', text: 'Prune: pick the largest score width times. Replace only when strictly greater, so on a tie the earlier one stays.' },
            decl('kept', { kind: 'call', fn: 'min', args: [v('width'), v('candLen')] }, 'prune'),
            {
              kind: 'for-range',
              var: 'k',
              from: n(0),
              to: v('kept'),
              inclusive: false,
              phase: 'prune',
              body: [
                decl('best', n(-1), 'prune'),
                decl('bestScore', n(-1), 'prune'),
                {
                  kind: 'for-range',
                  var: 'i',
                  from: n(0),
                  to: v('candLen'),
                  inclusive: false,
                  phase: 'prune',
                  body: [
                    {
                      kind: 'if',
                      cond: op('>', at('candScore', v('i')), v('bestScore')),
                      phase: 'prune',
                      then: [
                        put(v('best'), v('i'), 'prune'),
                        put(v('bestScore'), at('candScore', v('i')), 'prune'),
                      ],
                    },
                  ],
                },
                put(at('beamNode', v('k')), at('candNode', v('best')), 'prune'),
                put(at('beamScore', v('k')), v('bestScore'), 'prune'),
                put(at('candScore', v('best')), n(-1), 'prune'),
              ],
            },
            put(v('beamLen'), v('kept'), 'prune'),
          ],
        },
        { kind: 'comment', text: 'The answer is the first line of the last beam: beamNode[0], beamScore[0].' },
        { kind: 'return', expr: v('scored'), phase: 'answer' },
      ],
    },
  ],
};

export const beamSearchIRs: IR[] = [beamSearchImperativeIR];
