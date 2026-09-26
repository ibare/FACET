/**
 * flow-graphs 의 IR — 흐름 그래프 짓기 (컴파일러 함수). 사슬까지 셈한다.
 *
 * 화면이 셈하는 것과 같은 답을 낸다: 블록 수 · 간선(목록) · 거슬러 · 바뀐 훑기 · 사슬 · 넣기 둘이 닿는 읽기.
 * IR 은 배열을 만들 수 없어 버퍼를 모두 매개변수로 받는다 (n = 명령 수):
 *   isLeader · blockOf · blockStart n, edgeFrom · edgeTo 2n, reachIn · reachOut n × n, reachCount 2n,
 *   stats 6 (0 블록 · 1 간선 · 2 거슬러 · 3 바뀐 훑기 · 4 사슬 · 5 넣기 둘이 닿는 읽기)
 * 명령은 번호로: kind 0 셈 · 1 ifnot · 2 goto · 3 return, target = 뛰는 명령 번호(없으면 -1),
 * defVar · readVar(두 칸) = 넣어지는 이름(임시 포함)의 번호, 넣기가 없는 이름과 수는 -1.
 * 이름을 견주는 것은 번호가 같은가뿐이라 번호의 차례를 섞어도 답이 같다 (검사가 잠근다).
 *
 * phase 어휘 다섯 (algorithm.ts 와 같다): leader · edge · reach · chain · two-defs
 *
 * 사양과 다른 자리: `countChains` 는 사양의 인자 목록에 reachCount 가 빠져 있어 더했다 (사양이 그 칸에 적는 문을 말한다).
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const VOID: IRType = { kind: 'void' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '<' | '<=' | '>=' | '==' | '!=' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op,
  l,
  r,
});
const add = (l: IRExpr, r: IRExpr): IRExpr => bin('+', l, r);
const decl = (name: string, init: IRExpr): IRStmt => ({ kind: 'var', name, type: INT, init });
const set = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target: v(name), expr } : { kind: 'assign', target: v(name), expr, phase };
const put = (arr: string, idx: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'assign', target: at(arr, idx), expr }
    : { kind: 'assign', target: at(arr, idx), expr, phase };
const loop = (name: string, from: IRExpr, to: IRExpr, body: IRStmt[]): IRStmt => ({
  kind: 'for-range',
  var: name,
  from,
  to,
  inclusive: false,
  body,
});
const when = (cond: IRExpr, then: IRStmt[], otherwise?: IRStmt[]): IRStmt =>
  otherwise === undefined ? { kind: 'if', cond, then } : { kind: 'if', cond, then, else: otherwise };
const call = (fn: string, args: string[]): IRExpr => ({ kind: 'call', fn, args: args.map(v) });
const note = (text: string): IRStmt => ({ kind: 'comment', text });
const p = (name: string, type: IRType = INTS) => ({ name, type });

/** 리더에 1 을 적고, 앞에서부터 세어 blockOf · blockStart 를 채운다. 블록 수를 돌려준다 */
const markLeaders = {
  name: 'markLeaders',
  params: [p('kind'), p('target'), p('isLeader'), p('blockOf'), p('blockStart')],
  returnType: INT,
  body: [
    decl('n', { kind: 'len', of: v('kind') }),
    note('leaders: the first instruction, every jump target, the one after a jump or return'),
    put('isLeader', n(0), n(1), 'leader'),
    loop('i', n(0), v('n'), [
      when(bin('||', bin('==', at('kind', v('i')), n(1)), bin('==', at('kind', v('i')), n(2))), [
        put('isLeader', at('target', v('i')), n(1), 'leader'),
      ]),
      when(bin('>=', at('kind', v('i')), n(1)), [
        when(bin('<', add(v('i'), n(1)), v('n')), [put('isLeader', add(v('i'), n(1)), n(1), 'leader')]),
      ]),
    ]),
    decl('b', n(-1)),
    loop('i', n(0), v('n'), [
      when(bin('==', at('isLeader', v('i')), n(1)), [
        set('b', add(v('b'), n(1))),
        put('blockStart', v('b'), v('i')),
      ]),
      put('blockOf', v('i'), v('b')),
    ]),
    { kind: 'return', expr: add(v('b'), n(1)) },
  ] as IRStmt[],
};

