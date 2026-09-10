/**
 * projectAndLose — 이미 찾아 놓은 축에 점을 수직으로 내려 찍는다.
 *
 * ── 식별자
 *
 * `target` 을 쓰지 않는다. 한 걸음에 여러 점이 함께 떨어지고 **그 묶음 자체가
 * 걸음의 뜻**이라, 어느 점이 움직이는지는 payload 의 `indices` 가 정규 경로다
 * (`layer-discovered` 와 같은 짜임 — C1 · C2).
 *
 * ── 이벤트 (`done` 만 표준, 나머지는 이 facet 고유)
 *
 *   scene-ready   { centerX: number; centerY: number; angleDeg: number }
 *       축이 지나는 자리(점들의 무게중심)와 기울기(도). 점과 축이 선다.
 *   drop          { indices: number[]; footXs: number[]; footYs: number[] }
 *       한 무리가 축까지 수직으로 떨어진다. 세 배열은 길이가 같고 자리로 짝짓는다.
 *       foot 은 데이터 좌표에서의 착지점 — 화면 좌표로 옮기는 것은 stage 의 몫이다.
 *   residual-mark { index: number; maxDist: number; meanDist: number }
 *       가장 멀리 떨어진 점 하나와, 떨어진 거리의 요약(최대 · 평균).
 *   collapse      { keepPct: number; losePct: number }
 *       흔적을 지운다. 축 방향 분산이 담은 몫과 직각 방향으로 잃은 몫(백분율).
 *   ambiguity     { index: number }
 *       그 점의 축 위 자리 하나가 어느 원래 자리에서 와도 같다는 것.
 *   done          {}
 *   rewind        {}
 *       되감기. 자동 재생을 마친 뒤 `advance` 를 누르면 화면을 처음으로 되돌린다.
 *
 * silent 는 하나도 쓰지 않는다 — 모든 걸음이 시각 변화를 낸다.
 *
 * ── 걸음의 순서
 *
 * 떨어지는 순서는 데이터가 정한다. 축 위 자리(`along`) 순으로 세운 뒤 앞에서부터
 * 셋씩 끊어 네 무리로 만든다 — 왼쪽 끝에서 오른쪽 끝으로 쓸어 가는 순서다.
 * 손으로 적은 걸음표가 아니다 (S-piece).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 한 걸음에 함께 떨어지는 점의 수. */
const WAVE = 3;

export type ProjectAndLoseData = {
  type: string;
  /** 점 열둘. 각 줄이 [x, y]. */
  points: number[][];
  /** 내려 찍을 축의 기울기(도). 축은 점들의 무게중심을 지난다. */
  axisAngleDeg: number;
  /** 걸음 사이의 간격. 읽을 시간을 주는 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 점 하나를 축에 내려 찍은 결과. */
type Shot = {
  index: number;
  /** 축 위 자리 (무게중심에서 잰 부호 있는 거리) — 남는 것. */
  along: number;
  /** 축에서 벗어난 부호 있는 거리 — 잃는 것. */
  perp: number;
  footX: number;
  footY: number;
};

export const projectAndLoseAlgorithm = async (
  ctx: FacetContext<ProjectAndLoseData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<ProjectAndLoseData>;
  const { points, axisAngleDeg, stepMs } = ctx.data;
  const n = points.length;
  if (n === 0) throw new Error('projectAndLose: initialData.points 가 비어 있다');

  // 축이 지나는 자리 — 점들의 무게중심.
  const centerX = points.reduce((acc, p) => acc + p[0], 0) / n;
  const centerY = points.reduce((acc, p) => acc + p[1], 0) / n;

  const rad = (axisAngleDeg * Math.PI) / 180;
  const ux = Math.cos(rad);
  const uy = Math.sin(rad);

  const shots: Shot[] = points.map((p, index) => {
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
  const losePct = 100 - keepPct;

  const meanDist = shots.reduce((acc, s) => acc + Math.abs(s.perp), 0) / n;
  const farthest = shots.reduce((acc, s) => (Math.abs(s.perp) > Math.abs(acc.perp) ? s : acc));
  const sweep = [...shots].sort((a, b) => a.along - b.along);

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
    await rc.emit({
      type: 'scene-ready',
      payload: { centerX, centerY, angleDeg: axisAngleDeg },
    });

    for (let i = 0; i < sweep.length; i += WAVE) {
      if (!(await gate())) return false;
      const wave = sweep.slice(i, i + WAVE);
      await rc.emit({
        type: 'drop',
        payload: {
          indices: wave.map((s) => s.index),
          footXs: wave.map((s) => s.footX),
          footYs: wave.map((s) => s.footY),
        },
      });
    }

    if (!(await gate())) return false;
    await rc.emit({
      type: 'residual-mark',
      payload: { index: farthest.index, maxDist: Math.abs(farthest.perp), meanDist },
    });

    if (!(await gate())) return false;
    await rc.emit({ type: 'collapse', payload: { keepPct, losePct } });

    if (!(await gate())) return false;
    await rc.emit({ type: 'ambiguity', payload: { index: farthest.index } });

    if (!(await gate())) return false;
    await rc.emit({ type: 'done', payload: {} });
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
      await rc.emit({ type: 'rewind', payload: {} });
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 console.error 로 드러내게 둔다.
    if (!rc.cancelled) throw err;
  }
};
