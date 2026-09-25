/**
 * 수거기 두 벌을 여섯 언어로 — 코드 패널의 IR.
 *
 * 여섯 언어의 GC 를 보이는 것이 아니라, **수거기 자체**를 여섯 언어가 같은 뜻인 자리(정수 · 목록 칸
 * 읽기/쓰기 · while · for-range · if)로 쓴 것이다. 그래프는 평탄 인접 목록 `adj[i*n+j]`, 수 · 표시 ·
 * 작업 스택은 부르는 쪽이 만든 버퍼(`counts` · `work` · `marks` · `pending`)로 받는다 — IR 은 목록을
 * 짓지 못한다. `pending` 은 길이 n*n + 뿌리 수 (처음 표시될 때만 이웃을 쌓으니 넘치지 않는 상한).
 *
 * phase 어휘 (algorithm.ts 와 같다): drop · rc-free · mark · sweep-keep · sweep-free.
 * 셈 전 준비 루프(수 세기 · 표시 지우기)에는 phase 를 두지 않는다.
 * `&&` 는 인터프리터에서 짧은 회로가 아니라 조건을 중첩 `if` 로 둔다. 식별자는 `stack` · `free` · `next` 를 피한다.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '*' | '==' | '>', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const plus1 = (e: IRExpr): IRExpr => bin('+', e, n(1));
const minus1 = (e: IRExpr): IRExpr => bin('-', e, n(1));
/** adj[a*n+b] */
const edge = (a: IRExpr, b: IRExpr): IRExpr => at('adj', bin('+', bin('*', a, v('n')), b));

const letInt = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'var', name, type: INT, init, phase } : { kind: 'var', name, type: INT, init };
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const loop = (name: string, to: IRExpr, body: IRStmt[]): IRStmt => ({ kind: 'for-range', var: name, from: n(0), to, inclusive: false, body });
const when = (cond: IRExpr, then: IRStmt[], otherwise?: IRStmt[]): IRStmt =>
  otherwise ? { kind: 'if', cond, then, else: otherwise } : { kind: 'if', cond, then };
const comment = (text: string): IRStmt => ({ kind: 'comment', text });

const garbageLeft = {
  name: 'garbageLeft',
  params: [
    { name: 'adj', type: LIST },
    { name: 'n', type: INT },
    { name: 'roots', type: LIST },
    { name: 'kept', type: LIST },
    { name: 'counts', type: LIST },
    { name: 'work', type: LIST },
    { name: 'marks', type: LIST },
    { name: 'pending', type: LIST },
  ],
  returnType: INT,
  body: [
    comment('garbage left = freed by tracing - freed by counting'),
    letInt('byCount', { kind: 'call', fn: 'countRefFreed', args: ['adj', 'n', 'roots', 'kept', 'counts', 'work'].map(v) }),
    letInt('byTrace', { kind: 'call', fn: 'countTraced', args: ['adj', 'n', 'roots', 'kept', 'marks', 'pending'].map(v) }),
    { kind: 'return', expr: bin('-', v('byTrace'), v('byCount')) },
  ] as IRStmt[],
};

const countRefFreed = {
  name: 'countRefFreed',
  params: [
    { name: 'adj', type: LIST },
    { name: 'n', type: INT },
    { name: 'roots', type: LIST },
    { name: 'kept', type: LIST },
    { name: 'counts', type: LIST },
    { name: 'work', type: LIST },
  ],
  returnType: INT,
  body: [
    comment('count pointers: one per root, one per incoming edge'),
    loop('i', v('n'), [set(at('counts', v('i')), n(0))]),
    loop('r', { kind: 'len', of: v('roots') }, [set(at('counts', at('roots', v('r'))), plus1(at('counts', at('roots', v('r')))))]),
    loop('i', v('n'), [
      loop('j', v('n'), [when(bin('==', edge(v('i'), v('j')), n(1)), [set(at('counts', v('j')), plus1(at('counts', v('j'))))])]),
    ]),
    letInt('freed', n(0)),
    letInt('top', n(0)),
    loop('r', { kind: 'len', of: v('roots') }, [
      when(bin('==', at('kept', v('r')), n(0)), [
        comment('drop the root: its object loses one pointer'),
        set(at('counts', at('roots', v('r'))), minus1(at('counts', at('roots', v('r')))), 'drop'),
        when(bin('==', at('counts', at('roots', v('r'))), n(0)), [
          set(at('work', v('top')), at('roots', v('r'))),
          set(v('top'), plus1(v('top'))),
        ]),
        {
          kind: 'while',
          cond: bin('>', v('top'), n(0)),
          body: [
            set(v('top'), minus1(v('top'))),
            letInt('o', at('work', v('top'))),
            comment('count reached zero: reclaim o at once'),
            set(v('freed'), plus1(v('freed')), 'rc-free'),
            loop('j', v('n'), [
              when(bin('==', edge(v('o'), v('j')), n(1)), [
                set(at('counts', v('j')), minus1(at('counts', v('j')))),
                when(bin('==', at('counts', v('j')), n(0)), [
                  set(at('work', v('top')), v('j')),
                  set(v('top'), plus1(v('top'))),
                ]),
              ]),
            ]),
          ],
        },
      ]),
    ]),
    { kind: 'return', expr: v('freed') },
  ] as IRStmt[],
};

const countTraced = {
  name: 'countTraced',
  params: [
    { name: 'adj', type: LIST },
    { name: 'n', type: INT },
    { name: 'roots', type: LIST },
    { name: 'kept', type: LIST },
    { name: 'marks', type: LIST },
    { name: 'pending', type: LIST },
  ],
  returnType: INT,
  body: [
    loop('i', v('n'), [set(at('marks', v('i')), n(0))]),
    comment('mark: spread from every kept root, depth first'),
    loop('r', { kind: 'len', of: v('roots') }, [
      when(bin('==', at('kept', v('r')), n(1)), [
        letInt('top', n(0)),
        set(at('pending', v('top')), at('roots', v('r'))),
        set(v('top'), plus1(v('top'))),
        {
          kind: 'while',
          cond: bin('>', v('top'), n(0)),
          body: [
            set(v('top'), minus1(v('top'))),
            letInt('o', at('pending', v('top'))),
            when(bin('==', at('marks', v('o')), n(0)), [
              set(at('marks', v('o')), n(1), 'mark'),
              loop('k', v('n'), [
                letInt('j', minus1(bin('-', v('n'), v('k')))),
                when(bin('==', edge(v('o'), v('j')), n(1)), [
                  when(bin('==', at('marks', v('j')), n(0)), [
                    set(at('pending', v('top')), v('j')),
                    set(v('top'), plus1(v('top'))),
                  ]),
                ]),
              ]),
            ]),
          ],
        },
      ]),
    ]),
    comment('sweep: walk the heap in order, reclaim what is unmarked'),
    letInt('collected', n(0)),
    loop('i', v('n'), [
      when(bin('==', at('marks', v('i')), n(1)), [{ kind: 'continue', phase: 'sweep-keep' }]),
      set(v('collected'), plus1(v('collected')), 'sweep-free'),
    ]),
    { kind: 'return', expr: v('collected') },
  ] as IRStmt[],
};

export const tracingVsRefcountImperativeIR: IR = {
  id: 'tracing-vs-refcount-imperative',
  algorithm: 'tracingVsRefcount',
  paradigm: 'imperative',
  functions: [garbageLeft, countRefFreed, countTraced],
};

export const tracingVsRefcountIRs: IR[] = [tracingVsRefcountImperativeIR];
