/**
 * semantic-versioning projector — 알고리즘 이벤트를 무대 메서드로 옮긴다.
 *
 * 운동 길이는 부를 때마다 `runtime.getSpeed()` 로 나눈다 — 속도를 올려도 걸음 경계를 넘지 않게.
 * payload 는 typeof 가드로 읽고, 없는 값은 지어내지 않고 던진다.
 */
import type { ProjectorFactory, ViewInstance } from '@ffacet/core/runtime';
import type {
  CompareView,
  InstallView,
  SemanticVersioningStage,
} from './semantic-versioning-stage.js';

type CodePanel = ViewInstance & {
  highlightPhase?: (phase: string | null) => void;
};

type Payload = Record<string, unknown>;

function record(v: unknown, where: string): Payload {
  if (typeof v !== 'object' || v === null) throw new Error(`semanticVersioningProjector: ${where} payload 가 없다`);
  return v as Payload;
}
function str(p: Payload, key: string, where: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`semanticVersioningProjector: ${where}.${key} 가 문자열이 아니다`);
  return v;
}
function num(p: Payload, key: string, where: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`semanticVersioningProjector: ${where}.${key} 가 수가 아니다`);
  return v;
}
function bool(p: Payload, key: string, where: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`semanticVersioningProjector: ${where}.${key} 가 참거짓이 아니다`);
  return v;
}
function nums(p: Payload, key: string, where: string): number[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number')) {
    throw new Error(`semanticVersioningProjector: ${where}.${key} 가 수 목록이 아니다`);
  }
  return v as number[];
}
function strs(p: Payload, key: string, where: string): string[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new Error(`semanticVersioningProjector: ${where}.${key} 가 글자 목록이 아니다`);
  }
  return v as string[];
}
function verdictOf(p: Payload, where: string): CompareView['verdict'] {
  const v = str(p, 'verdict', where);
  if (v === 'inside' || v === 'above' || v === 'below') return v;
  throw new Error(`semanticVersioningProjector: ${where}.verdict 모르는 값 — '${v}'`);
}
function reasonOf(p: Payload, where: string): InstallView['reason'] {
  const v = str(p, 'reason', where);
  if (v === 'accept' || v === 'reject' || v === 'lock') return v;
  throw new Error(`semanticVersioningProjector: ${where}.reason 모르는 값 — '${v}'`);
}

export const semanticVersioningProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SemanticVersioningStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let motionMs = 400;
  const ms = () => motionMs / Math.max(0.01, runtime ? runtime.getSpeed() : 1);

  const need = (): SemanticVersioningStage => {
    if (!stage) throw new Error('semanticVersioningProjector: stage 블록이 없다');
    return stage;
  };

  return {
    onInit(data) {
      const d = record(data, 'initialData');
      motionMs = num(d, 'motionMs', 'initialData');
    },
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = record(event.payload, 'phase');
          code?.highlightPhase?.(str(p, 'phase', 'phase'));
          return;
        }
        case 'axis': {
          const p = record(event.payload, 'axis');
          need().setAxis(strs(p, 'ticks', 'axis'));
          return;
        }
        case 'round': {
          const p = record(event.payload, 'round');
          const locked = bool(p, 'locked', 'round');
          const line = p['lockLine'];
          if (line !== null && typeof line !== 'string') {
            throw new Error('semanticVersioningProjector: round.lockLine 가 글자도 null 도 아니다');
          }
          // 판 머리 — 앞 판의 코드 강조를 끈다
          code?.highlightPhase?.(null);
          need().startRound(
            {
              packageName: str(p, 'packageName', 'round'),
              installed: str(p, 'installed', 'round'),
              installedTick: num(p, 'installedTick', 'round'),
              range: str(p, 'range', 'round'),
              locked,
              lockLine: line,
              digits: nums(p, 'digits', 'round'),
            },
            ms(),
          );
          return;
        }
        case 'bump': {
          const p = record(event.payload, 'bump');
          need().bump(
            {
              change: str(p, 'change', 'bump'),
              digit: num(p, 'digit', 'bump'),
              to: nums(p, 'to', 'bump'),
              tick: num(p, 'tick', 'bump'),
              zeroed: nums(p, 'zeroed', 'bump'),
            },
            ms(),
          );
          return;
        }
        case 'range': {
          const p = record(event.payload, 'range');
          need().showRange(
            {
              range: str(p, 'range', 'range'),
              lower: str(p, 'lower', 'range'),
              upper: str(p, 'upper', 'range'),
              lowerTick: num(p, 'lowerTick', 'range'),
              upperTick: num(p, 'upperTick', 'range'),
            },
            ms(),
          );
          return;
        }
        case 'lock': {
          const p = record(event.payload, 'lock');
          need().readLock({ line: str(p, 'line', 'lock'), tick: num(p, 'tick', 'lock') }, ms());
          return;
        }
        case 'compare': {
          const p = record(event.payload, 'compare');
          need().compare({ version: str(p, 'version', 'compare'), verdict: verdictOf(p, 'compare') }, ms());
          return;
        }
        case 'install': {
          const p = record(event.payload, 'install');
          need().install(
            {
              accepted: bool(p, 'accepted', 'install'),
              from: str(p, 'from', 'install'),
              to: str(p, 'to', 'install'),
              fromTick: num(p, 'fromTick', 'install'),
              toTick: num(p, 'toTick', 'install'),
              reason: reasonOf(p, 'install'),
            },
            ms(),
          );
          return;
        }
        default:
          throw new Error(`semanticVersioningProjector: 모르는 이벤트 — '${event.type}'`);
      }
    },
    onReset() {
      code?.highlightPhase?.(null);
    },
  };
};
