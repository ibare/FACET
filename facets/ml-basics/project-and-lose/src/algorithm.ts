/**
 * projectAndLose — 이미 찾아 놓은 축에 점을 수직으로 내려 찍는다.
 *
 * ── 싣는 것이 하나도 없다
 *
 * 축은 선언에 적혀 있고(`axisAngleDeg`), **축이 정해지면 내려 찍는 셈은 순수 함수**다.
 * 그래서 축 위로 내린 발도 · 잃은 거리도 · 축이 담은 몫도 · 가장 멀리 떨어진 점도 ·
 * 몇 무리째 떨어졌나도 전부 바탕에서 곧바로 나온다. 셈은 여기 한 군데 두고
 * `projectOnAxis` 로 내주어 장면이 같은 함수를 부르게 한다 — 두 자리에서 세면
 * 그림과 결론이 갈린다 (프로토콜 4 절, `scene.ts` 머리).
 *
 * 걸음이 나르는 것은 **차례**뿐이라 payload 가 하나도 없다.
 *
 * ── 이벤트 (`done` 만 표준, 나머지는 이 facet 고유. C2)
 *
 *   scene-ready   {}  점이 서고 축이 가운데에서 양쪽으로 자란다.
 *   drop          {}  한 무리가 축까지 수직으로 떨어진다. 어느 점들인지는 `projectOnAxis`
 *                     의 `waves` 가 말하고, 몇 무리째인지는 올 때마다 하나씩 쌓이므로
 *                     장면이 센다.
 *   residual-mark {}  가장 멀리 떨어진 하나를 짚는다. 어느 점인지도 그 거리도 파생값이다.
 *   collapse      {}  흔적을 지운다. 축이 담은 몫과 잃은 몫이 자로 남는다.
 *   ambiguity     {}  짚은 점의 축 위 자리 하나가 어느 원래 자리에서 와도 같다는 것.
 *   done          {}
 *   rewind        {}  되감기. 자동 재생을 마친 뒤 `advance` 를 누르면 화면을 처음으로
 *                     되돌린다.
 *
 * silent 는 하나도 쓰지 않는다 — 모든 걸음이 시각 변화를 낸다.
 *
 * ── 걸음의 순서
 *
 * 떨어지는 순서는 데이터가 정한다. 축 위 자리(`along`) 순으로 세운 뒤 앞에서부터
 * 셋씩 끊어 네 무리로 만든다 — 왼쪽 끝에서 오른쪽 끝으로 쓸어 가는 순서다.
 * 손으로 적은 걸음표가 아니다 (S-piece).
 *
 * 메트릭은 없다 (조각이므로 `ctx.metric` 을 부르지 않는다 — S-piece).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 한 걸음에 함께 떨어지는 점의 수. */
export const PROJECT_WAVE = 3;

