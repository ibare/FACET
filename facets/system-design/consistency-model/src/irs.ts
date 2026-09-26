/**
 * consistency-model IR — 가십 한 판을 정수로 셈한다.
 *
 * 뽑기는 algorithm 이 하고 짝 표 · 손님 읽기를 건넨다(IR 에 생성기를 두지 않는다 — 표가 곧 뽑기다).
 * IR 은 배열을 짓지 못하므로 `gotAt`(사본 n 칸) · `result`(6 칸) 버퍼를 부르는 쪽이 만든다.
 * 돌려주는 것 = 옛 사본×라운드. 퍼뜨림이 1..kmax 밖 · 규칙이 0..1 밖 · 한 바퀴 안에 끝나지 않는 읽기는 −1 (TS 는 던진다).
 * result = [같아진 라운드(없으면 −1), 옛 사본×라운드, 통, 헛 통, 옛값 읽기, 돌려보냄].
 *
 * phase: write · push · read-old · bounce · read (algorithm 과 같다).
 * 중간값 최대는 짝 표 색인 ((rounds − 1) · n + n − 1) · kmax + kmax − 1 = 383.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST: IRType = { kind: 'list', of: INT };
const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '%' | '<' | '>' | '==' | '!=' | '&&' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };
const inc = (name: string, phase?: string): IRStmt => set(v(name), bin('+', v(name), n(1)), phase);
const decl = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'var', name, type: INT, init } : { kind: 'var', name, type: INT, init, phase };

export const consistencyModelImperativeIR: IR = {
  id: 'consistency-model-imperative',
  algorithm: 'consistencyModel',
  paradigm: 'imperative',
  functions: [
    {
      name: 'gossipRun',
      params: [
        { name: 'n', type: INT },
        { name: 'fanout', type: INT },
        { name: 'rounds', type: INT },
        { name: 'rule', type: INT },
        { name: 'kmax', type: INT },
        { name: 'partners', type: LIST },
        { name: 'reads', type: LIST },
        { name: 'gotAt', type: LIST },
        { name: 'result', type: LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'unknown fanout or read rule: marker -1' },
        {
          kind: 'if',
          cond: bin('||', bin('<', v('fanout'), n(1)), bin('>', v('fanout'), v('kmax'))),
          then: [{ kind: 'return', expr: n(-1) }],
        },
        {
          kind: 'if',
          cond: bin('&&', bin('!=', v('rule'), n(0)), bin('!=', v('rule'), n(1))),
          then: [{ kind: 'return', expr: n(-1) }],
        },
        { kind: 'comment', text: 'gotAt[i] = round the copy got the new value, -1 = still old' },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('n'),
          inclusive: false,
          body: [set(at('gotAt', v('i')), n(-1))],
        },
        set(at('gotAt', n(0)), n(0), 'write'),
        decl('conv', n(-1)),
        decl('area', n(0)),
        decl('msgs', n(0)),
        decl('wasted', n(0)),
        decl('stale', n(0)),
        decl('bounces', n(0)),
        {
          kind: 'for-range',
          var: 'r',
          from: n(1),
          to: v('rounds'),
          inclusive: true,
          body: [
            { kind: 'comment', text: 'only copies that held the new value at the start of the round push' },
            {
              kind: 'for-range',
              var: 'i',
              from: n(0),
              to: v('n'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin('!=', at('gotAt', v('i')), n(-1)),
                  then: [
                    {
                      kind: 'if',
                      cond: bin('<', at('gotAt', v('i')), v('r')),
                      then: [
                        {
                          kind: 'for-range',
                          var: 'k',
                          from: n(0),
                          to: v('fanout'),
                          inclusive: false,
                          body: [
                            decl(
                              'j',
                              at(
                                'partners',
                                bin(
                                  '+',
                                  bin('*', bin('+', bin('*', bin('-', v('r'), n(1)), v('n')), v('i')), v('kmax')),
                                  v('k'),
                                ),
                              ),
                            ),
                            inc('msgs', 'push'),
                            {
                              kind: 'if',
                              cond: bin('==', at('gotAt', v('j')), n(-1)),
                              then: [set(at('gotAt', v('j')), v('r'))],
                              else: [inc('wasted')],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            decl('oldCount', n(0)),
            {
              kind: 'for-range',
              var: 'i',
              from: n(0),
              to: v('n'),
              inclusive: false,
              body: [
                {
                  kind: 'if',
                  cond: bin('==', at('gotAt', v('i')), n(-1)),
                  then: [inc('oldCount')],
                },
              ],
            },
            set(v('area'), bin('+', v('area'), v('oldCount'))),
            {
              kind: 'if',
              cond: bin('&&', bin('==', v('oldCount'), n(0)), bin('==', v('conv'), n(-1))),
              then: [set(v('conv'), v('r'))],
            },
            { kind: 'comment', text: 'the client asks this round\'s copy' },
            decl('q', at('reads', bin('-', v('r'), n(1)))),
            {
              kind: 'if',
              cond: bin('==', v('rule'), n(0)),
              then: [
                {
                  kind: 'if',
                  cond: bin('==', at('gotAt', v('q')), n(-1)),
                  then: [inc('stale', 'read-old')],
                },
              ],
              else: [
                { kind: 'comment', text: 'version check: send back and try the next copy on the ring' },
                decl('hops', n(0)),
                {
                  kind: 'while',
                  cond: bin('==', at('gotAt', v('q')), n(-1)),
                  body: [
                    inc('bounces', 'bounce'),
                    inc('hops'),
                    {
                      kind: 'if',
                      cond: bin('==', v('hops'), v('n')),
                      then: [{ kind: 'return', expr: n(-1) }],
                    },
                    set(v('q'), bin('%', bin('+', v('q'), n(1)), v('n'))),
                  ],
                },
              ],
            },
            { kind: 'comment', text: 'read from a copy that holds the new value (or the old one under rule 0)' },
            decl('served', v('q'), 'read'),
          ],
        },
        set(at('result', n(0)), v('conv')),
        set(at('result', n(1)), v('area')),
        set(at('result', n(2)), v('msgs')),
        set(at('result', n(3)), v('wasted')),
        set(at('result', n(4)), v('stale')),
        set(at('result', n(5)), v('bounces')),
        { kind: 'return', expr: v('area') },
      ],
    },
  ],
};

export const consistencyModelIRs: IR[] = [consistencyModelImperativeIR];
