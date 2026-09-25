/**
 * physical-layer projector — frame · line · read 이벤트를 stage 의 운동으로, phase 를 코드 패널로 옮긴다.
 *
 * 운동 길이는 그때그때 재생 속도로 셈한다 (걸음 1 의 선 옮김 0.6 초 · 나머지 0.35 초, 1 배속 기준).
 */
import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import { hexByte, type ByteKind, type PhysicalLayerStage } from './physical-layer-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

const MOVE_MS = 350;
const LINE_MS = 600;

function obj(p: unknown, what: string): Record<string, unknown> {
  if (!p || typeof p !== 'object') throw new Error(`physicalLayerProjector: ${what} payload 가 없다`);
  return p as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`physicalLayerProjector: ${key} 가 수가 아니다`);
  return v;
}

function nums(p: Record<string, unknown>, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number')) throw new Error(`physicalLayerProjector: ${key} 가 수 배열이 아니다`);
  return v as number[];
}

function kindsOf(p: Record<string, unknown>): ByteKind[] {
  const v = p.kinds;
  if (!Array.isArray(v)) throw new Error('physicalLayerProjector: kinds 가 배열이 아니다');
  return v.map((k) => {
    if (k === 'flag' || k === 'escape' || k === 'stuffed' || k === 'data') return k;
    throw new Error(`physicalLayerProjector: 모르는 바이트 종류 ${String(k)}`);
  });
}

function schemeName(t: Translate, scheme: number): string {
  if (scheme === 0) return t('label.nrz', 'NRZ');
  if (scheme === 1) return t('label.nrzi', 'NRZI');
  if (scheme === 2) return t('label.manchester', 'Manchester');
  throw new Error(`physicalLayerProjector: 모르는 부호 ${scheme}`);
}

export const physicalLayerProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as PhysicalLayerStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();
  const dur = (ms: number): number => {
    const s = runtime?.getSpeed() ?? 1;
    return s > 0 ? ms / s : ms;
  };

  return {
    onReset() {
      stage?.reset();
      code?.clearHighlight?.();
    },
    async onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = obj(e.payload, 'phase');
          const phase = p.phase;
          if (typeof phase !== 'string') throw new Error('physicalLayerProjector: phase 가 글이 아니다');
          code?.highlightPhase?.(phase);
          return;
        }
        case 'frame': {
          const p = obj(e.payload, 'frame');
          const wire = nums(p, 'wire');
          const stuffed = num(p, 'stuffed');
          stage?.setCaption(
            t('caption.stuff', 'Framed — wire bytes: {w} · escapes added: {s}', {
              w: wire.length,
              s: stuffed,
            }),
          );
          await stage?.showFrame(
            { data: nums(p, 'data'), wire, kinds: kindsOf(p), dataAt: nums(p, 'dataAt'), dataSpan: nums(p, 'dataSpan') },
            dur(MOVE_MS),
          );
          return;
        }
        case 'line': {
          const p = obj(e.payload, 'line');
          const lineScheme = num(p, 'scheme');
          const flatBits = num(p, 'flatBits');
          stage?.setCaption(
            t('caption.line', '{scheme} on the line — signal cells: {c} · transitions: {f} · longest flat: {b} bits', {
              scheme: schemeName(t, lineScheme),
              c: num(p, 'signalCells'),
              f: num(p, 'transitions'),
              b: flatBits,
            }),
          );
          await stage?.showLine(
            {
              half: nums(p, 'half'),
              cellsPerBit: num(p, 'cellsPerBit'),
              flatStart: num(p, 'flatStart'),
              flatHalf: num(p, 'flatHalf'),
              flatBits,
            },
            dur(LINE_MS),
          );
          return;
        }
        case 'read': {
          const p = obj(e.payload, 'read');
          const index = num(p, 'index');
          const byte = hexByte(num(p, 'byte'));
          const got = num(p, 'got');
          const recovered = nums(p, 'recovered');
          const branch = p.branch;
          const vars = { i: index + 1, byte };
          let text: string;
          if (branch === 'open-frame') text = t('caption.openFrame', 'Wire position {i}: {byte} — flag, the frame opens', vars);
          else if (branch === 'keep-byte') text = t('caption.keepByte', 'Wire position {i}: {byte} — kept as it is', vars);
          else if (branch === 'escape') text = t('caption.escape', 'Wire position {i}: {byte} — escape, the next byte gets restored', vars);
          else if (branch === 'restore-byte')
            text = t('caption.restoreByte', 'Wire position {i}: {byte} — restored and kept as {got}', { ...vars, got: hexByte(got) });
          else if (branch === 'close-frame')
            text = t('caption.closeFrame', 'Wire position {i}: {byte} — flag, the frame closes · recovered bytes: {n}', {
              ...vars,
              n: recovered.length,
            });
          else throw new Error(`physicalLayerProjector: 모르는 가지 ${String(branch)}`);
          stage?.setCaption(text);
          await stage?.showRead(
            { index, state: branch === 'close-frame' ? null : num(p, 'state'), recovered, sent: nums(p, 'sent'), closed: branch === 'close-frame' },
            dur(MOVE_MS),
          );
          return;
        }
        default:
          return;
      }
    },
  };
};
