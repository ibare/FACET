/**
 * boyerMoore — 뒤에서 견주고, 어긋난 글자가 얼마나 뛸지를 정한다.
 *
 * 손잡이 하나가 **패턴 길이**다. 나쁜 문자 규칙이 한 번에 미는 거리의 상한이 곧
 * 패턴 길이라, 패턴이 길어지면 평균 점프 거리가 구조적으로 커진다. 그것이 이
 * 화면이 조작으로 묻는 것이다.
 *
 * ── 1차 데이터
 *
 * 글 하나와 패턴 넷(길이 2·4·6·8)뿐이다. **나쁜 문자 표도 점프 거리도 안 본 글자
 * 수도 여기서 직접 셈한다** — 미리 적어 두면 데이터를 고칠 때 화면이 조용히
 * 거짓을 말하게 된다.
 *
 * 나쁜 문자 표는 **글자 코드로 색인하는 배열**로 편다. 맵으로 두면 IR 이 그것을
 * 따라 하지 못해(IR 어휘에 맵이 없다) 코드 패널과 화면이 다른 물건을 셈하게 된다.
 *
 * ── 이벤트 어휘 (C2 — 전부 이 facet 고유 확장)
 *
 * | type       | payload                                                        | silent |
 * |------------|----------------------------------------------------------------|--------|
 * | `phase`    | `{ phase: string }`                                              | O      |
 * | `run-init` | `{ text, pattern, patternLength, textLength }`                    | X      |
 * | `land`     | `{ at, step }`                                                   | X      |
 * | `probe`    | `{ at, j, textIndex, matched }`                                  | X      |
 * | `mismatch` | `{ at, j, textIndex, badChar, lastIndex, shift, matched }`        | X      |
 * | `slide`    | `{ from, to, shift, jumpCount, jumpSum }`                        | X      |
 * | `found`    | `{ at }`                                                         | X      |
 * | `verdict`  | `{ patternLength, jumpCount, jumpSum, compareCount, unread, textLength, foundAt }` | X |
 * | `done`     | 없음 (표준 어휘)                                                  | X      |
 *
 * `target` 은 쓰지 않는다. 짚는 자리가 글의 인덱스와 패턴의 인덱스 두 축으로
 * 정해져 `index:N` 하나로는 말이 되지 않는다 — payload 가 정규 경로다.
 *
 * `badChar` 는 화면 문안이 아니라 글의 글자 그 자체다. 캡션 문장은 projector 가
 * 키로 고른다 (C10).
 *
 * ── phase 어휘 (C3 — irs.ts 와 집합이 완전히 일치해야 한다)
 *
 * `table` · `compare` · `found` · `bad-char` · `shift`
 *
 * ── 메트릭 (C5 — facet.ts 의 metrics[].name 과 일치)
 *
 * `compare-count` · `jump-count` · `jump-sum` · `unread-count`
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BoyerMooreData = {
  type: 'boyer-moore';
  /** 훑을 글. 자연어 60~80자. */
  text: string;
  /** 길이 2·4·6·8 짜리 패턴 넷. 손잡이가 이 중 하나를 고른다. */
  patterns: string[];
  /** 손잡이의 처음 자리. 되돌리면 control-bar 가 슬라이더도 이 값으로 돌린다. */
  patternLength: number;
  /** 걸음 사이에 쉬는 시간. 읽을 틈을 주는 저작 결정이다. */
  stepMs: number;
};

/**
 * 나쁜 문자 표의 칸 수.
 *
 * 글자 코드를 그대로 색인으로 쓰므로 ASCII 한 폭이면 충분하다. IR 도 같은 모양의
 * 배열을 받는다 — 맵으로 두면 코드 패널이 이 셈을 못 따라 한다.
 */
export const BOYER_MOORE_ALPHABET = 128;

/**
 * 패턴의 각 글자가 패턴 안에서 **마지막으로 선 자리**. 없는 글자는 -1.
 *
 * 뒤쪽 글자가 앞쪽 글자를 덮어쓰므로 한 번 훑는 것으로 "마지막 자리" 가 된다.
 * 표를 만드는 일이 이 규칙의 절반이라 미리 적어 두지 않고 여기서 만든다.
 */
export function buildBadCharTable(pattern: string, size: number): number[] {
  const last = new Array<number>(size).fill(-1);
  for (let i = 0; i < pattern.length; i += 1) {
    const code = pattern.charCodeAt(i);
    if (code >= 0 && code < size) last[code] = i;
  }
  return last;
}

