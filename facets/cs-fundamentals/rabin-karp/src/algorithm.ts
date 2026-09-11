/**
 * facet:rabinKarp — 굴린 값으로 **실제로 찾기까지** 간다.
 *
 * 조각 `facet:rollingHash` 는 창을 밀 때 해시를 다시 셈하지 않는 법에서 멈춘다.
 * 완제품은 그 굴린 값으로 찾기를 끝내고, 끝낸 값을 단순 방식과 나란히 놓는다.
 *
 * ── 주장 (손잡이 하나가 이것만 말한다)
 *
 *   패턴을 늘려도 **굴리는 쪽이 만지는 글자 수는 꿈쩍도 않는다.** 그 옆에서
 *   단순 견줌은 세 배가 된다.
 *
 *   만지는 글자가 2n 으로 고정되는 것은 우연이 아니라 항등식이다.
 *
 *     첫 창 m  +  구르기 2(n−m)  +  확인 m  =  2n
 *
 *   패턴이 길어지면 구르기가 `m + 2(n−m)` 로 줄고 확인이 `m` 으로 느는데, 그
 *   둘이 정확히 상쇄한다. 글 60 자에서 언제나 120 이다.
 *
 * ── 1차 데이터
 *
 *   text        되풀이 글 60 자 (`abab…`). **글의 결이 이 facet 의 급소다.**
 *               자연어에서는 단순 방식도 첫 글자에서 거의 다 어긋나 견줌이
 *               1.00× 로 붙박이라 아낄 것이 없다 (실측: 길이 2·6·10 에서 61·62·62).
 *               되풀이 글이라야 단순 방식이 창마다 끝까지 끌려간다.
 *   patternEnd  심어 둔 조각이 **끝나는** 자리. 찾는 조각은 여기서 왼쪽으로
 *               m 글자다. 그래야 손잡이를 밀어도 등장이 늘 한 건이다.
 *   radix / mod 자릿수의 밑과 법.
 *
 *   **법은 10⁶ 급으로 크게 두고 손잡이로 내놓지 않는다.** 조각의 법 1000 을
 *   그대로 쓰면 헛일치가 끼어들어 120 고정이 깨질 여지가 생긴다. 게다가 법을
 *   손잡이로 삼으면 화면이 거짓을 말한다 — 헛일치 수는 법의 크기가 아니라 법과
 *   밑의 산술 관계가 지배해서 단조가 아니다 (1차 실측: 31→39건, 61→10, 17→0,
 *   127→0). 그 손잡이를 없애는 것이 이 설계의 조건이다.
 *
 *   찾는 조각 · 해시 · 만진 글자 · 견준 글자는 전부 여기서 셈한다. 화면에 박아
 *   둔 수는 없다.
 *
 * ── 셈 (IR 과 글자 하나까지 같은 형태다. irs.ts 참조)
 *
 *   글자값   a=1 … z=26
 *   무게     weight = radix^(m-1) mod mod   ← 루프로 센다 (IR 에 pow 가 없다)
 *   창 해시  h = (((c₀·radix + c₁)·radix + c₂)… ) mod mod
 *   구르기   drop = (val(빠지는 글자)·weight) mod mod
 *            h ← ((h − drop) mod mod + mod) mod mod
 *            h ← (h·radix + val(들어오는 글자)) mod mod
 *
 *   **중간값이 32비트를 넘지 않는다.** 가장 큰 것이 `h·radix` = 1000002·31 ≈
 *   3.1×10⁷ 이라 정수 폭이 유한한 세 언어에서도 성하다. 그래서 `% 2147483648`
 *   같은 설명 없는 우회가 코드 패널에 뜰 일이 없다.
 *
 * ── 이벤트 (`done` 만 표준. 나머지는 이 facet 고유 — C2)
 *
 *   setup         { n, m, text, pattern, patternHash }      판을 새로 짓는다
 *   first-window  { start, hash, match, touched, naive }    첫 창 — 글자를 다 읽는다
 *   roll          { start, outIndex, outLetter, inIndex, inLetter,
 *                   hash, match, touched, naive }           창이 한 칸 구른다
 *   verify        { start, chars, ok, touched, naive }      해시가 같다 — 글자로 확인
 *   found         { start, touched, naive }                 글자까지 같았다
 *   contrast      { points: { m, rolled, naive }[], current }  손잡이 다섯의 대조
 *   done          { m, touched, naive, hits }
 *   phase         { phase }                                 silent: true
 *
 * ── phase 어휘 (irs.ts 와 집합이 완전히 일치한다 — C3)
 *
 *   'weight' | 'scan' | 'compare' | 'verify' | 'roll' | 'found'
 *
 * ── 메트릭 (facet.ts 의 metrics[].name 과 일치 — C5)
 *
 *   touch-count · compare-count · roll-count
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type RabinKarpData = {
  type: 'rabin-karp';
  /** 훑을 글. 되풀이 결이라야 주장이 선다 (머리말 참조). */
  text: string;
  /** 심어 둔 조각이 끝나는 자리. 찾는 조각은 여기서 왼쪽으로 m 글자. */
  patternEnd: number;
  /** 찾는 조각의 길이. 손잡이가 바꾼다. */
  patternLength: number;
  /** 자릿수의 밑. */
  radix: number;
  /** 법(modulus). 손잡이가 아니다 — 머리말의 까닭. */
  mod: number;
  /** 한 걸음의 길이 (ms). */
  stepMs: number;
};

