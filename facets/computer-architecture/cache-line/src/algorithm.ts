/**
 * 캐시 라인 — 캐시는 바이트 하나가 아니라 **줄 단위**로 움직인다.
 *
 * 총 용량 128 바이트를 고정해 두고 라인 크기만 돌린다. 줄이 커지면 줄 수가
 * 줄고, 한 번 미스가 날 때 딸려 오는 이웃이 늘어난다. 같은 손잡이가 두 접근
 * 방식에서 전혀 다르게 듣는 것이 이 화면의 전부다.
 *
 *   이어 읽기    보폭 1 원소 — 데려온 이웃을 그 자리에서 다 쓴다.
 *   띄엄띄엄 읽기 보폭 4 원소 — 줄이 보폭을 덮을 만큼 넓어지기 전까지
 *                              데려온 이웃을 한 번도 안 쓰고 버린다.
 *
 * 사상은 직접 사상(direct-mapped) 이다. 줄 번호는 `주소 // 라인크기`, 자리는
 * `줄번호 % 줄수` 이며 그 자리에 다른 줄 번호가 앉아 있으면 미스다.
 *
 * ── 식별자
 *   index:<j>          j 번째 접근
 *   config             지금 걸린 라인 크기 설정
 *   summary:<track>    한 판이 끝난 뒤의 트랙별 집계
 *
 * ── 이벤트 (확장 포함, C2)
 *   state-changed  target 'config'
 *                  payload { lineSize, lineCount, elementsPerLine, elementBytes, accessCount }
 *   state-changed  target 'summary:<track>'
 *                  payload { track, misses, accessCount, rate }
 *   mark           target 'index:<j>'
 *                  payload { track, lineNo, lineIndex, byteOffset, hit }
 *   done           payload { textKey }  — 어느 판정 문안을 띄울지 **키만** 보낸다 (C10)
 *   phase          payload { phase }  silent: true
 *
 * ── phase 어휘 (C3 — irs.ts 의 집합과 정확히 같다)
 *   'line-count' | 'address' | 'line-no' | 'probe' | 'miss' | 'rate'
 *
 * ── 메트릭 (C5)
 *   access-count · sequential-miss-count · strided-miss-count · line-count
 */

