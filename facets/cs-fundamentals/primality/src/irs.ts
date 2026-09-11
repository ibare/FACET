/**
 * 소수 판정 (반복형) 학습용 IR — 함수 하나.
 *
 * 표현 코드 (가짜코드. 실제 emit 은 transpiler 여섯이 언어별로 수행):
 *
 *   def is_prime(n):
 *       d = 2
 *       while d <= sqrt(n):        # phase: bound
 *           if n % d == 0:         # phase: test
 *               return 0           #   (phase 없음 — 아래 "불 꺼진 줄" 참조)
 *           d = d + 1              # phase: next
 *       return 1                   # phase: prime
 *
 * ── `d <= sqrt(n)` 인가 `d * d <= n` 인가
 *
 * **`sqrt` 로 쓴다.** 둘 다 IR 어휘 안에 있고(`sqrt` 는 예약 수학 이름 일곱 중
 * 하나다) 셈도 같지만, 코드 패널에서 읽히는 것이 다르다.
 *
 * 이 facet 이 하는 주장은 **"제곱근이 멈추는 자리다"** 하나다. `d <= sqrt(n)` 은
 * 그 주장을 글자 그대로 적는다 — 패널을 여섯 언어로 펼쳐 봐도 `math.sqrt` ·
 * `Math.sqrt` · `std::sqrt` · `Math.Sqrt` 로 **제곱근이라는 말이 그대로 보인다.**
 * `d * d <= n` 은 같은 말을 대수적으로 옮겨 적은 것이라, 읽는 사람이 그것을
 * 다시 √ 로 되돌려야 주장에 닿는다. 코드 패널을 다는 까닭이 "IR 하나가 여섯
 * 언어로 갈리는 것을 보이는 것" 이므로, 갈려 보여야 할 그 낱말을 숨기지 않는다.
 *
 * 실무에서는 `d * d <= n` 이 낫다 (부동소수를 아예 안 쓰고 매 바퀴 sqrt 를 다시
 * 부르지 않는다). 그 사정은 `description.ts` 가 말한다 — 화면이 보이는 것은
 * 주장이고, 최적화는 글의 몫이다.
 *
 * `algorithm.ts` 의 `examine` 도 **같은 식**(`d <= Math.sqrt(n)`)으로 돈다.
 * 둘이 갈리면 패널이 지금 도는 코드가 아닌 것을 보이게 된다. 손잡이 다섯 값
 * 전부에서 판정과 검사 횟수가 같다는 것을 `test/primality.test.ts` 가 IR 을
 * 실제로 돌려 잰다.
 *
 * ── `&&` 를 쓰지 않는다
 *
 * `ir-interpreter` 의 `&&` 는 **짧은 회로가 아니다.** 오른쪽이 늘 셈해지므로
 * `d * d <= n && n % d != 0` 꼴로 합치면 경계를 벗어난 뒤에도 오른쪽이 돈다.
 * 여기서는 나눗셈이라 터지지는 않지만, 같은 함정이 배열을 짚는 자리에서는
 * 터진다. `while` 의 경계와 `if` 의 판정을 **포개어** 갈라 두면 그 위험이 아예
 * 없고 코드 패널에서도 두 물음("아직 볼 자리인가" · "나누어떨어지는가")이
 * 따로 읽힌다.
 *
 * ── 불 꺼진 줄 — `return 0`
 *
 * 이 줄에는 phase 를 붙이지 않는다. 손잡이가 소수만 내주므로 algorithm 이 그
 * phase 를 영영 발신하지 않고, 붙이면 algorithm 에 없는 phase 가 irs 에만
 * 남아 dead phase 가 된다 (C3 MUST NOT).
 *
 * 그리고 그것이 이 화면에서 **보여 줄 것**이기도 하다. 재생 내내 이 줄에는 한
 * 번도 불이 들어오지 않는데, 불이 안 들어온다는 사실이 곧 n 이 소수라는 뜻이다.
 *
 * ── 1 과 0 을 돌려준다
 *
 * `bool` 이 아니라 `int` 다. 참/거짓 리터럴은 여섯 언어의 표기가 갈리는데
 * (`True` / `true`), 그 갈림은 이 facet 이 보이려는 갈림이 아니라 잡음이다.
 * 1 과 0 은 어느 언어에서나 같은 글자로 나온다.
 *
 * phase 어휘는 `algorithm.ts` 의 `phase(...)` 와 **글자 단위로** 같아야 한다 (C3):
 *
 *   'bound' | 'test' | 'next' | 'prime'
 */

import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const tInt: IRType = { kind: 'int' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (
  op: '+' | '-' | '*' | '/' | '//' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||',
  l: IRExpr,
  r: IRExpr,
): IRExpr => ({ kind: 'binop', op, l, r });

export const primalityImperativeIR: IR = {
  id: 'primality-imperative',
  algorithm: 'primality',
  paradigm: 'imperative',
  functions: [
    {
      name: 'is_prime',
      params: [{ name: 'n', type: tInt }],
      returnType: tInt,
      body: [
        { kind: 'var', name: 'd', type: tInt, init: lit(2) },
        {
          kind: 'while',
          phase: 'bound',
          cond: bin('<=', v('d'), call('sqrt', [v('n')])),
          body: [
            {
              kind: 'if',
              phase: 'test',
              cond: bin('==', bin('%', v('n'), v('d')), lit(0)),
              // 이 줄에는 phase 가 없다 — 소수에서는 닿지 않는 갈래다 (머리말).
              then: [{ kind: 'return', expr: lit(0) }],
            },
            {
              kind: 'assign',
              phase: 'next',
              target: v('d'),
              expr: bin('+', v('d'), lit(1)),
            },
          ] satisfies IRStmt[],
        },
        { kind: 'return', phase: 'prime', expr: lit(1) },
      ] satisfies IRStmt[],
    },
  ],
};

export const primalityIRs: IR[] = [primalityImperativeIR];