export type ProjectAndLoseData = {
  type: string;
  /** 점 열둘. 각 줄이 [x, y]. */
  points: number[][];
  /** 내려 찍을 축의 기울기(도). 축은 점들의 무게중심을 지난다. */
  axisAngleDeg: number;
  /** 걸음 사이의 간격. 읽을 시간을 주는 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 점 하나를 축에 내려 찍은 결과. 데이터 좌표다 — 화면 자리는 stage 가 역산한다. */
export type ProjectionShot = {
  index: number;
  /** 축 위 자리 (무게중심에서 잰 부호 있는 거리) — 남는 것. */
  along: number;
  /** 축에서 벗어난 부호 있는 거리 — 잃는 것. */
  perp: number;
  footX: number;
  footY: number;
};

/** 내려 찍기가 통째로 낳는 것. 걸음도 화면도 결론도 전부 여기서 나온다. */
export type Projection = {
  /** 축이 지나는 자리 — 점들의 무게중심. */
  centerX: number;
  centerY: number;
  /** 축의 방향 (단위 벡터, 데이터 좌표). */
  ux: number;
  uy: number;
  /** 점 차례 그대로. `shots[i].index === i`. */
  shots: readonly ProjectionShot[];
  /** 한 걸음에 함께 떨어지는 묶음. 축 위 자리 순으로 세워 앞에서부터 끊는다. */
  waves: readonly (readonly number[])[];
  /** 가장 멀리 떨어진 점. */
  farthest: number;
  /** 그 거리와 떨어진 거리의 평균. */
  maxDist: number;
  meanDist: number;
  /** 축 방향 분산이 담은 몫과 직각 방향으로 잃은 몫 (백분율). */
  keepPct: number;
  losePct: number;
};

/**
 * 점들을 축에 내려 찍는다.
 *
 * **장면이 같은 함수를 부른다** — 화면의 흔적 길이와 캡션의 수와 자의 눈금이 한
 * 셈을 지나야 조각의 결론이 그림과 같은 자료에서 나온다 (프로토콜 4 절).
 * 축을 **찾는** 일은 여기 없다. 기울기는 선언에 적혀 있고, 그것이 정해지면
 * 내려 찍기는 순수 함수다.
 */
export function projectOnAxis(
  points: readonly (readonly number[])[],
  axisAngleDeg: number,
): Projection {
  const n = points.length;
  const centerX = points.reduce((acc, p) => acc + p[0], 0) / n;
  const centerY = points.reduce((acc, p) => acc + p[1], 0) / n;

  const rad = (axisAngleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);

  const shots: ProjectionShot[] = points.map((p, index) => {
    const dx = p[0] - centerX;
    const dy = p[1] - centerY;
    const along = dx * ux + dy * uy;
    const perp = -dx * uy + dy * ux;
    return { index, along, perp, footX: centerX + along * ux, footY: centerY + along * uy };
  });

  // 몫 = 축 방향 분산 / (축 방향 + 직각 방향). 같은 n 으로 나누므로 제곱합의 비와 같다.
  const alongSq = shots.reduce((acc, s) => acc + s.along * s.along, 0);
  const perpSq = shots.reduce((acc, s) => acc + s.perp * s.perp, 0);
  const total = alongSq + perpSq;
  const keepPct = total === 0 ? 100 : (alongSq / total) * 100;

  const meanDist = shots.reduce((acc, s) => acc + Math.abs(s.perp), 0) / n;
  const farthest = shots.reduce((acc, s) => (Math.abs(s.perp) > Math.abs(acc.perp) ? s : acc));

  // 떨어지는 차례는 축 위 자리가 정한다 — 왼쪽 끝에서 오른쪽 끝으로 쓸어 간다.
  const sweep = [...shots].sort((a, b) => a.along - b.along);
  const waves: number[][] = [];
  for (let i = 0; i < sweep.length; i += PROJECT_WAVE) {
    waves.push(sweep.slice(i, i + PROJECT_WAVE).map((s) => s.index));
  }

  return {
    centerX,
    centerY,
    ux,
    uy,
    shots,
    waves,
    farthest: farthest.index,
    maxDist: Math.abs(farthest.perp),
    meanDist,
    keepPct,
    losePct: 100 - keepPct,
  };
}

export const projectAndLoseAlgorithm = async (
  ctx: FacetContext<ProjectAndLoseData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<ProjectAndLoseData>;
  const { points, axisAngleDeg, stepMs } = ctx.data;
  if (points.length === 0) throw new Error('projectAndLose: initialData.points 가 비어 있다');

  const { waves } = projectOnAxis(points, axisAngleDeg);

  let manual = false;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  const gate = async (): Promise<boolean> => {
    if (rc.cancelled) return false;
    if (!manual) return rc.sleep(stepMs);
    for (;;) {
      if (rc.cancelled) return false;
      const input = await rc.waitForInput();
      if (input.type !== 'advance') continue;
      return !rc.cancelled;
    }
  };

  /** 한 회 재생. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  const play = async (): Promise<boolean> => {
    // 마운트 직후의 첫 걸음은 문을 지나지 않는다 — 문은 걸음 *사이*의 것이다 (S-piece).
    // 되감은 직후에도 이 emit 이 문 밖에 있어, 첫 `advance` 하나가 되감기와 첫
    // 걸음을 함께 낸다.
    await rc.emit({ type: 'scene-ready' });

    // 무리의 수는 데이터 순회의 결과다 — 손으로 적은 걸음표가 아니다 (S-piece).
    for (let w = 0; w < waves.length; w += 1) {
      if (!(await gate())) return false;
      await rc.emit({ type: 'drop' });
    }

    if (!(await gate())) return false;
    await rc.emit({ type: 'residual-mark' });

    if (!(await gate())) return false;
    await rc.emit({ type: 'collapse' });

    if (!(await gate())) return false;
    await rc.emit({ type: 'ambiguity' });

    if (!(await gate())) return false;
    await rc.emit({ type: 'done' });
    return true;
  };

  try {
    for (;;) {
      if (rc.cancelled) return;
      if (!(await play())) return;

      // 자동 재생이 끝났다. 여기부터는 눌러야 나아간다.
      manual = true;
      for (;;) {
        if (rc.cancelled) return;
        const input = await rc.waitForInput();
        if (input.type !== 'advance') continue;
        break;
      }
      if (rc.cancelled) return;
      await rc.emit({ type: 'rewind' });
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!rc.cancelled) throw err;
  }
};
