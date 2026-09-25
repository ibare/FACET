/**
 * 입출력 방식 projector — algorithm 이벤트(round · setup · word · finish)를 stage 호출로 옮긴다.
 *
 * 운동의 길이는 재생 속도를 따라간다 — 부를 때마다 `runtime.getSpeed()` 를 읽는다. stage 호출을 await 해
 * 걸음 = 운동 + stepMs 가 되게 한다 (reactive 의 emit 은 projector 를 기다린다).
 * phase 는 없다 (IR · 코드 패널이 없다).
 */
import { makeTranslator, type ProjectorFactory, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import type { IoTransferModesStage, StageLost, StageMode, StagePlaneCell, StageRound } from './io-transfer-modes-stage.js';

/** 한 걸음의 운동 (ms, 속도 1 에서). stepMs 700 과 더해 걸음 1000ms. */
const MOTION_MS = 300;

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${key} 가 수가 아니다`);
  return v;
}

function numList(o: Record<string, unknown>, key: string): number[] {
  const v = o[key];
  if (!Array.isArray(v) || v.length === 0) throw new Error(`${key} 가 비었다`);
  return v.map((x) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`${key} 에 수가 아닌 값`);
    return x;
  });
}

function mode(v: unknown): StageMode {
  if (v === 'polling' || v === 'interrupt' || v === 'dma') return v;
  throw new Error(`모르는 방식: ${String(v)}`);
}

function modeList(o: Record<string, unknown>, key: string): StageMode[] {
  const v = o[key];
  if (!Array.isArray(v) || v.length === 0) throw new Error(`${key} 가 비었다`);
  return v.map(mode);
}

function lostOf(v: unknown, what: string): StageLost {
  const o = rec(v, what);
  return { polling: num(o, 'polling'), interrupt: num(o, 'interrupt'), dma: num(o, 'dma') };
}

function planeOf(v: unknown): StagePlaneCell[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error('plane 이 비었다');
  return v.map((c) => {
    const o = rec(c, 'plane 칸');
    return { words: num(o, 'words'), deviceTicks: num(o, 'deviceTicks'), lost: lostOf(o.lost, 'plane 칸의 lost'), winners: modeList(o, 'winners') };
  });
}

export const ioTransferModesProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);
  const stageOf = (): IoTransferModesStage => {
    const stage = views.stage as unknown as IoTransferModesStage | undefined;
    if (!stage) throw new Error('stage 가 없다');
    return stage;
  };
  const modeName = (m: StageMode): string =>
    m === 'polling' ? t('label.polling', 'Polling') : m === 'interrupt' ? t('label.interrupt', 'Interrupt') : t('label.dma', 'DMA');

  return {
    async onEvent(event: FacetRuntimeEvent) {
      const p = rec(event.payload ?? {}, `${event.type} payload`);
      switch (event.type) {
        case 'round': {
          const round: StageRound = {
            words: num(p, 'words'),
            deviceTicks: num(p, 'deviceTicks'),
            handlerTicks: num(p, 'handlerTicks'),
            setupTicks: num(p, 'setupTicks'),
            wordLadder: numList(p, 'wordLadder'),
            tickLadder: numList(p, 'tickLadder'),
            plane: planeOf(p.plane),
            target: lostOf(p.target, 'target'),
          };
          const stage = stageOf();
          stage.setCaption(
            t('caption.round.head', 'Words: {w} · ticks per word: {d}', { w: round.words, d: round.deviceTicks }),
            t('caption.round.detail', 'Each bar counts the ticks the CPU spends on I/O instead of its own work'),
          );
          await stage.showRound(round, motion());
          return;
        }
        case 'setup': {
          const stage = stageOf();
          stage.setCaption(t('caption.setup.head', 'DMA setup'), t('caption.setup.detail', 'The CPU writes the transfer into the controller'));
          await stage.addChunks(lostOf(p.add, 'add'), lostOf(p.lost, 'lost'), motion());
          return;
        }
        case 'word': {
          const stage = stageOf();
          stage.setCaption(
            t('caption.word.head', 'Word {i} / {w}', { i: num(p, 'index'), w: num(p, 'words') }),
            t('caption.word.detail', 'Polling asks until the word is ready · interrupt runs the handler · DMA: the controller moves it'),
          );
          await stage.addChunks(lostOf(p.add, 'add'), lostOf(p.lost, 'lost'), motion());
          return;
        }
        case 'finish': {
          const stage = stageOf();
          const winners = modeList(p, 'winners');
          stage.setCaption(
            t('caption.finish.head', 'DMA completion interrupt'),
            t('caption.finish.detail', 'Least lost: {names}', { names: winners.map(modeName).join(' · ') }),
          );
          await stage.addChunks(lostOf(p.add, 'add'), lostOf(p.lost, 'lost'), motion());
          await stage.showWinners(winners, motion());
          return;
        }
        default:
          return;
      }
    },
  };
};
