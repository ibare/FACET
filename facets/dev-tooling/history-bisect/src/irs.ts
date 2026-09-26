/**
 * history-bisect IR — 코드 패널이 여섯 언어로 옮기는 명령형 판.
 *
 * 진입 bisect(good, bad, culprit, skip, ends): int — 시험 수를 돌려주고 ends[0] = g, ends[1] = b 를 적는다.
 * skip 은 커밋 번호로 색인하는 0/1 배열(길이 commits + 1, 0 칸은 쓰지 않는다). 부르는 쪽이 placements 에서 짓는다.
 * `out` 은 C# 예약어라 ends. ir-interpreter 의 && 는 짧은 회로가 아니라 범위 확인과 읽기를 if 로 겹친다.
 * phase 여섯: midpoint · skip-aside · stuck · good · bad · answer — algorithm.ts 와 같다.
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const INT_LIST = { kind: 'list', of: { kind: 'int' } } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '//' | '<' | '>' | '>=' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const set = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target: v(name), expr } : { kind: 'assign', target: v(name), expr, phase };

/** pick 이 아직 없으면 후보 c 가 후보 안(inside)이고 시험 가능할 때 고른다. */
const tryPick = (c: IRExpr, inside: IRExpr): IRStmt => ({
  kind: 'if',
  cond: bin('==', v('pick'), n(-1)),
  phase: 'skip-aside',
  then: [
    {
      kind: 'if',
      cond: inside,
      phase: 'skip-aside',
      then: [{ kind: 'if', cond: bin('==', { kind: 'index', arr: v('skip'), idx: c }, n(0)), phase: 'skip-aside', then: [set('pick', c, 'skip-aside')] }],
    },
  ],
});

const below = bin('-', v('m'), v('d'));
const above = bin('+', v('m'), v('d'));

export const historyBisectImperativeIR: IR = {
  id: 'history-bisect-imperative',
  algorithm: 'historyBisect',
  paradigm: 'imperative',
  functions: [
    {
      name: 'bisect',
      params: [
        { name: 'good', type: INT },
        { name: 'bad', type: INT },
        { name: 'culprit', type: INT },
        { name: 'skip', type: INT_LIST },
        { name: 'ends', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'candidates are g+1 .. b; skip[c] == 1 means commit c does not build' },
        { kind: 'var', name: 'g', type: INT, init: v('good') },
        { kind: 'var', name: 'b', type: INT, init: v('bad') },
        { kind: 'var', name: 'tests', type: INT, init: n(0) },
        {
          kind: 'while',
          cond: bin('>', bin('-', v('b'), v('g')), n(1)),
          body: [
            { kind: 'var', name: 'm', type: INT, init: bin('//', bin('+', v('g'), v('b')), n(2)), phase: 'midpoint' },
            { kind: 'var', name: 'pick', type: INT, init: v('m'), phase: 'midpoint' },
            {
              kind: 'if',
              cond: bin('==', at('skip', v('m')), n(1)),
              phase: 'skip-aside',
              then: [
                { kind: 'comment', text: 'nearest buildable candidate: below first, then above' },
                set('pick', n(-1), 'skip-aside'),
                {
                  kind: 'for-range',
                  var: 'd',
                  from: n(1),
                  to: bin('-', v('b'), v('g')),
                  inclusive: false,
                  phase: 'skip-aside',
                  body: [tryPick(below, bin('>', below, v('g'))), tryPick(above, bin('<', above, v('b')))],
                },
              ],
            },
            { kind: 'if', cond: bin('==', v('pick'), n(-1)), phase: 'stuck', then: [{ kind: 'break', phase: 'stuck' }] },
            set('tests', bin('+', v('tests'), n(1))),
            {
              kind: 'if',
              cond: bin('>=', v('pick'), v('culprit')),
              then: [set('b', v('pick'), 'bad')],
              else: [set('g', v('pick'), 'good')],
            },
          ],
        },
        { kind: 'assign', target: at('ends', n(0)), expr: v('g'), phase: 'answer' },
        { kind: 'assign', target: at('ends', n(1)), expr: v('b'), phase: 'answer' },
        { kind: 'return', expr: v('tests'), phase: 'answer' },
      ],
    },
  ],
};

export const historyBisectIRs: IR[] = [historyBisectImperativeIR];
