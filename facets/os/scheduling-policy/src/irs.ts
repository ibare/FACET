/**
 * CPU 스케줄 정책의 IR — 틱 반복 하나에 틱 경계의 차례를 그대로 적는다.
 *
 * 큐가 IR 에 없으므로 줄은 queued[i] (1/0) 와 seq[i] (줄에 선 차례) 두 배열로 펼친다.
 * 고름은 "줄에 있는 것 가운데 (열쇠, seq) 가 가장 작은 것" — **열쇠만 정책마다 다르다** (keyOf).
 *   policy 0 FCFS 열쇠 seq · 1 SJF 열쇠 burst · 2 SRTF 열쇠 remain (선점) · 3 MLFQ 열쇠 level
 *
 * 진입 함수 schedule(policy, arrive, burst, remain, level, queued, seq, finish, quanta, n) 은 대기 합을
 * 돌려주고 finish 배열에 끝 틱을 적는다. 배열은 부르는 쪽이 길이 n 으로 만든다
 * (remain = burst 의 사본, level · queued · seq = 0, finish = -1). remain · level · queued · seq · finish 는 고쳐진다.
 *
 * running · best 가 -1 일 수 있는 자리의 색인은 if 를 중첩한다 — ir-interpreter 의 && · || 는 짧은 회로가 아니다.
 * phase 어휘(다섯): arrive · demote · dispatch · finish · preempt — algorithm.ts 와 같다.
 * 중간값 최대 49 (대기 합). 32 비트 걱정 없음.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const LIST: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const op = (o: '+' | '-' | '<' | '<=' | '>=' | '==' | '&&' | '||', l: IRExpr, r: IRExpr): IRExpr => ({
  kind: 'binop',
  op: o,
  l,
  r,
});
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({ kind: 'var', name, type: INT, init, phase });
const set = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({ kind: 'assign', target, expr, phase });
const when = (cond: IRExpr, then: IRStmt[], phase: string, otherwise?: IRStmt[]): IRStmt =>
  otherwise ? { kind: 'if', cond, then, else: otherwise, phase } : { kind: 'if', cond, then, phase };
const note = (text: string): IRStmt => ({ kind: 'comment', text });

/** 줄 끝에 세운다 — queued[who] = 1 · seq[who] = nextSeq · nextSeq += 1 */
const enqueue = (who: IRExpr, phase: string): IRStmt[] => [
  set({ kind: 'index', arr: v('queued'), idx: who }, n(1), phase),
  set({ kind: 'index', arr: v('seq'), idx: who }, v('nextSeq'), phase),
  set(v('nextSeq'), op('+', v('nextSeq'), n(1)), phase),
];

const pickArgs = (): IRExpr[] => [v('policy'), v('n'), v('queued'), v('burst'), v('remain'), v('level'), v('seq')];

const schedule: IR['functions'][number] = {
  name: 'schedule',
  params: [
    { name: 'policy', type: INT },
    { name: 'arrive', type: LIST },
    { name: 'burst', type: LIST },
    { name: 'remain', type: LIST },
    { name: 'level', type: LIST },
    { name: 'queued', type: LIST },
    { name: 'seq', type: LIST },
    { name: 'finish', type: LIST },
    { name: 'quanta', type: LIST },
    { name: 'n', type: INT },
  ],
  returnType: INT,
  body: [
    decl('nextSeq', n(0), 'dispatch'),
    decl('running', n(-1), 'dispatch'),
    decl('used', n(0), 'dispatch'),
    decl('done', n(0), 'dispatch'),
    decl('tick', n(0), 'dispatch'),
    {
      kind: 'while',
      cond: op('<', v('done'), v('n')),
      phase: 'dispatch',
      body: [
        note('1. the running one with nothing left finishes at this tick'),
        when(
          op('>=', v('running'), n(0)),
          [
            when(
              op('==', at('remain', v('running')), n(0)),
              [
                set(at('finish', v('running')), v('tick'), 'finish'),
                set(v('done'), op('+', v('done'), n(1)), 'finish'),
                set(v('running'), n(-1), 'finish'),
              ],
              'finish',
            ),
          ],
          'finish',
        ),
        note('2. MLFQ: quantum used up, step off the CPU (not queued yet)'),
        decl('down', n(-1), 'demote'),
        when(
          op('>=', v('running'), n(0)),
          [
            when(
              op('==', v('policy'), n(3)),
              [
                when(
                  op('>=', v('used'), at('quanta', at('level', v('running')))),
                  [set(v('down'), v('running'), 'demote'), set(v('running'), n(-1), 'demote')],
                  'demote',
                ),
              ],
              'demote',
            ),
          ],
          'demote',
        ),
        note('3. arrivals at this tick join the end of the queue, in list order'),
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('n'),
          inclusive: false,
          phase: 'arrive',
          body: [when(op('==', at('arrive', v('i')), v('tick')), enqueue(v('i'), 'arrive'), 'arrive')],
        },
        note('4. the demoted one lines up behind them, one level lower'),
        when(
          op('>=', v('down'), n(0)),
          [
            when(
              op('<', at('level', v('down')), op('-', { kind: 'len', of: v('quanta') }, n(1))),
              [set(at('level', v('down')), op('+', at('level', v('down')), n(1)), 'demote')],
              'demote',
            ),
            ...enqueue(v('down'), 'demote'),
          ],
          'demote',
        ),
        note('5. SRTF: preempt only when strictly less remains'),
        when(
          op('>=', v('running'), n(0)),
          [
            when(
              op('==', v('policy'), n(2)),
              [
                decl('cand', call('pick', pickArgs()), 'preempt'),
                when(
                  op('>=', v('cand'), n(0)),
                  [
                    when(
                      op('<', at('remain', v('cand')), at('remain', v('running'))),
                      [...enqueue(v('running'), 'preempt'), set(v('running'), n(-1), 'preempt')],
                      'preempt',
                    ),
                  ],
                  'preempt',
                ),
              ],
              'preempt',
            ),
          ],
          'preempt',
        ),
        note('6. the CPU is free: pick the smallest (key, seq) in the queue'),
        when(
          op('<', v('running'), n(0)),
          [
            decl('best', call('pick', pickArgs()), 'dispatch'),
            when(
              op('>=', v('best'), n(0)),
              [
                set(at('queued', v('best')), n(0), 'dispatch'),
                set(v('running'), v('best'), 'dispatch'),
                set(v('used'), n(0), 'dispatch'),
              ],
              'dispatch',
            ),
          ],
          'dispatch',
        ),
        note('7. run one tick'),
        when(
          op('>=', v('running'), n(0)),
          [
            set(at('remain', v('running')), op('-', at('remain', v('running')), n(1)), 'dispatch'),
            set(v('used'), op('+', v('used'), n(1)), 'dispatch'),
          ],
          'dispatch',
        ),
        set(v('tick'), op('+', v('tick'), n(1)), 'dispatch'),
      ],
    },
    note('wait = finish - arrive - burst'),
    decl('total', n(0), 'finish'),
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: v('n'),
      inclusive: false,
      phase: 'finish',
      body: [
        set(
          v('total'),
          op('-', op('-', op('+', v('total'), at('finish', v('i'))), at('arrive', v('i'))), at('burst', v('i'))),
          'finish',
        ),
      ],
    },
    { kind: 'return', expr: v('total'), phase: 'finish' },
  ],
};

