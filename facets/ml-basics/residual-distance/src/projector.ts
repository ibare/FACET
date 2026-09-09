/**
 * 잔차 조각의 projector — 알고리즘의 발신을 stage 메서드 호출로 옮긴다.
 *
 * payload 는 `unknown` 이므로 받자마자 가드로 좁힌 정형 객체만 stage 로 넘긴다 (C9).
 * 캡션은 여기서 `tr` 로 해석해 문자열로 넘긴다 — 문안의 출처는 `FacetJson.messages`
 * 이고 코드에는 키와 en 원본만 남는다 (C10).
 *
 * 부호에 따라 캡션이 갈리는 것도 여기서 정한다. algorithm 은 잰 값만 보내고
 * 그것을 뭐라 부를지는 표현 계층의 몫이다 (원칙 1).
 */

import { makeTranslator, toIndexArray } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type ResidualScene = {
  slope: number;
  intercept: number;
  points: { x: number; y: number }[];
};

type ResidualStage = {
  setScene(scene: ResidualScene): void;
  setCaption(text: string): void;
  focusPoint(index: number): Promise<void>;
  probePerpendicular(index: number): Promise<void>;
  turnToVertical(index: number, predicted: number, residual: number): Promise<void>;
  dropResidual(index: number, predicted: number, residual: number): Promise<void>;
  markDone(): Promise<void>;
  rewind(): void;
};

type Measure = { predicted: number; residual: number };

function readScene(data: unknown): ResidualScene | null {
  const d = data as { slope?: unknown; intercept?: unknown; points?: unknown } | undefined;
  if (typeof d?.slope !== 'number' || typeof d.intercept !== 'number') return null;
  if (!Array.isArray(d.points)) return null;
  const points: { x: number; y: number }[] = [];
  for (const raw of d.points) {
    const p = raw as { x?: unknown; y?: unknown } | undefined;
    if (typeof p?.x !== 'number' || typeof p.y !== 'number') return null;
    points.push({ x: p.x, y: p.y });
  }
  return { slope: d.slope, intercept: d.intercept, points };
}

function readMeasure(payload: unknown): Measure | null {
  const p = payload as { predicted?: unknown; residual?: unknown } | undefined;
  if (typeof p?.predicted !== 'number' || typeof p.residual !== 'number') return null;
  return { predicted: p.predicted, residual: p.residual };
}

export const residualDistanceProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as ResidualStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const sceneCaption = (): string =>
    tr('caption.scene', 'A fixed line and the observed points.');
  const signCaption = (residual: number): string =>
    residual >= 0
      ? tr('caption.above', 'Above the line: the observation has more than predicted.')
      : tr('caption.below', 'Below the line: the observation falls short of the prediction.');

  return {
    onInit(initialData: unknown): void {
      const scene = readScene(initialData);
      if (stage === undefined || scene === null) return;
      stage.setScene(scene);
      stage.setCaption(sceneCaption());
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (stage === undefined) return;
      const index = toIndexArray(event.target)[0] ?? -1;

      switch (event.type) {
        case 'highlight': {
          if (index < 0) return;
          stage.setCaption(tr('caption.pick', 'One point. How far off is the line here?'));
          await stage.focusPoint(index);
          return;
        }
        case 'probe-perpendicular': {
          if (index < 0) return;
          stage.setCaption(
            tr('caption.perpendicular', 'The closest reach reads a right angle to the line.'),
          );
          await stage.probePerpendicular(index);
          return;
        }
        case 'probe-turn': {
          const m = readMeasure(event.payload);
          if (index < 0 || m === null) return;
          stage.setCaption(
            tr('caption.turn', 'But y is what we predict, so measure straight along y.'),
          );
          await stage.turnToVertical(index, m.predicted, m.residual);
          return;
        }
        case 'residual-drop': {
          const m = readMeasure(event.payload);
          if (index < 0 || m === null) return;
          stage.setCaption(signCaption(m.residual));
          await stage.dropResidual(index, m.predicted, m.residual);
          return;
        }
        case 'rewind': {
          stage.rewind();
          stage.setCaption(sceneCaption());
          return;
        }
        case 'done': {
          stage.setCaption(tr('caption.done', 'Length is how much, sign is which way.'));
          await stage.markDone();
          return;
        }
        default:
          // 이 조각은 위 여섯 가지만 발신한다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind();
    },
  };
};