/** 손잡이가 고를 수 있는 패턴 길이. 대조 도표의 가로축도 이것이다. */
export const RABIN_KARP_LENGTHS: readonly number[] = [2, 4, 6, 8, 10];

const DEFAULT_LENGTH = 6;

/** 'a' 가 1 이 되도록 하는 기준. */
const LETTER_ORIGIN = 'a'.charCodeAt(0) - 1;

export function letterValue(ch: string): number {
  return ch.charCodeAt(0) - LETTER_ORIGIN;
}

export function letterValues(s: string): number[] {
  return [...s].map(letterValue);
}

/** 처음부터 셈하는 창 해시. 찾는 조각과 첫 창에만 쓴다 (IR 의 `window_hash`). */
export function windowHash(
  values: readonly number[],
  at: number,
  m: number,
  radix: number,
  mod: number,
): number {
  let h = 0;
  for (let i = 0; i < m; i += 1) h = (h * radix + values[at + i]) % mod;
  return h;
}

/** 창의 맨 앞 글자에 곱해져 있는 무게 — radix^(m-1) mod mod. 루프로 센다. */
export function leadWeight(m: number, radix: number, mod: number): number {
  let w = 1;
  for (let i = 0; i < m - 1; i += 1) w = (w * radix) % mod;
  return w;
}

export function pickLength(value: unknown, fallback: number): number {
  return typeof value === 'number' && RABIN_KARP_LENGTHS.includes(value) ? value : fallback;
}

/** 찾는 조각 — 심어 둔 자리에서 왼쪽으로 m 글자. */
export function patternOf(text: string, patternEnd: number, m: number): string {
  return text.slice(patternEnd - m + 1, patternEnd + 1);
}

export type RabinKarpWindow = {
  start: number;
  hash: number;
  /** 해시가 찾는 조각과 같은가. */
  hashMatch: boolean;
  /** 글자까지 같은가. 해시가 같아도 여기서 갈릴 수 있다 (거짓 양성). */
  verified: boolean;
  /** 이 창에서 확인이 읽은 글자. 해시가 다르면 0. */
  verifyChars: number;
  /** 창이 만들어진 순간까지 굴리는 쪽이 만진 글자 (누적, 확인 전). */
  arrive: number;
  /** 확인까지 마친 뒤의 누적. */
  touched: number;
  /** 이 창의 자리까지 단순 방식이 견준 글자 (누적). */
  naive: number;
};

export type RabinKarpResult = {
  n: number;
  m: number;
  pattern: string;
  patternHash: number;
  weight: number;
  windows: RabinKarpWindow[];
  /** 굴리는 쪽이 만진 글자의 총합. 이 facet 의 주 수치다. */
  touched: number;
  /** 단순 방식이 견준 글자의 총합. */
  naive: number;
  rolls: number;
  /** 글자까지 같았던 자리의 수. 데이터가 1 을 보장한다. */
  hits: number;
  /** 해시가 같았던 자리의 수. hits 보다 크면 헛일치가 있었다는 뜻이다. */
  hashHits: number;
};

