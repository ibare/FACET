/**
 * fold-and-sweep IR — 두 패스를 잇는 컴파일러 함수.
 *
 * 화면의 프로그램(`price(n)`)은 이 함수가 받는 **자료**다 — 식 나무를 번호 배열로 받는다.
 *   마디 번호 = 전위 차례 0 부터 (L2 의 식 … L6, 그다음 `return` 식)
 *   kind 0 NUM · 1 NAME · 2 `+` · 3 `-` · 4 `*`, 자식이 없으면 -1
 *   val  NUM 이면 수 · NAME 이면 이름 번호 (부르는 쪽이 짓는다)
 *   mode 0 끔 · 1 폴딩 · 2 전파 + 폴딩, sweep 0 · 1 (손잡이 값 그대로)
 *   버퍼 known · isKnown · useCount (이름 수) · alive (줄 수) · stats[4] = 접은 마디 · 바꾼 이름 · 지운 줄 · 줄
 * 모르는 마디 종류(0 … 4 밖)를 만나면 -1 을 돌려준다 — TS 쪽 좁히개는 같은 자리에서 던진다.
 * kind · val 은 제자리에서 고친다 — 부르는 쪽이 판마다 새 사본을 넘긴다.
 *
 * phase (algorithm 과 정확히 같다): fold-line · fold-known · sweep-count · sweep-remove · count-ops
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };
const VOID: IRType = { kind: 'void' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, i: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx: i });
const bin = (op: '+' | '-' | '*' | '==' | '>' | '>=' | '<' | '<=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt => (phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr });
const inc = (target: IRExpr, by: IRExpr): IRStmt => set(target, bin('+', target, by));
const loop = (name: string, to: IRExpr, body: IRStmt[]): IRStmt => ({ kind: 'for-range', var: name, from: n(0), to, inclusive: false, body });

/** 나무 배열 인자 — 부르는 함수마다 같은 차례로 넘긴다. */
const TREE = ['kind', 'left', 'right', 'val'];
const tree = (): IRExpr[] => TREE.map(v);
const treeParams = TREE.map((name) => ({ name, type: INTS }));
const foldArgs = (node: IRExpr): IRExpr[] => [node, ...tree(), v('mode'), v('known'), v('isKnown'), v('stats')];