/** segmented-slider 가 보내는 payload 에서 고른 값을 꺼낸다 (C9). */
function segmentValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as Record<string, unknown>).value;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export const boyerMooreAlgorithm = async (
  ctx: FacetContext<BoyerMooreData>,
): Promise<void> => {
  const rctx = ctx as ReactiveContext<BoyerMooreData>;
  const data = ctx.data;
  const text = data.text;
  const n = text.length;
  const step = data.stepMs;

  let patternLength = data.patternLength;

  /**
   * 메트릭은 늘 **더해진다** (`ctx.metric` 이 누적기다). 그런데 손잡이를 밀 때마다
   * 처음부터 다시 훑으므로, 보이고 싶은 것은 누적이 아니라 이번 판의 값이다.
   * 그래서 지금 보이는 값을 기억해 두고 그 차이를 보낸다.
   */
  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, value - (shown[name] ?? 0));
    shown[name] = value;
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 손잡이가 고른 길이의 패턴. 없으면 첫 패턴으로 떨어진다. */
  const pickPattern = (len: number): string =>
    data.patterns.find((p) => p.length === len) ?? data.patterns[0];

  /** 한 판 — 글 위를 한 번 훑고 판정까지. 끝까지 갔으면 true. */
  const sweep = async (): Promise<boolean> => {
    const pattern = pickPattern(patternLength);
    const m = pattern.length;

    await phase('table');
    const last = buildBadCharTable(pattern, BOYER_MOORE_ALPHABET);

    await ctx.emit({
      type: 'run-init',
      payload: { text, pattern, patternLength: m, textLength: n },
    });
    setMetric('compare-count', 0);
    setMetric('jump-count', 0);
    setMetric('jump-sum', 0);
    setMetric('unread-count', n);
    if (!(await rctx.sleep(step))) return false;

    /** 한 번이라도 읽은 글자. IR 의 `seen` 배열과 같은 모양이다. */
    const seen = new Array<number>(n).fill(0);
    let compares = 0;
    let lookedCount = 0;
    let jumpCount = 0;
    let jumpSum = 0;
    let foundAt = -1;
    let at = 0;

    while (at + m <= n) {
      if (ctx.cancelled) return false;

      await ctx.emit({ type: 'land', payload: { at, step: jumpCount } });
      if (!(await rctx.sleep(step * 0.5))) return false;

      // 오른쪽 끝에서 왼쪽으로. 어긋나면 거기서 멈춘다.
      await phase('compare');
      let j = m - 1;
      let broke = false;
      while (j >= 0) {
        if (ctx.cancelled) return false;
        const ti = at + j;
        if (seen[ti] === 0) {
          seen[ti] = 1;
          lookedCount += 1;
        }
        compares += 1;
        const matched = pattern[j] === text[ti];
        await ctx.emit({ type: 'probe', payload: { at, j, textIndex: ti, matched } });
        setMetric('compare-count', compares);
        setMetric('unread-count', n - lookedCount);
        if (!(await rctx.sleep(step * 0.34))) return false;
        if (!matched) {
          broke = true;
          break;
        }
        j -= 1;
      }

      if (!broke) {
        await phase('found');
        foundAt = at;
        await ctx.emit({ type: 'found', payload: { at } });
        if (!(await rctx.sleep(step * 1.4))) return false;
        break;
      }

      // 어긋난 그 글자가 얼마나 뛸지를 정한다.
      await phase('bad-char');
      const badChar = text[at + j];
      const lastIndex = last[text.charCodeAt(at + j)] ?? -1;
      const shift = Math.max(j - lastIndex, 1);
      await ctx.emit({
        type: 'mismatch',
        payload: { at, j, textIndex: at + j, badChar, lastIndex, shift, matched: m - 1 - j },
      });
      if (!(await rctx.sleep(step * 1.1))) return false;

      await phase('shift');
      jumpCount += 1;
      jumpSum += shift;
      await ctx.emit({
        type: 'slide',
        payload: { from: at, to: at + shift, shift, jumpCount, jumpSum },
      });
      setMetric('jump-count', jumpCount);
      setMetric('jump-sum', jumpSum);
      if (!(await rctx.sleep(step * 0.6))) return false;
      at += shift;
    }

    await ctx.emit({
      type: 'verdict',
      payload: {
        patternLength: m,
        jumpCount,
        jumpSum,
        compareCount: compares,
        unread: n - lookedCount,
        textLength: n,
        foundAt,
      },
    });
    // 판정이 한 박자 머문 뒤에 "이제 기다린다" 로 넘어간다. 둘을 붙여 내보내면
    // 판정 문장이 같은 프레임에 덮여 아무도 읽지 못한다.
    if (!(await rctx.sleep(step * 4))) return false;
    await ctx.emit({ type: 'done' });
    return true;
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await sweep())) return;

      // 손잡이를 기다린다. 여기서 재생·한 걸음이 꺼지고 되돌리기와 위젯만 남는다.
      const ev = await rctx.waitForInput();
      if (ev.type === 'pattern-length') {
        const v = segmentValue(ev.payload);
        if (v !== null) patternLength = v;
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
};
