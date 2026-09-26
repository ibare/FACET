/**
 * linker IR — 코드 패널은 화면의 파일들이 아니라 **파일을 잇고 칸을 고치는 링커**다.
 *
 * 해석과 재배치를 둘 다 둔다. 손잡이 둘이 모두 해석(누가 넣히나)을 바꾸고 그 결과가 놓기와 고친 수를
 * 바꾸므로, 재배치만 두면 깨짐과 끌려옴을 코드 패널이 말하지 못한다.
 *
 * 이름 · 파일은 번호다. 부르는 쪽이 번호를 짓고 버퍼(defined · waiting · included · textAt · dataAt ·
 * fieldVal · stats)를 길이만큼 만들어 넘긴다 — IR 은 배열을 만들 수 없다.
 *
 * 진입 link(...) → 고친 칸 수 (깨지면 0 - 정의 없는 이름 수). stats[0] 가장 긴 기다림 · stats[1] 넣은 파일.
 * isLib · symSec · relAbs 가 0 · 1 밖이면 표지 bad = 0 - (심볼 수 + 1) 을 돌려준다 — 정의 없음의 음수(최소 0 - 심볼 수)와 겹치지 않는다.
 *
 * phase ↔ IR 문 (algorithm.ts 와 같은 집합):
 *   resolve-def  defined[s] = 1           resolve-use  waiting[useSym[u]] = 1
 *   skip-lib     included[f] = 0          undefined    return 0 - missing
 *   place        textAt[f] = tAt          patch-abs    fieldVal[j] = target
 *   patch-rel    fieldVal[j] = target - (textAt[f] + relOff[j])
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const len = (name: string): IRExpr => ({ kind: 'len', of: v(name) });
const bin = (op: '+' | '-' | '==' | '!=' | '>', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target, expr } : { kind: 'assign', target, expr, phase };
const inc = (name: string, by: IRExpr): IRStmt => set(v(name), bin('+', v(name), by));
const loop = (name: string, to: IRExpr, body: IRStmt[]): IRStmt => ({ kind: 'for-range', var: name, from: n(0), to, inclusive: false, body });
const when = (cond: IRExpr, then: IRStmt[], otherwise?: IRStmt[]): IRStmt =>
  otherwise === undefined ? { kind: 'if', cond, then } : { kind: 'if', cond, then, else: otherwise };
const intVar = (name: string, init: IRExpr): IRStmt => ({ kind: 'var', name, type: INT, init });

const PARAMS = [
  'order', 'isLib', 'textSize', 'dataSize', 'textStart', 'dataStart',
  'symFile', 'symSec', 'symOff', 'useFile', 'useSym',
  'relFile', 'relOff', 'relSym', 'relAbs',
  'defined', 'waiting', 'included', 'textAt', 'dataAt', 'fieldVal', 'stats',
] as const;
const SCALARS = new Set<string>(['textStart', 'dataStart']);

/** 매개변수 이름 차례 — 부르는 쪽(test)이 이 차례로 인자를 짠다 */
export const linkerIRParams: readonly string[] = PARAMS;

