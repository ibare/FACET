/**
 * mvcc projector — 알고리즘 이벤트를 무대 메서드와 캡션으로 옮긴다.
 *
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 를 읽어 셈한다 (MOTION_MS / 속도).
 * payload 는 typeof 가드로 읽고, 빠진 값은 지어내지 않고 던진다.
 */
import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type { MvccStage, MvccStageVersion } from './mvcc-stage.js';

/** 걸음 안의 운동 길이 (사양: 운동 500 이하). */
const MOTION_MS = 480;

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

type Payload = Record<string, unknown>;

function asPayload(p: unknown, type: string): Payload {
  if (typeof p !== 'object' || p === null) throw new Error(`[mvcc] ${type} 이벤트에 payload 가 없다`);
  return p as Payload;
}

function num(p: Payload, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`[mvcc] payload.${key} 가 수가 아니다`);
  return v;
}

function str(p: Payload, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`[mvcc] payload.${key} 가 문자열이 아니다`);
  return v;
}

function bool(p: Payload, key: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`[mvcc] payload.${key} 가 참거짓이 아니다`);
  return v;
}

function versions(p: Payload): MvccStageVersion[] {
  const list = p.versions;
  if (!Array.isArray(list) || list.length === 0) throw new Error('[mvcc] payload.versions 가 비었다');
  return list.map((item: unknown) => {
    if (typeof item !== 'object' || item === null) throw new Error('[mvcc] 판의 모양이 아니다');
    const o = item as Record<string, unknown>;
    if (typeof o.value !== 'number' || typeof o.start !== 'number' || typeof o.end !== 'number') {
      throw new Error('[mvcc] 판의 값 · 시작 틱 · 끝 틱이 수가 아니다');
    }
    return { value: o.value, start: o.start, end: o.end };
  });
}

function modeLabel(t: Translate, mode: number): string {
  if (mode === 0) return t('label.perTransaction', 'Per transaction');
  if (mode === 1) return t('label.perStatement', 'Per statement');
  throw new Error(`[mvcc] 모르는 스냅샷 방식 ${mode}`);
}

export const mvccProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as MvccStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  let row: string | null = null;
  const motion = () => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    async onEvent(e) {
      const p = asPayload(e.payload, e.type);
      switch (e.type) {
        case 'phase': {
          codePanel?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round-start': {
          if (!stage) return;
          codePanel?.clearHighlight?.();
          const vs = versions(p);
          row = str(p, 'row');
          stage.setCaption(
            t('caption.start', '{row}={value} has one version. Snapshot: {mode} · {reader} starts at tick {begin}', {
              row: str(p, 'row'),
              value: vs[0].value,
              mode: modeLabel(t, num(p, 'mode')),
              reader: str(p, 'reader'),
              begin: num(p, 'begin'),
            }),
          );
          await stage.start({ row: str(p, 'row'), reader: str(p, 'reader'), versions: vs }, motion());
          return;
        }
        case 'commit': {
          if (!stage) return;
          if (row === null) throw new Error('[mvcc] 처음 걸음 없이 커밋이 왔다');
          stage.setCaption(
            t('caption.commit', 'Tick {tick} · {tx} commits {row}={value} — versions: {count}', {
              tick: num(p, 'tick'),
              tx: str(p, 'tx'),
              row,
              value: num(p, 'value'),
              count: num(p, 'count'),
            }),
          );
          await stage.commit({ versions: versions(p) }, motion());
          return;
        }
        case 'read': {
          if (!stage) return;
          const which = num(p, 'which');
          if (which !== 1 && which !== 2) throw new Error(`[mvcc] 읽기 차례 ${which} 를 모른다`);
          const held = bool(p, 'held');
          const vars = {
            tick: num(p, 'tick'),
            snap: num(p, 'snap'),
            value: num(p, 'value'),
            start: num(p, 'start'),
          };
          stage.setCaption(
            held
              ? t('caption.readHeld', 'Tick {tick} · read with snapshot {snap} → {value} (version from tick {start}); snapshot kept', vars)
              : t('caption.readReleased', 'Tick {tick} · read with snapshot {snap} → {value} (version from tick {start}); snapshot let go', vars),
          );
          await stage.read(
            { tick: vars.tick, which, snap: vars.snap, index: num(p, 'index'), value: vars.value, held },
            motion(),
          );
          return;
        }
        case 'vacuum': {
          if (!stage) return;
          const kept = p.kept;
          if (!Array.isArray(kept) || !kept.every((k) => typeof k === 'boolean')) {
            throw new Error('[mvcc] payload.kept 가 참거짓 목록이 아니다');
          }
          const oldest = num(p, 'oldest');
          const vars = { tick: num(p, 'tick'), oldest, count: num(p, 'count'), freed: num(p, 'freed') };
          stage.setCaption(
            oldest > 0
              ? t('caption.vacuumHeld', 'Tick {tick} · vacuum keeps what snapshot {oldest} can see — kept: {count}, freed: {freed}', vars)
              : t('caption.vacuumNone', 'Tick {tick} · vacuum, no snapshot held — kept: {count}, freed: {freed}', vars),
          );
          await stage.vacuum({ kept: kept as boolean[], versions: versions(p) }, motion());
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      codePanel?.clearHighlight?.();
    },
  };
};