/** 한 자리에서 단순 방식이 견주는 글자 수 — 어긋나는 곳에서 멈춘다. */
function naiveAt(text: string, pattern: string, s: number): number {
  let c = 0;
  for (let j = 0; j < pattern.length; j += 1) {
    c += 1;
    if (text.charAt(s + j) !== pattern.charAt(j)) break;
  }
  return c;
}

/**
 * 한 판을 통째로 셈한다. 화면이 보이는 수는 전부 여기서 나온다.
 *
 * 굴리는 쪽은 **끝까지 훑는다** — 첫 등장에서 멈추지 않는다. 그래야 "글 전체를
 * 훑는 값이 얼마인가" 라는 물음이 성립하고, 2n 이 항등식이 된다. IR 도 같은
 * 이유로 등장 **횟수**를 돌려준다.
 */
export function computeRabinKarp(data: RabinKarpData): RabinKarpResult {
  const m = pickLength(data.patternLength, DEFAULT_LENGTH);
  const { text, radix, mod } = data;
  const n = text.length;
  const pattern = patternOf(text, data.patternEnd, m);
  const values = letterValues(text);
  const weight = leadWeight(m, radix, mod);
  const patternHash = windowHash(letterValues(pattern), 0, m, radix, mod);

  const windows: RabinKarpWindow[] = [];
  let h = windowHash(values, 0, m, radix, mod);
  // 첫 창만은 글자를 하나씩 다 읽는다 — 굴리기가 덜어 내려는 바로 그 값이다.
  let touched = m;
  let naive = 0;
  let rolls = 0;
  let hits = 0;
  let hashHits = 0;

  for (let start = 0; start + m <= n; start += 1) {
    naive += naiveAt(text, pattern, start);
    const arrive = touched;
    const hashMatch = h === patternHash;
    let verified = false;
    let verifyChars = 0;

    if (hashMatch) {
      hashHits += 1;
      // 해시가 같다고 글자가 같은 것은 아니다. 확인이 이 알고리즘의 일부다.
      let j = 0;
      while (j < m && text.charAt(start + j) === pattern.charAt(j)) j += 1;
      verified = j === m;
      verifyChars = verified ? m : j + 1;
      touched += verifyChars;
      if (verified) hits += 1;
    }

    windows.push({ start, hash: h, hashMatch, verified, verifyChars, arrive, touched, naive });

    if (start + m < n) {
      const drop = (values[start] * weight) % mod;
      h = (((h - drop) % mod) + mod) % mod;
      h = (h * radix + values[start + m]) % mod;
      rolls += 1;
      // 구르기가 만지는 글자는 둘 — 빠지는 하나와 들어오는 하나.
      touched += 2;
    }
  }

  return { n, m, pattern, patternHash, weight, windows, touched, naive, rolls, hits, hashHits };
}

export type RabinKarpPoint = { m: number; rolled: number; naive: number };

/** 손잡이 다섯 값의 대조. 손잡이와 무관한 고정값이라 한 번만 셈해 둔다. */
export function rabinKarpPoints(data: RabinKarpData): RabinKarpPoint[] {
  return RABIN_KARP_LENGTHS.map((m) => {
    const r = computeRabinKarp({ ...data, patternLength: m });
    return { m, rolled: r.touched, naive: r.naive };
  });
}

/** 손잡이가 보낸 입력에서 패턴 길이를 읽는다. 알아볼 수 없으면 null. */
function readLength(input: ReactiveInputEvent): number | null {
  const p = input.payload;
  if (typeof p !== 'object' || p === null) return null;
  const raw = (p as Record<string, unknown>).value;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) return null;
  return RABIN_KARP_LENGTHS.includes(value) ? value : null;
}