export const linkerImperativeIR: IR = {
  id: 'linker-imperative',
  algorithm: 'linker',
  paradigm: 'imperative',
  functions: [
    {
      name: 'link',
      params: PARAMS.map((name) => ({ name, type: SCALARS.has(name) ? INT : INTS })),
      returnType: INT,
      body: [
        { kind: 'comment', text: 'resolve: read files in link order, one pass' },
        intVar('nSym', len('symFile')),
        { kind: 'comment', text: 'marker for an unknown shape: below every missing-name count 0 - nSym' },
        intVar('bad', bin('-', n(0), bin('+', v('nSym'), n(1)))),
        loop('s', v('nSym'), [set(at('defined', v('s')), n(0)), set(at('waiting', v('s')), n(0))]),
        intVar('longest', n(0)),
        loop('p', len('order'), [
          intVar('f', at('order', v('p'))),
          set(at('included', v('f')), n(1)),
          { kind: 'comment', text: 'a library joins only if it defines a name someone is waiting for' },
          when(bin('==', at('isLib', v('f')), n(1)), [
            intVar('wanted', n(0)),
            loop('s', v('nSym'), [
              when(bin('==', at('symFile', v('s')), v('f')), [
                when(bin('==', at('waiting', v('s')), n(1)), [set(v('wanted'), n(1))]),
              ]),
            ]),
            when(bin('==', v('wanted'), n(0)), [set(at('included', v('f')), n(0), 'skip-lib')]),
          ], [
            when(bin('!=', at('isLib', v('f')), n(0)), [{ kind: 'return', expr: v('bad') }]),
          ]),
          when(bin('==', at('included', v('f')), n(1)), [
            set(at('stats', n(1)), bin('+', at('stats', n(1)), n(1))),
            loop('s', v('nSym'), [
              when(bin('==', at('symFile', v('s')), v('f')), [
                set(at('defined', v('s')), n(1), 'resolve-def'),
                set(at('waiting', v('s')), n(0)),
              ]),
            ]),
            loop('u', len('useFile'), [
              when(bin('==', at('useFile', v('u')), v('f')), [
                when(bin('==', at('defined', at('useSym', v('u'))), n(0)), [
                  set(at('waiting', at('useSym', v('u'))), n(1), 'resolve-use'),
                ]),
              ]),
            ]),
            intVar('count', n(0)),
            loop('s', v('nSym'), [inc('count', at('waiting', v('s')))]),
            set(v('longest'), { kind: 'call', fn: 'max', args: [v('longest'), v('count')] }),
          ]),
        ]),
        set(at('stats', n(0)), v('longest')),
        intVar('missing', n(0)),
        loop('s', v('nSym'), [inc('missing', at('waiting', v('s')))]),
        when(bin('>', v('missing'), n(0)), [{ kind: 'return', expr: bin('-', n(0), v('missing')), phase: 'undefined' }]),
        { kind: 'comment', text: 'place: text and data sections back to back' },
        intVar('tAt', v('textStart')),
        intVar('dAt', v('dataStart')),
        loop('p', len('order'), [
          intVar('f', at('order', v('p'))),
          when(bin('==', at('included', v('f')), n(1)), [
            set(at('textAt', v('f')), v('tAt'), 'place'),
            set(at('dataAt', v('f')), v('dAt')),
            inc('tAt', at('textSize', v('f'))),
            inc('dAt', at('dataSize', v('f'))),
          ]),
        ]),
        { kind: 'comment', text: 'patch: ABS field = S, REL field = S - P' },
        intVar('patched', n(0)),
        loop('p', len('order'), [
          intVar('f', at('order', v('p'))),
          when(bin('==', at('included', v('f')), n(1)), [
            loop('j', len('relFile'), [
              when(bin('==', at('relFile', v('j')), v('f')), [
                intVar('sym', at('relSym', v('j'))),
                intVar('target', n(0)),
                when(
                  bin('==', at('symSec', v('sym')), n(0)),
                  [set(v('target'), bin('+', at('textAt', at('symFile', v('sym'))), at('symOff', v('sym'))))],
                  [
                    when(
                      bin('==', at('symSec', v('sym')), n(1)),
                      [set(v('target'), bin('+', at('dataAt', at('symFile', v('sym'))), at('symOff', v('sym'))))],
                      [{ kind: 'return', expr: v('bad') }],
                    ),
                  ],
                ),
                when(
                  bin('==', at('relAbs', v('j')), n(1)),
                  [set(at('fieldVal', v('j')), v('target'), 'patch-abs')],
                  [
                    when(
                      bin('==', at('relAbs', v('j')), n(0)),
                      [set(at('fieldVal', v('j')), bin('-', v('target'), bin('+', at('textAt', v('f')), at('relOff', v('j')))), 'patch-rel')],
                      [{ kind: 'return', expr: v('bad') }],
                    ),
                  ],
                ),
                inc('patched', n(1)),
              ]),
            ]),
          ]),
        ]),
        { kind: 'return', expr: v('patched') },
      ],
    },
  ],
};

export const linkerIRs: IR[] = [linkerImperativeIR];
