/**
 * asymptotic 의 IR — 두 반의 비를 센다.
 *
 * ── 무엇을 IR 로 셈할지: 값이 아니라 비다
 *
 * **IR 은 여섯 언어로 번역되고 그중 셋(C++ · 자바 · C#)은 정수 폭이 유한하다.**
 * 중간값이 2,147,483,647 을 넘으면 그 셋에서만 답이 달라지고, 그러면 코드 패널이
 * 화면과 다른 수를 말한다. 비용을 그대로 셈하면 `2n²` 가 n = 1024 에서 2,097,152 라
 * 아직 천장 아래이긴 하나 **사다리를 한 칸만 늘려도 닿는다** (n = 2048 이면 8,388,608,
 * n = 32768 이면 21 억을 넘는다).
 *
 * 그래서 **값을 셈하지 않는다.** 세는 것은 비뿐이고, 비는 두 비용을 n 으로 나눠도
 * 그대로다 —
 *
 *     n²  ÷ n log₂n   =   n ÷ log₂n
 *     2n² ÷ n²        =   2n ÷ n
 *
 * 나눠 두면 가장 큰 중간값이 `2n` (= 2,048) 이라 천장에서 백만 배 아래이고, 사다리를
 * 아무리 늘려도 선형으로만 자란다. **벽을 비껴가는 것이 아니라 닿을 자리를 없앤다.**
 * 이 화면의 주 수치가 비이므로 주장과도 결이 맞는다.
 *
 * 곱셈(`*`)이 한 번도 나오지 않는다 — `2n` 은 `n + n` 으로 적는다. 남은 연산이 `+` ·
 * `-` · `/` 와 비교뿐이라 넘칠 자리가 **구조적으로** 없고, 그 사실을 테스트가 잠근다.
 * 뒷사람이 값을 셈하는 줄을 더하면 거기서 걸린다.
 *
 * ── 왜 전부 `double` 인가 (탐침으로 확인한 것)
 *
 * `log` 와 `floor` 는 **부동소수를 돌려준다.** 그 결과를 `int` 슬롯에 담으면 자바가
 * `int bits = Math.floor(...)` 를, C# 이 `int bits = Math.Floor(...)` 를 내는데
 * **둘 다 컴파일되지 않는다** (double → int 는 명시적 캐스트가 필요하다). C++ 은
 * 좁히기 경고와 함께 통과한다. 여섯 언어로 직접 emit 해 확인했다.
 *
 * 그래서 `log`/`floor` 가 닿는 자리는 모두 `double` 로 둔다. 그러면 여섯 다 성한
 * 코드가 나오고, 파이썬·JS·TS 의 emit 은 `int` 로 두었을 때와 글자까지 같다.
 * 저장소에 예약 수학 이름을 쓰는 IR 이 하나도 없어 선례가 없던 자리다.
 *
 * 정수 나눗셈 `//` 는 쓰지 않는다 — 피연산자가 `double` 이면 자바·C++·C# 이 `/` 로
 * 옮겨 실수 나눗셈이 되어 인터프리터의 내림과 갈린다. 내림이 필요한 자리는 `floor`
 * 하나로만 적는다.
 *
 * ── 반올림 규약
 *
 * 자릿값을 `floor(log(n)/log(2) + 0.5)` 로 **반올림**한다. 사다리가 전부 2 의
 * 거듭제곱이라 이 반올림은 근사가 아니라 정확하고, `algorithm.ts` 가 같은 규칙을
 * 쓴다. 그래야 코드 패널과 화면이 같은 수를 말한다.
 *
 * ── 화면과의 간극
 *
 * **없다.** 화면에 뜨는 수는 자릿값 · 두 낱개 수 · 그 차이 넷뿐이고 전부 아래 네
 * 함수가 내는 것과 같다. 비용 값은 화면도 IR 도 셈하지 않는다. 손잡이 다섯 자리
 * 전부에서 대조하는 것은 `test/asymptotic.test.ts` 다.
 *
 * ── 어휘
 *
 * `&&` 는 `ir-interpreter` 에서 짧은 회로가 아니라 오른쪽이 늘 셈해진다. 여기에는
 * 반복도 분기도 없어 그 어휘가 아예 나오지 않는다.
 *
 * phase 어휘는 `algorithm.ts` 와 집합이 완전히 일치해야 한다 (C3) —
 * `scale` · `cross` · `same` · `gap`.
 */