import type {
  FacetContext,
  ReactiveContext,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';

export type CacheLineTrack = {
  /** 접근 방식의 식별자. 사람이 읽는 이름은 facet.ts 의 `label.*` 에 있다. */
  id: string;
  /** 보폭 — 몇 칸씩 건너뛰며 읽는가. */
  strideElements: number;
};

export type CacheLineData = {
  type: string;
  /** 캐시 총 용량. 라인이 커지면 줄 수가 줄어드는 까닭이 이 고정값이다. */
  totalBytes: number;
  elementBytes: number;
  /** 손잡이가 고를 수 있는 라인 크기 사다리. */
  lineSizes: number[];
  lineSize: number;
  accessCount: number;
  tracks: CacheLineTrack[];
  stepMs: number;
};

/**
 * 한 판의 끝.
 *
 * 취소와 "손잡이가 돌아갔다" 를 boolean 하나로 겹치지 않는다 — 겹치면 부르는
 * 쪽이 둘을 구별하지 못해 취소된 뒤에도 다음 판으로 넘어간다 (C8).
 */
type Round = 'finished' | 'changed' | 'cancelled';

/**
 * 미스율 — 백분율 정수.
 *
 * `irs.ts` 의 `missPercent` 와 같은 반올림이어야 한다. 거기는 실수 슬롯을 쓸 수
 * 없어 `(misses * 100 + accessCount // 2) // accessCount` 로 셈하는데, 그것이
 * 여기의 `Math.round` 와 같은 값을 낸다 (4/32 → 둘 다 13).
 */
export function cacheLineRate(misses: number, accessCount: number): number {
  if (accessCount <= 0) return 0;
  return Math.round((misses * 100) / accessCount);
}

/** 트랙 식별자 → 메트릭 이름. 이름은 리터럴로 남아 grep 에 잡힌다 (C5). */
function missMetricOf(trackId: string): string {
  return trackId === 'strided' ? 'strided-miss-count' : 'sequential-miss-count';
}

export async function cacheLineAlgorithm(
  ctxIn: FacetContext<CacheLineData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<CacheLineData>;
  const data = ctx.data;

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /**
   * 메트릭은 더하기만 할 수 있으므로 지금 보이는 값을 스스로 들고 차이만 보낸다.
   * 판이 바뀌면 0 으로 되돌려야 하는 수들이라 증분만으로는 표현되지 않는다.
   */
  const shown: Record<string, number> = {};
  const gauge = (name: string, value: number): void => {
    const prev = shown[name] ?? 0;
    if (value !== prev) ctx.metric(name, value - prev);
    shown[name] = value;
  };

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false. */
  const gate = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return ctx.sleep(data.stepMs);
  };

  /** 손잡이가 보낸 값이면 받아 적고 true. 그 밖의 입력은 false. */
  const applyInput = (input: ReactiveInputEvent): boolean => {
    if (input.type !== 'lineSize') return false;
    const p = input.payload as { value?: unknown } | undefined;
    if (typeof p?.value !== 'number') return false;
    const next = p.value;
    if (!Number.isFinite(next) || !data.lineSizes.includes(next)) return false;
    data.lineSize = next;
    return true;
  };

  const playRound = async (): Promise<Round> => {
    const lineSize = data.lineSize;
    const lineCount = Math.max(1, Math.floor(data.totalBytes / lineSize));
    const elementsPerLine = Math.max(1, Math.floor(lineSize / data.elementBytes));
    const accessCount = data.accessCount;
    const tracks = data.tracks;

    await phase('line-count');
    await ctx.emit({
      type: 'state-changed',
      target: 'config',
      payload: {
        lineSize,
        lineCount,
        elementsPerLine,
        elementBytes: data.elementBytes,
        accessCount,
      },
    });

    gauge('line-count', lineCount);
    gauge('access-count', 0);
    gauge('sequential-miss-count', 0);
    gauge('strided-miss-count', 0);

    // 줄 경계가 옮겨 가는 것을 한 박자 보고 나서 첫 접근으로 들어간다.
    if (!(await gate())) return 'cancelled';

    /** 트랙마다 자리별로 지금 앉아 있는 줄 번호. -1 은 빈자리. */
    const resident: number[][] = tracks.map(() =>
      new Array<number>(lineCount).fill(-1),
    );
    const misses: number[] = tracks.map(() => 0);

    for (let j = 0; j < accessCount; j += 1) {
      if (!(await gate())) return 'cancelled';
      const early = ctx.pollInput();
      if (early !== null && applyInput(early)) return 'changed';

      await phase('address');
      for (let t = 0; t < tracks.length; t += 1) {
        // 두 트랙이 한 걸음 안에서 나란히 발신된다 — 나란히 보이는 것이 이
        // 걸음의 뜻이라 사이에 문을 둘 수 없다. 그래서 검사를 직접 진다 (C8).
        if (ctx.cancelled) return 'cancelled';
        const track = tracks[t];
        const address = j * track.strideElements * data.elementBytes;

        await phase('line-no');
        const lineNo = Math.floor(address / lineSize);

        await phase('probe');
        const lineIndex = lineNo % lineCount;
        const hit = resident[t][lineIndex] === lineNo;

        if (!hit) {
          await phase('miss');
          resident[t][lineIndex] = lineNo;
          misses[t] += 1;
        }

        await ctx.emit({
          type: 'mark',
          target: `index:${j}`,
          payload: {
            track: track.id,
            lineNo,
            lineIndex,
            byteOffset: address % lineSize,
            hit,
          },
        });
        gauge(missMetricOf(track.id), misses[t]);
      }
      gauge('access-count', j + 1);
    }

    await phase('rate');
    for (let t = 0; t < tracks.length; t += 1) {
      // 판을 닫는 발신이라 사이에 문이 없다 — 위와 같은 까닭 (C8).
      if (ctx.cancelled) return 'cancelled';
      const track = tracks[t];
      await ctx.emit({
        type: 'state-changed',
        target: `summary:${track.id}`,
        payload: {
          track: track.id,
          misses: misses[t],
          accessCount,
          rate: cacheLineRate(misses[t], accessCount),
        },
      });
    }

    const rateOf = (id: string): number => {
      const i = tracks.findIndex((x) => x.id === id);
      return i < 0 ? 0 : cacheLineRate(misses[i], accessCount);
    };
    const seqRate = rateOf('sequential');
    const stridedRate = rateOf('strided');

    // 판정 문안은 표현 계층의 일이다. algorithm 은 **키만** 보낸다 (C10).
    let textKey = 'caption.seqOnly';
    if (seqRate >= 100 && stridedRate >= 100) textKey = 'caption.bothMiss';
    else if (stridedRate < 100) textKey = 'caption.bothMove';

    await ctx.emit({ type: 'done', payload: { textKey } });
    return 'finished';
  };

  /** 손잡이가 돌아갈 때까지 기다린다. 돌아갔으면 true, 취소됐으면 false. */
  const waitForHandle = async (): Promise<boolean> => {
    for (;;) {
      if (ctx.cancelled) return false;
      let input: ReactiveInputEvent;
      try {
        input = await ctx.waitForInput();
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
        // 올려 러너가 드러내게 둔다.
        if (!ctx.cancelled) throw err;
        return false;
      }
      if (ctx.cancelled) return false;
      if (applyInput(input)) return true;
    }
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const round = await playRound();
      if (round === 'cancelled') return;
      if (round === 'changed') continue;
      if (!(await waitForHandle())) return;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
}