/** 블록 끝 명령이 간선을 정한다 — 뜀 먼저, 흘러내림 그다음. 간선 수를 돌려준다 */
const buildEdges = {
  name: 'buildEdges',
  params: [p('kind'), p('target'), p('blockOf'), p('blockStart'), p('nb', INT), p('edgeFrom'), p('edgeTo'), p('stats')],
  returnType: INT,
  body: [
    decl('n', { kind: 'len', of: v('kind') }),
    decl('ne', n(0)),
    loop('b', n(0), v('nb'), [
      decl('last', bin('-', v('n'), n(1))),
      when(bin('<', add(v('b'), n(1)), v('nb')), [set('last', bin('-', at('blockStart', add(v('b'), n(1))), n(1)))]),
      note('a goto or ifnot jumps to the block holding its target'),
      when(bin('||', bin('==', at('kind', v('last')), n(1)), bin('==', at('kind', v('last')), n(2))), [
        put('edgeFrom', v('ne'), v('b'), 'edge'),
        put('edgeTo', v('ne'), at('blockOf', at('target', v('last'))), 'edge'),
        when(bin('<=', at('edgeTo', v('ne')), v('b')), [put('stats', n(2), add(at('stats', n(2)), n(1)))]),
        set('ne', add(v('ne'), n(1))),
      ]),
      note('plain code and ifnot also fall through to the next block'),
      when(bin('||', bin('==', at('kind', v('last')), n(0)), bin('==', at('kind', v('last')), n(1))), [
        when(bin('<', add(v('b'), n(1)), v('nb')), [
          put('edgeFrom', v('ne'), v('b'), 'edge'),
          put('edgeTo', v('ne'), add(v('b'), n(1)), 'edge'),
          set('ne', add(v('ne'), n(1))),
        ]),
      ]),
    ]),
    { kind: 'return', expr: v('ne') },
  ] as IRStmt[],
};

/** 도달 정의 — 블록을 번호 차례로 훑고 그 자리에서 고친다. 바뀐 것이 있던 훑기 수를 stats[3] 에 */
const reachDefs = {
  name: 'reachDefs',
  params: [
    p('defVar'),
    p('blockStart'),
    p('nb', INT),
    p('edgeFrom'),
    p('edgeTo'),
    p('ne', INT),
    p('reachIn'),
    p('reachOut'),
    p('stats'),
  ],
  returnType: VOID,
  body: [
    decl('n', { kind: 'len', of: v('defVar') }),
    decl('changed', n(1)),
    {
      kind: 'while',
      cond: bin('==', v('changed'), n(1)),
      body: [
        set('changed', n(0)),
        loop('b', n(0), v('nb'), [
          decl('stop', v('n')),
          when(bin('<', add(v('b'), n(1)), v('nb')), [set('stop', at('blockStart', add(v('b'), n(1))))]),
          loop('d', n(0), v('n'), [
            when(bin('>=', at('defVar', v('d')), n(0)), [
              note('in: does definition d leave any predecessor?'),
              decl('inBit', n(0)),
              loop('e', n(0), v('ne'), [
                when(bin('==', at('edgeTo', v('e')), v('b')), [
                  when(bin('==', at('reachOut', add(bin('*', at('edgeFrom', v('e')), v('n')), v('d'))), n(1)), [
                    set('inBit', n(1)),
                  ]),
                ]),
              ]),
              when(bin('!=', v('inBit'), at('reachIn', add(bin('*', v('b'), v('n')), v('d')))), [
                put('reachIn', add(bin('*', v('b'), v('n')), v('d')), v('inBit'), 'reach'),
                set('changed', n(1)),
              ]),
              note('out: the last definition of the same variable in this block wins'),
              decl('outBit', v('inBit')),
              decl('lastDef', n(-1)),
              loop('k', at('blockStart', v('b')), v('stop'), [
                when(bin('==', at('defVar', v('k')), at('defVar', v('d'))), [set('lastDef', v('k'))]),
              ]),
              when(bin('>=', v('lastDef'), n(0)), [
                set('outBit', n(0)),
                when(bin('==', v('lastDef'), v('d')), [set('outBit', n(1))]),
              ]),
              when(bin('!=', v('outBit'), at('reachOut', add(bin('*', v('b'), v('n')), v('d')))), [
                put('reachOut', add(bin('*', v('b'), v('n')), v('d')), v('outBit'), 'reach'),
                set('changed', n(1)),
              ]),
            ]),
          ]),
        ]),
        when(bin('==', v('changed'), n(1)), [put('stats', n(3), add(at('stats', n(3)), n(1)))]),
      ],
    },
  ] as IRStmt[],
};