export const foldAndSweepImperativeIR: IR = {
  id: 'fold-and-sweep-imperative',
  algorithm: 'foldAndSweep',
  paradigm: 'imperative',
  functions: [
    {
      name: 'optimize',
      params: [
        ...treeParams,
        { name: 'lineName', type: INTS },
        { name: 'lineRoot', type: INTS },
        { name: 'retRoot', type: INT },
        { name: 'mode', type: INT },
        { name: 'sweep', type: INT },
        { name: 'known', type: INTS },
        { name: 'isKnown', type: INTS },
        { name: 'alive', type: INTS },
        { name: 'useCount', type: INTS },
        { name: 'stats', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'unknown node kind: refuse with -1 (the TypeScript side throws)' },
        loop('i', { kind: 'len', of: v('kind') }, [
          { kind: 'if', cond: bin('<', at('kind', v('i')), n(0)), then: [{ kind: 'return', expr: n(-1) }] },
          { kind: 'if', cond: bin('>', at('kind', v('i')), n(4)), then: [{ kind: 'return', expr: n(-1) }] },
        ]),
        { kind: 'var', name: 'nLines', type: INT, init: { kind: 'len', of: v('lineRoot') } },
        loop('j', v('nLines'), [set(at('alive', v('j')), n(1))]),
        { kind: 'comment', text: 'pass 1: fold each line top to bottom, then the return expression' },
        {
          kind: 'if',
          cond: bin('>', v('mode'), n(0)),
          then: [
            loop('j', v('nLines'), [
              { kind: 'var', name: 'isNum', type: INT, init: call('foldExpr', foldArgs(at('lineRoot', v('j')))), phase: 'fold-line' },
              {
                kind: 'if',
                cond: bin('==', v('mode'), n(2)),
                then: [
                  {
                    kind: 'if',
                    cond: bin('==', v('isNum'), n(1)),
                    then: [
                      { kind: 'comment', text: 'the name now stands for a number' },
                      set(at('known', at('lineName', v('j'))), at('val', at('lineRoot', v('j'))), 'fold-known'),
                      set(at('isKnown', at('lineName', v('j'))), n(1)),
                    ],
                  },
                ],
              },
            ]),
            { kind: 'expr-stmt', expr: call('foldExpr', foldArgs(v('retRoot'))), phase: 'fold-line' },
          ],
        },
        { kind: 'comment', text: 'pass 2: drop every let line nobody uses, round after round' },
        {
          kind: 'if',
          cond: bin('==', v('sweep'), n(1)),
          then: [
            { kind: 'var', name: 'removed', type: INT, init: n(1) },
            {
              kind: 'while',
              cond: bin('>', v('removed'), n(0)),
              body: [
                loop('x', { kind: 'len', of: v('useCount') }, [set(at('useCount', v('x')), n(0))]),
                loop('j', v('nLines'), [
                  {
                    kind: 'if',
                    cond: bin('==', at('alive', v('j')), n(1)),
                    then: [{ kind: 'expr-stmt', expr: call('countUses', [at('lineRoot', v('j')), ...tree(), v('useCount')]), phase: 'sweep-count' }],
                  },
                ]),
                { kind: 'expr-stmt', expr: call('countUses', [v('retRoot'), ...tree(), v('useCount')]) },
                set(v('removed'), n(0)),
                loop('j', v('nLines'), [
                  {
                    kind: 'if',
                    cond: bin('==', at('alive', v('j')), n(1)),
                    then: [
                      {
                        kind: 'if',
                        cond: bin('==', at('useCount', at('lineName', v('j'))), n(0)),
                        then: [set(at('alive', v('j')), n(0), 'sweep-remove'), inc(v('removed'), n(1))],
                      },
                    ],
                  },
                ]),
                inc(at('stats', n(2)), v('removed')),
              ],
            },
          ],
        },
        { kind: 'comment', text: 'executed operations = operator nodes left in the kept lines' },
        { kind: 'var', name: 'ops', type: INT, init: call('countOps', [v('retRoot'), v('kind'), v('left'), v('right')]), phase: 'count-ops' },
        { kind: 'var', name: 'kept', type: INT, init: n(0) },
        loop('j', v('nLines'), [
          {
            kind: 'if',
            cond: bin('==', at('alive', v('j')), n(1)),
            then: [
              set(v('ops'), bin('+', v('ops'), call('countOps', [at('lineRoot', v('j')), v('kind'), v('left'), v('right')])), 'count-ops'),
              inc(v('kept'), n(1)),
            ],
          },
        ]),
        { kind: 'comment', text: 'lines = kept let lines + header + return' },
        set(at('stats', n(3)), bin('+', v('kept'), n(2))),
        { kind: 'return', expr: v('ops'), phase: 'count-ops' },
      ],
    },
    {
      name: 'foldExpr',
      params: [
        { name: 'node', type: INT },
        ...treeParams,
        { name: 'mode', type: INT },
        { name: 'known', type: INTS },
        { name: 'isKnown', type: INTS },
        { name: 'stats', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'returns 1 when the node is (now) a number' },
        { kind: 'if', cond: bin('==', at('kind', v('node')), n(0)), then: [{ kind: 'return', expr: n(1) }] },
        {
          kind: 'if',
          cond: bin('==', at('kind', v('node')), n(1)),
          then: [
            {
              kind: 'if',
              cond: bin('==', v('mode'), n(2)),
              then: [
                {
                  kind: 'if',
                  cond: bin('==', at('isKnown', at('val', v('node'))), n(1)),
                  then: [
                    { kind: 'comment', text: 'propagate: replace a known name by its number' },
                    set(at('kind', v('node')), n(0)),
                    set(at('val', v('node')), at('known', at('val', v('node')))),
                    inc(at('stats', n(1)), n(1)),
                    { kind: 'return', expr: n(1) },
                  ],
                },
              ],
            },
            { kind: 'return', expr: n(0) },
          ],
        },
        { kind: 'comment', text: 'only + - * are operators; anything else is refused with -1' },
        { kind: 'if', cond: bin('<', at('kind', v('node')), n(2)), then: [{ kind: 'return', expr: n(-1) }] },
        { kind: 'if', cond: bin('>', at('kind', v('node')), n(4)), then: [{ kind: 'return', expr: n(-1) }] },
        { kind: 'comment', text: 'post-order: left, right, then the node itself' },
        { kind: 'var', name: 'l', type: INT, init: call('foldExpr', foldArgs(at('left', v('node')))) },
        { kind: 'var', name: 'r', type: INT, init: call('foldExpr', foldArgs(at('right', v('node')))) },
        {
          kind: 'if',
          cond: bin('==', v('l'), n(1)),
          then: [
            {
              kind: 'if',
              cond: bin('==', v('r'), n(1)),
              then: [
                { kind: 'var', name: 'a', type: INT, init: at('val', at('left', v('node'))) },
                { kind: 'var', name: 'b', type: INT, init: at('val', at('right', v('node'))) },
                {
                  kind: 'if',
                  cond: bin('==', at('kind', v('node')), n(2)),
                  then: [set(at('val', v('node')), bin('+', v('a'), v('b')))],
                  else: [
                    {
                      kind: 'if',
                      cond: bin('==', at('kind', v('node')), n(3)),
                      then: [set(at('val', v('node')), bin('-', v('a'), v('b')))],
                      else: [
                        {
                          kind: 'if',
                          cond: bin('==', at('kind', v('node')), n(4)),
                          then: [set(at('val', v('node')), bin('*', v('a'), v('b')))],
                        },
                      ],
                    },
                  ],
                },
                set(at('kind', v('node')), n(0)),
                inc(at('stats', n(0)), n(1)),
                { kind: 'return', expr: n(1) },
              ],
            },
          ],
        },
        { kind: 'return', expr: n(0) },
      ],
    },
    {
      name: 'countUses',
      params: [{ name: 'node', type: INT }, ...treeParams, { name: 'useCount', type: INTS }],
      returnType: VOID,
      body: [
        {
          kind: 'if',
          cond: bin('==', at('kind', v('node')), n(1)),
          then: [inc(at('useCount', at('val', v('node'))), n(1))],
        },
        {
          kind: 'if',
          cond: bin('>=', at('kind', v('node')), n(2)),
          then: [
            {
              kind: 'if',
              cond: bin('<=', at('kind', v('node')), n(4)),
              then: [
                { kind: 'expr-stmt', expr: call('countUses', [at('left', v('node')), ...tree(), v('useCount')]) },
                { kind: 'expr-stmt', expr: call('countUses', [at('right', v('node')), ...tree(), v('useCount')]) },
              ],
            },
          ],
        },
      ],
    },
    {
      name: 'countOps',
      params: [
        { name: 'node', type: INT },
        { name: 'kind', type: INTS },
        { name: 'left', type: INTS },
        { name: 'right', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'if', cond: bin('==', at('kind', v('node')), n(0)), then: [{ kind: 'return', expr: n(0) }] },
        { kind: 'if', cond: bin('==', at('kind', v('node')), n(1)), then: [{ kind: 'return', expr: n(0) }] },
        { kind: 'if', cond: bin('<', at('kind', v('node')), n(0)), then: [{ kind: 'return', expr: n(-1) }] },
        { kind: 'if', cond: bin('>', at('kind', v('node')), n(4)), then: [{ kind: 'return', expr: n(-1) }] },
        {
          kind: 'return',
          expr: bin(
            '+',
            bin('+', n(1), call('countOps', [at('left', v('node')), v('kind'), v('left'), v('right')])),
            call('countOps', [at('right', v('node')), v('kind'), v('left'), v('right')]),
          ),
        },
      ],
    },
  ],
};

export const foldAndSweepIRs: IR[] = [foldAndSweepImperativeIR];