export const rabinKarpAlgorithm = async (raw: FacetContext<RabinKarpData>): Promise<void> => {
  const ctx = raw as ReactiveContext<RabinKarpData>;

  /**
   * `ctx.metric` 은 **더하는** 채널이라 값을 그대로 앉힐 수 없다. 지금 화면에
   * 걸린 값을 따로 들고 그 차이만 보낸다 — 손잡이를 밀어 다시 돌 때 수가 앞
   * 회차 위에 쌓이면 안 되기 때문이다.
   */
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const cur = shown.get(name) ?? 0;
    if (value === cur) return;
    ctx.metric(name, value - cur);
    shown.set(name, value);
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 대조는 손잡이와 무관하므로 한 번만 셈한다.
  const points = rabinKarpPoints(ctx.data);

  /** 한 판. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  const runOnce = async (): Promise<boolean> => {
    const data = ctx.data;
    const stepMs = data.stepMs;
    const r = computeRabinKarp(data);
    data.patternLength = r.m;

    setMetric('touch-count', 0);
    setMetric('compare-count', 0);
    setMetric('roll-count', 0);

    // 무게를 루프로 센다 — IR 에 pow 가 없고, 없는 것을 지어내지 않는다.
    await phase('weight');
    await ctx.emit({
      type: 'setup',
      payload: {
        n: r.n,
        m: r.m,
        text: data.text,
        pattern: r.pattern,
        patternHash: r.patternHash,
      },
    });
    if (!(await ctx.sleep(stepMs))) return false;

    for (let i = 0; i < r.windows.length; i += 1) {
      // 진입 검사 (C8). 이 루프의 문(gate)은 바디 중간의 `ctx.sleep` 이라 첫 줄
      // 면제에 들지 않는다 — 검사가 없으면 취소된 뒤에도 그 걸음의 emit 이
      // 먼저 나가는 창이 남는다.
      if (ctx.cancelled) return false;
      const w = r.windows[i];

      if (i === 0) {
        await phase('scan');
        await ctx.emit({
          type: 'first-window',
          payload: {
            start: w.start,
            hash: w.hash,
            match: w.hashMatch,
            touched: w.arrive,
            naive: w.naive,
          },
        });
      } else {
        const prev = r.windows[i - 1];
        const inIndex = w.start + r.m - 1;
        await phase('roll');
        await ctx.emit({
          type: 'roll',
          payload: {
            start: w.start,
            outIndex: prev.start,
            outLetter: data.text.charAt(prev.start),
            inIndex,
            inLetter: data.text.charAt(inIndex),
            hash: w.hash,
            match: w.hashMatch,
            touched: w.arrive,
            naive: w.naive,
          },
        });
        setMetric('roll-count', i);
      }

      setMetric('touch-count', w.arrive);
      setMetric('compare-count', w.naive);
      if (!(await ctx.sleep(stepMs))) return false;

      // 해시를 견주는 일은 창마다 일어난다 — 코드 패널의 그 줄이 여기다.
      await phase('compare');

      if (w.hashMatch) {
        await phase('verify');
        await ctx.emit({
          type: 'verify',
          payload: {
            start: w.start,
            chars: w.verifyChars,
            ok: w.verified,
            touched: w.touched,
            naive: w.naive,
          },
        });
        setMetric('touch-count', w.touched);
        if (!(await ctx.sleep(stepMs))) return false;

        if (w.verified) {
          await phase('found');
          await ctx.emit({
            type: 'found',
            payload: { start: w.start, touched: w.touched, naive: w.naive },
          });
          if (!(await ctx.sleep(stepMs))) return false;
        }
      }
    }

    setMetric('touch-count', r.touched);
    setMetric('compare-count', r.naive);
    setMetric('roll-count', r.rolls);

    await ctx.emit({ type: 'contrast', payload: { points, current: r.m } });
    if (!(await ctx.sleep(stepMs))) return false;

    await ctx.emit({
      type: 'done',
      payload: { m: r.m, touched: r.touched, naive: r.naive, hits: r.hits },
    });
    return true;
  };

  for (;;) {
    if (ctx.cancelled) return;
    if (!(await runOnce())) return;

    // 입력 대기. 여기서 재생·한 걸음이 꺼지고 되돌리기와 손잡이만 남는다.
    let next = ctx.data.patternLength;
    try {
      for (;;) {
        if (ctx.cancelled) return;
        const ev = await ctx.waitForInput();
        const v = readLength(ev);
        if (v !== null) {
          next = v;
          break;
        }
      }
    } catch (err) {
      // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
      // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
      if (!ctx.cancelled) throw err;
      return;
    }
    if (ctx.cancelled) return;
    ctx.data.patternLength = next;
  }
};