import type { IR, IRExpr, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
/** `log` · `floor` 가 닿는 자리는 전부 이것이다 — 위 주석의 까닭. */
const DBL: IRType = { kind: 'double' };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number): IRExpr => ({ kind: 'lit', value });
const call = (fn: string, ...args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });
const bin = (op: '+' | '-' | '/', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });

/** `floor(a / b)` — 온전히 몇 번 들어가는가. 남는 조각은 그림이 그린다. */
const fits = (big: IRExpr, small: IRExpr): IRExpr => call('floor', bin('/', big, small));

export const asymptoticImperativeIR: IR = {
  id: 'asymptotic-imperative',
  algorithm: 'asymptotic',
  paradigm: 'imperative',
  functions: [
    // ── 자릿값. n log₂n 의 로그 인자이고, n 이 천 배가 되는 동안 다섯 배만 자란다.
    {
      name: 'logTwo',
      params: [{ name: 'n', type: INT }],
      returnType: DBL,
      body: [
        {
          kind: 'comment',
          text: 'log is floating point, so round to the nearest whole digit count',
        },
        {
          kind: 'var',
          name: 'bits',
          type: DBL,
          init: call('floor', bin('+', bin('/', call('log', v('n')), call('log', lit(2))), lit(0.5))),
          phase: 'scale',
        },
        { kind: 'return', expr: v('bits') },
      ],
    },

    // ── 다른 반의 비. n² 안에 n log₂n 이 몇 번 들어가는가.
    {
      name: 'crossTiles',
      params: [{ name: 'n', type: INT }],
      returnType: DBL,
      body: [
        {
          kind: 'comment',
          text: 'divide both costs by n first, so no value ever grows past 2n',
        },
        // n² ÷ n
        { kind: 'var', name: 'bigPerN', type: DBL, init: v('n') },
        // n log₂n ÷ n
        { kind: 'var', name: 'smallPerN', type: DBL, init: call('logTwo', v('n')) },
        { kind: 'return', expr: fits(v('bigPerN'), v('smallPerN')), phase: 'cross' },
      ],
    },

    // ── 같은 반의 비. 2n² 안에 n² 이 몇 번 들어가는가. 같은 절차인데 n 이 사라진다.
    {
      name: 'sameTiles',
      params: [{ name: 'n', type: INT }],
      returnType: DBL,
      body: [
        {
          kind: 'comment',
          text: 'the same procedure, but here n cancels and the answer stops depending on it',
        },
        // 2n² ÷ n. 곱셈을 쓰지 않는다 — 트리에 `*` 가 없으면 넘칠 자리도 없다.
        { kind: 'var', name: 'bigPerN', type: DBL, init: bin('+', v('n'), v('n')) },
        // n² ÷ n
        { kind: 'var', name: 'smallPerN', type: DBL, init: v('n') },
        { kind: 'return', expr: fits(v('bigPerN'), v('smallPerN')), phase: 'same' },
      ],
    },

    // ── 두 반이 벌어진 정도. 작은 n 에서 0 이고, 0 인 동안은 반이 구별되지 않는다.
    {
      name: 'classGap',
      params: [{ name: 'n', type: INT }],
      returnType: DBL,
      body: [
        {
          kind: 'return',
          expr: bin('-', call('crossTiles', v('n')), call('sameTiles', v('n'))),
          phase: 'gap',
        },
      ],
    },
  ],
};

export const asymptoticIRs: IR[] = [asymptoticImperativeIR];