const pick: IR['functions'][number] = {
  name: 'pick',
  params: [
    { name: 'policy', type: INT },
    { name: 'n', type: INT },
    { name: 'queued', type: LIST },
    { name: 'burst', type: LIST },
    { name: 'remain', type: LIST },
    { name: 'level', type: LIST },
    { name: 'seq', type: LIST },
  ],
  returnType: INT,
  body: [
    decl('best', n(-1), 'dispatch'),
    {
      kind: 'for-range',
      var: 'i',
      from: n(0),
      to: v('n'),
      inclusive: false,
      phase: 'dispatch',
      body: [
        when(
          op('==', at('queued', v('i')), n(1)),
          [
            when(
              op('<', v('best'), n(0)),
              [set(v('best'), v('i'), 'dispatch')],
              'dispatch',
              [
                decl('ki', call('keyOf', [v('policy'), v('i'), v('burst'), v('remain'), v('level'), v('seq')]), 'dispatch'),
                decl('kb', call('keyOf', [v('policy'), v('best'), v('burst'), v('remain'), v('level'), v('seq')]), 'dispatch'),
                note('ties go to the one that queued first (smaller seq)'),
                when(
                  op('||', op('<', v('ki'), v('kb')), op('&&', op('==', v('ki'), v('kb')), op('<', at('seq', v('i')), at('seq', v('best'))))),
                  [set(v('best'), v('i'), 'dispatch')],
                  'dispatch',
                ),
              ],
            ),
          ],
          'dispatch',
        ),
      ],
    },
    { kind: 'return', expr: v('best'), phase: 'dispatch' },
  ],
};

const keyOf: IR['functions'][number] = {
  name: 'keyOf',
  params: [
    { name: 'policy', type: INT },
    { name: 'i', type: INT },
    { name: 'burst', type: LIST },
    { name: 'remain', type: LIST },
    { name: 'level', type: LIST },
    { name: 'seq', type: LIST },
  ],
  returnType: INT,
  body: [
    note('the only line that differs between policies: which number is the key'),
    when(op('==', v('policy'), n(0)), [{ kind: 'return', expr: at('seq', v('i')), phase: 'dispatch' }], 'dispatch'),
    when(op('==', v('policy'), n(1)), [{ kind: 'return', expr: at('burst', v('i')), phase: 'dispatch' }], 'dispatch'),
    when(op('==', v('policy'), n(2)), [{ kind: 'return', expr: at('remain', v('i')), phase: 'dispatch' }], 'dispatch'),
    { kind: 'return', expr: at('level', v('i')), phase: 'dispatch' },
  ],
};

export const schedulingPolicyImperativeIR: IR = {
  id: 'scheduling-policy-imperative',
  algorithm: 'schedulingPolicy',
  paradigm: 'imperative',
  functions: [schedule, pick, keyOf],
};

export const schedulingPolicyIRs: IR[] = [schedulingPolicyImperativeIR];
