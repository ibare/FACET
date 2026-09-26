/**
 * incremental-build IR — 판정 규칙과 "바뀜" 의 전파.
 *
 * 진입 함수 `countRebuilt(policy, sourceCount, targetCount, needs, stamp, marked, outSame, visited, verdict, saveClock)`
 * - 마디 번호: 소스 0..S−1 (데이터 차례), 대상 S..S+T−1 (규칙 차례). m = S + T.
 *   `needs[t * m + j] == 1` 이면 대상 t 가 마디 j 에 기댄다.
 * - `stamp[마디]` 시각(분). 부르는 쪽이 저장한 소스 칸에 저장 시각을 넣는다. IR 이 다시 세운 대상 칸을 새 시각으로 고쳐 쓴다.
 * - `marked[마디]` 1 = 바뀜. 부르는 쪽이 소스 칸만 지문을 견줘 채운다(FNV 는 비트 연산이라 IR 밖). 대상 칸은 IR 이 쓴다.
 * - `outSame[t]` 1 = 다시 세우면 결과 지문이 지난번과 같다 (부르는 쪽이 셈한다).
 * - `visited` · `verdict` 는 길이 T 의 0 버퍼. verdict 0 그대로 · 1 다시 · 2 다시 세웠으나 결과가 같아 멈춤.
 * - 돌려주는 값 = 다시 세운 수. 들여다볼 대상을 못 고르면(고리) −1.
 *
 * phase: `keep` · `rebuild` · `hold` — algorithm.ts 와 같은 집합.
 * 중간값 최대 608(분) · 44(색인) — 32 비트 걱정 없음.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '*' | '<' | '>' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: o, l, r });
const decl = (name: string, init: IRExpr): IRStmt => ({ kind: 'var', name, type: INT, init });
const set = (target: IRExpr, expr: IRExpr, phase?: string): IRStmt =>
  phase ? { kind: 'assign', target, expr, phase } : { kind: 'assign', target, expr };
const when = (cond: IRExpr, then: IRStmt[], otherwise?: IRStmt[]): IRStmt =>
  otherwise ? { kind: 'if', cond, then, else: otherwise } : { kind: 'if', cond, then };
const loop = (name: string, from: IRExpr, to: IRExpr, body: IRStmt[]): IRStmt => ({
  kind: 'for-range', var: name, from, to, inclusive: false, body,
});
const note = (text: string): IRStmt => ({ kind: 'comment', text });

// needs[t * m + j]
const need = (t: IRExpr, j: IRExpr): IRExpr => at('needs', op('+', op('*', t, v('m')), j));

export const incrementalBuildImperativeIR: IR = {
  id: 'incremental-build-imperative',
  algorithm: 'incrementalBuild',
  paradigm: 'imperative',
  functions: [
    {
      name: 'countRebuilt',
      params: [
        { name: 'policy', type: INT },
        { name: 'sourceCount', type: INT },
        { name: 'targetCount', type: INT },
        { name: 'needs', type: INTS },
        { name: 'stamp', type: INTS },
        { name: 'marked', type: INTS },
        { name: 'outSame', type: INTS },
        { name: 'visited', type: INTS },
        { name: 'verdict', type: INTS },
        { name: 'saveClock', type: INT },
      ],
      returnType: INT,
      body: [
        note('policy 0 = timestamp, 1 = input fingerprint, 2 = output fingerprint (early cutoff).'),
        note('Fingerprints are hashed by the caller: marked[] and outSame[] arrive as 1/0.'),
        decl('m', op('+', v('sourceCount'), v('targetCount'))),
        decl('clock', v('saveClock')),
        decl('rebuilt', n(0)),
        decl('kept', n(0)),
        decl('held', n(0)),
        loop('turn', n(0), v('targetCount'), [
          note('Pick the first target (rule order) whose target inputs were all visited.'),
          decl('pick', n(-1)),
          loop('t', n(0), v('targetCount'), [
            when(op('<', v('pick'), n(0)), [
              when(op('==', at('visited', v('t')), n(0)), [
                decl('ready', n(1)),
                loop('j', v('sourceCount'), v('m'), [
                  when(op('==', need(v('t'), v('j')), n(1)), [
                    when(op('==', at('visited', op('-', v('j'), v('sourceCount'))), n(0)), [
                      set(v('ready'), n(0)),
                    ]),
                  ]),
                ]),
                when(op('==', v('ready'), n(1)), [set(v('pick'), v('t'))]),
              ]),
            ]),
          ]),
          when(op('<', v('pick'), n(0)), [{ kind: 'return', expr: n(-1) }]),
          set(at('visited', v('pick')), n(1)),
          decl('node', op('+', v('sourceCount'), v('pick'))),
          decl('dirty', n(0)),
          loop('j', n(0), v('m'), [
            when(op('==', need(v('pick'), v('j')), n(1)), [
              when(
                op('==', v('policy'), n(0)),
                [when(op('>', at('stamp', v('j')), at('stamp', v('node'))), [set(v('dirty'), n(1))])],
                [when(op('==', at('marked', v('j')), n(1)), [set(v('dirty'), n(1))])],
              ),
            ]),
          ]),
          when(
            op('==', v('dirty'), n(0)),
            [
              set(v('kept'), op('+', v('kept'), n(1)), 'keep'),
              set(at('marked', v('node')), n(0)),
              set(at('verdict', v('pick')), n(0)),
            ],
            [
              set(v('rebuilt'), op('+', v('rebuilt'), n(1)), 'rebuild'),
              set(v('clock'), op('+', v('clock'), n(1))),
              set(at('stamp', v('node')), v('clock')),
              set(at('marked', v('node')), n(1)),
              set(at('verdict', v('pick')), n(1)),
              when(op('==', v('policy'), n(2)), [
                when(op('==', at('outSame', v('pick')), n(1)), [
                  note('Same result as last time: do not pass the change upward.'),
                  set(v('held'), op('+', v('held'), n(1)), 'hold'),
                  set(at('marked', v('node')), n(0)),
                  set(at('verdict', v('pick')), n(2)),
                ]),
              ]),
            ],
          ),
        ]),
        { kind: 'return', expr: v('rebuilt') },
      ],
    },
  ],
};

/**
 * The code panel shows how changes, received as 1/0, are judged and passed upward.
 * Fingerprint values themselves are FNV-1a (bit operations, not in the IR vocabulary);
 * the caller hashes them and hands the comparisons over as marked[] and outSame[].
 * The build clock advances by one minute per rebuilt target, as in the data.
 */
export const incrementalBuildIRs: IR[] = [incrementalBuildImperativeIR];