/** 읽는 자리마다 닿는 넣기 수 — 같은 블록 위에 넣기가 있으면 1, 없으면 머리에 닿는 넣기 모두. 사슬 합을 돌려준다 */
const countChains = {
  name: 'countChains',
  params: [p('defVar'), p('readVar'), p('blockOf'), p('blockStart'), p('reachIn'), p('reachCount'), p('stats')],
  returnType: INT,
  body: [
    decl('n', { kind: 'len', of: v('defVar') }),
    decl('total', n(0)),
    loop('i', n(0), v('n'), [
      decl('b', at('blockOf', v('i'))),
      loop('j', n(0), n(2), [
        decl('r', at('readVar', add(bin('*', v('i'), n(2)), v('j')))),
        when(bin('>=', v('r'), n(0)), [
          decl('near', n(-1)),
          loop('m', at('blockStart', v('b')), v('i'), [
            when(bin('==', at('defVar', v('m')), v('r')), [set('near', v('m'))]),
          ]),
          decl('cnt', n(0)),
          when(
            bin('>=', v('near'), n(0)),
            [set('cnt', n(1))],
            [
              loop('d', n(0), v('n'), [
                when(bin('==', at('defVar', v('d')), v('r')), [
                  when(bin('==', at('reachIn', add(bin('*', v('b'), v('n')), v('d'))), n(1)), [
                    set('cnt', add(v('cnt'), n(1))),
                  ]),
                ]),
              ]),
            ],
          ),
          put('reachCount', add(bin('*', v('i'), n(2)), v('j')), v('cnt'), 'chain'),
          set('total', add(v('total'), v('cnt'))),
          when(bin('>=', v('cnt'), n(2)), [put('stats', n(5), add(at('stats', n(5)), n(1)), 'two-defs')]),
        ]),
      ]),
    ]),
    put('stats', n(4), v('total')),
    { kind: 'return', expr: v('total') },
  ] as IRStmt[],
};

/** 진입 — 넷을 차례로 부르고 넣기 둘이 닿는 읽기 수를 돌려준다 */
const flowGraph = {
  name: 'flowGraph',
  params: [
    p('kind'),
    p('target'),
    p('defVar'),
    p('readVar'),
    p('isLeader'),
    p('blockOf'),
    p('blockStart'),
    p('edgeFrom'),
    p('edgeTo'),
    p('reachIn'),
    p('reachOut'),
    p('reachCount'),
    p('stats'),
  ],
  returnType: INT,
  body: [
    decl('nb', call('markLeaders', ['kind', 'target', 'isLeader', 'blockOf', 'blockStart'])),
    put('stats', n(0), v('nb')),
    decl('ne', call('buildEdges', ['kind', 'target', 'blockOf', 'blockStart', 'nb', 'edgeFrom', 'edgeTo', 'stats'])),
    put('stats', n(1), v('ne')),
    {
      kind: 'expr-stmt',
      expr: call('reachDefs', ['defVar', 'blockStart', 'nb', 'edgeFrom', 'edgeTo', 'ne', 'reachIn', 'reachOut', 'stats']),
    },
    {
      kind: 'expr-stmt',
      expr: call('countChains', ['defVar', 'readVar', 'blockOf', 'blockStart', 'reachIn', 'reachCount', 'stats']),
    },
    { kind: 'return', expr: at('stats', n(5)) },
  ] as IRStmt[],
};

export const flowGraphsImperativeIR: IR = {
  id: 'flow-graphs-imperative',
  algorithm: 'flowGraphs',
  paradigm: 'imperative',
  functions: [flowGraph, markLeaders, buildEdges, reachDefs, countChains],
};

export const flowGraphsIRs: IR[] = [flowGraphsImperativeIR];
