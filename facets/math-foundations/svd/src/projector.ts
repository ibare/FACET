/**
 * svd projector — board(silent) 와 stack-layer 를 무대 호출로 옮긴다.
 *
 * 판 머리의 payload(σ · 모든 L_j · A_j · 오차 · 같은 칸 · 잣대)를 그대로 쥐었다가, 걸음마다 그 걸음의 겹 L_j 와
 * A_{j−1} → A_j 를 무대에 넘긴다. 셈은 하지 않는다 — 수 표기(자릿수 · U+2212 빼기표)만 여기 한 곳에서 한다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type { SvdStage } from './svd-stage.js';

const SUB = ['₀', '₁', '₂', '₃', '₄', '₅', '₆'] as const;

/** 수 표기 — 반올림해 0 이면 부호를 떼고, 빼기표는 U+2212. */
export function formatFixed(v: number, digits: number): string {
  if (!Number.isFinite(v)) throw new Error(`svd: 표시할 수가 유한하지 않다 (${v})`);
  const s = v.toFixed(digits);
  if (/^-0(\.0+)?$/.test(s)) return s.slice(1);
  return s.replace('-', '−');
}

function sub(j: number): string {
  const s = SUB[j];
  if (s === undefined) throw new Error(`svd: 아래첨자 ${j} 가 0..6 밖이다`);
  return s;
}

type Board = {
  pictureId: string;
  keep: number;
  motionMs: number;
  cells: number[][];
  sigmas: number[];
  layers: number[][][];
  stacks: number[][][];
  cellScale: number;
  sigmaScale: number;
};

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}
function isGrid(v: unknown): v is number[][] {
  return Array.isArray(v) && v.every((row) => Array.isArray(row) && row.every(isNum));
}
function isGrids(v: unknown): v is number[][][] {
  return Array.isArray(v) && v.every(isGrid);
}

function readBoard(payload: unknown): Board {
  if (typeof payload !== 'object' || payload === null) throw new Error('svd: board payload 가 없다');
  const p = payload as Record<string, unknown>;
  const { pictureId, keep, motionMs, cells, sigmas, layers, stacks, cellScale, sigmaScale } = p;
  if (typeof pictureId !== 'string') throw new Error('svd: board.pictureId 가 문자열이 아니다');
  if (!isNum(keep) || !isNum(motionMs) || !isNum(cellScale) || !isNum(sigmaScale)) throw new Error('svd: board 의 수가 비었다');
  if (!isGrid(cells)) throw new Error('svd: board.cells 가 수의 표가 아니다');
  if (!Array.isArray(sigmas) || !sigmas.every(isNum) || sigmas.length !== 6) throw new Error('svd: board.sigmas 가 여섯 수가 아니다');
  if (!isGrids(layers) || layers.length !== 6) throw new Error('svd: board.layers 가 여섯 표가 아니다');
  if (!isGrids(stacks) || stacks.length !== 6) throw new Error('svd: board.stacks 가 여섯 표가 아니다');
  return { pictureId, keep, motionMs, cells, sigmas, layers, stacks, cellScale, sigmaScale };
}

function pictureName(t: Translate, id: string): string {
  switch (id) {
    case 'heart':
      return t('label.picture.heart', 'Heart');
    case 'plus':
      return t('label.picture.plus', 'Plus');
    case 'stairs':
      return t('label.picture.stairs', 'Stairs');
    case 'scatter':
      return t('label.picture.scatter', 'Scatter');
    default:
      throw new Error(`svd: 모르는 그림 ${id}`);
  }
}

export const svdProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SvdStage | undefined;
  if (!stage) throw new Error('svd: stage view 가 없다');
  const t = runtime?.t ?? makeTranslator();
  const speed = (): number => {
    const s = runtime ? runtime.getSpeed() : 1;
    if (!(s > 0)) throw new Error(`svd: 재생 속도 ${s} 가 양수가 아니다`);
    return s;
  };
  let board: Board | null = null;

  const onEvent = (event: FacetRuntimeEvent): void => {
    switch (event.type) {
      case 'board': {
        const b = readBoard(event.payload);
        board = b;
        const name = pictureName(t, b.pictureId);
        stage.setBoard({
          cells: b.cells,
          sigmas: b.sigmas,
          sigmaTexts: b.sigmas.map((s) => formatFixed(s, 2)),
          sigmaNames: b.sigmas.map((_, i) => `σ${sub(i + 1)}`),
          keep: b.keep,
          cellScale: b.cellScale,
          sigmaScale: b.sigmaScale,
          name,
          durationMs: b.motionMs / speed(),
        });
        stage.setCaption([t('caption.start', 'Start — original table {name} · six σ bars · the stacked table is an empty grid', { name })]);
        return;
      }
      case 'stack-layer': {
        if (!board) throw new Error('svd: 판 머리 전에 stack-layer 가 왔다');
        if (typeof event.payload !== 'object' || event.payload === null) throw new Error('svd: stack-layer payload 가 없다');
        const p = event.payload as Record<string, unknown>;
        const { layer, sigma, error, same, last, firstFull } = p;
        if (!isNum(layer) || !isNum(sigma) || !isNum(error) || !isNum(same) || typeof last !== 'boolean') {
          throw new Error('svd: stack-layer payload 모양이 어긋났다');
        }
        if (firstFull !== null && !isNum(firstFull)) throw new Error('svd: stack-layer.firstFull 이 수도 null 도 아니다');
        const j = layer;
        const layerCells = board.layers[j - 1];
        const to = board.stacks[j - 1];
        if (!layerCells || !to) throw new Error(`svd: 겹 ${j} 가 판 머리에 없다`);
        const from = j === 1 ? null : board.stacks[j - 2];
        if (from === undefined) throw new Error(`svd: 겹 ${j - 1} 가 판 머리에 없다`);
        const stackName = `A${sub(j)}`;
        stage.stackLayer({
          layer: j,
          layerName: `L${sub(j)}`,
          layerCells,
          from,
          to,
          stackName,
          durationMs: board.motionMs / speed(),
        });
        const lines = [
          t('caption.layer', 'Layer {j} ({sigmaName} {sigma}) → {stackName}', {
            j,
            sigmaName: `σ${sub(j)}`,
            sigma: formatFixed(sigma, 2),
            stackName,
          }),
          t('caption.readout', 'Error {error} % · Matching cells {same} / 42', { error: formatFixed(error, 1), same }),
        ];
        if (last) {
          lines.push(
            firstFull === null
              ? t('caption.end.none', 'End — no layer reached 42 / 42 by layer {k}', { k: j })
              : t('caption.end.full', 'End — first layer at 42 / 42: {first}', { first: firstFull }),
          );
        }
        stage.setCaption(lines);
        return;
      }
      default:
        throw new Error(`svd: 모르는 이벤트 ${event.type}`);
    }
  };

  return {
    onEvent,
    onReset() {
      board = null;
      stage.reset();
    },
  };
};
