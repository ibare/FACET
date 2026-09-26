/**
 * vae projector — 알고리즘의 init · snapshot · phase 를 무대와 코드 패널로 옮긴다.
 *
 *   init      → 코드 강조를 끄고 무대를 새 판 걸음 0 으로 옮긴다 (앞 판의 결론을 걷는다)
 *   snapshot  → 무대를 이 판의 모습으로 옮긴다
 *   phase     → 코드 패널의 줄을 켠다
 *
 * payload 는 typeof 로 좁힌다 — 어긋나면 던진다.
 */
import type { ProjectorFactory, ViewInstance } from '@ffacet/core/runtime';
import type { StageBand, StageCells, StageGap, StageSnapshot, VaeStageInstance } from './vae-stage.js';

type CodePanel = ViewInstance & { highlightPhase(phase: string | null): void };

/** 운동 길이 (속도 1 에서). 걸음 1400ms 안에 들도록. */
const MOTION_MS = 500;

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`vae projector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`vae projector: ${what} 가 수가 아니다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`vae projector: ${what} 가 글이 아니다`);
  return v;
}

function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`vae projector: ${what} 가 목록이 아니다`);
  return v;
}

function nums(v: unknown, what: string): number[] {
  return list(v, what).map((x, i) => num(x, `${what}[${i}]`));
}

function readSnapshot(payload: unknown): StageSnapshot {
  const p = obj(payload, 'payload');
  const zr = nums(p.zRange, 'zRange');
  if (zr.length !== 2) throw new Error('vae projector: zRange 는 둘이어야 한다');
  const bands: StageBand[] = list(p.bands, 'bands').map((raw, i) => {
    const b = obj(raw, `bands[${i}]`);
    return {
      id: str(b.id, `bands[${i}].id`),
      mu: num(b.mu, `bands[${i}].mu`),
      sigma: num(b.sigma, `bands[${i}].sigma`),
      lo: num(b.lo, `bands[${i}].lo`),
      hi: num(b.hi, `bands[${i}].hi`),
    };
  });
  const gaps: StageGap[] = list(p.gaps, 'gaps').map((raw, i) => {
    const g = obj(raw, `gaps[${i}]`);
    if (typeof g.overlap !== 'boolean') throw new Error(`vae projector: gaps[${i}].overlap 가 불이 아니다`);
    return {
      left: str(g.left, `gaps[${i}].left`),
      right: str(g.right, `gaps[${i}].right`),
      gap: num(g.gap, `gaps[${i}].gap`),
      overlap: g.overlap,
    };
  });
  const cells: StageCells[] = list(p.cells, 'cells').map((raw, i) => {
    const c = obj(raw, `cells[${i}]`);
    return { id: str(c.id, `cells[${i}].id`), x: nums(c.x, `cells[${i}].x`), q: nums(c.q, `cells[${i}].q`) };
  });
  return {
    epoch: num(p.epoch, 'epoch'),
    beta: num(p.beta, 'beta'),
    zRange: [zr[0], zr[1]],
    bands,
    order: list(p.order, 'order').map((x, i) => str(x, `order[${i}]`)),
    gaps,
    overlapCount: num(p.overlapCount, 'overlapCount'),
    narrowestGap: num(p.narrowestGap, 'narrowestGap'),
    cells,
    recon: num(p.recon, 'recon'),
    kl: num(p.kl, 'kl'),
    sigmaMean: num(p.sigmaMean, 'sigmaMean'),
    muWidth: num(p.muWidth, 'muWidth'),
  };
}

export const vaeProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as VaeStageInstance | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  if (stage === undefined) throw new Error('vae projector: stage 가 없다');
  const motion = (): number => {
    // 러너 없이(검사에서) 만들면 속도 1 로 본다
    const speed = runtime === undefined ? 1 : runtime.getSpeed();
    if (!(speed > 0)) throw new Error(`vae projector: 재생 속도가 0 이하다 (${speed})`);
    return MOTION_MS / speed;
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'init': {
          code?.highlightPhase(null);
          stage.show(readSnapshot(event.payload), motion());
          return;
        }
        case 'snapshot': {
          stage.show(readSnapshot(event.payload), motion());
          return;
        }
        case 'phase': {
          const p = obj(event.payload, 'phase payload');
          code?.highlightPhase(str(p.phase, 'phase'));
          return;
        }
        default:
          throw new Error(`vae projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      code?.highlightPhase(null);
      stage.clear();
    },
  };
};
