/**
 * upgrade-then-keep-open 의 장면.
 *
 * 바탕 — 핸드셰이크 글자 · 틀의 짐 · 연결 수 · 바이트 합 · HTTP 판. initial 이 initialData 에서
 *        알고리즘과 같은 readUpgradeData · planUpgrade 로 세운다
 * 자취 — 연결 위로 지나간 메시지들, 지금 연결이 따르는 규칙, 수 셋 (연결 · HTTP 요청 · 메시지)
 * 이번 걸음 — 방금 지나간 메시지 하나
 *
 * 셈(바이트 · 머리 · 방향 · 수)은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { planUpgrade, readUpgradeData } from './algorithm.js';

export type Dir = 'c2s' | 's2c';

export type SentMessage = {
  kind: 'request' | 'response' | 'frame';
  dir: Dir;
  /** 틀 머리 바이트. 핸드셰이크는 0 */
  head: number;
  /** 짐 바이트. 핸드셰이크는 메시지 전체 */
  body: number;
  /** 글자 (번역하지 않는 자료) */
  lines: string[];
  /** 머물러 강조할 줄 번호. 없으면 -1 */
  mark: number;
};

export type UpgradeStep =
  | { kind: 'request'; bytes: number; header: string }
  | { kind: 'switch'; bytes: number; status: string; proto: string }
  | { kind: 'frame'; dir: Dir; head: number; body: number; bytes: number };

export type UpgradeScene = {
  // 바탕
  requestLines: string[];
  responseLines: string[];
  framePayloads: string[];
  connections: number;
  totalBytes: number;
  version: string;
  // 자취
  proto: string;
  httpRequests: number;
  messages: number;
  openBytes: number;
  headSum: number;
  sent: SentMessage[];
  // 이번 걸음
  step: UpgradeStep | null;
};

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number') throw new Error(`장면: ${what} 가 수가 아니다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`장면: ${what} 가 글자가 아니다`);
  return v;
}

function dirOf(v: unknown): Dir {
  if (v === 'c2s' || v === 's2c') return v;
  throw new Error(`장면: 모르는 방향 ${String(v)}`);
}

export const upgradeThenKeepOpenScene: ScenePlan<UpgradeScene> = {
  initial(initialData: unknown): UpgradeScene {
    // 바탕은 알고리즘과 같은 함수로 셈한다 — 두 자리에서 따로 세지 않는다
    const data = readUpgradeData(initialData);
    const plan = planUpgrade(data);
    return {
      requestLines: [...data.request],
      responseLines: [...data.response],
      framePayloads: plan.frames.map((f) => f.payload),
      connections: plan.connections,
      totalBytes: plan.totalBytes,
      version: plan.version,
      proto: '',
      httpRequests: 0,
      messages: 0,
      openBytes: 0,
      headSum: 0,
      sent: [],
      step: null,
    };
  },

  reduce(scene: UpgradeScene, event: FacetRuntimeEvent): UpgradeScene {
    const p = rec(event.payload);
    switch (event.type) {
      case 'request': {
        const bytes = num(p.bytes, 'bytes');
        return {
          ...scene,
          httpRequests: num(p.httpRequests, 'httpRequests'),
          openBytes: num(p.openBytes, 'openBytes'),
          sent: [
            ...scene.sent,
            {
              kind: 'request',
              dir: 'c2s',
              head: 0,
              body: bytes,
              lines: [...scene.requestLines],
              mark: num(p.upgradeLine, 'upgradeLine'),
            },
          ],
          step: { kind: 'request', bytes, header: str(p.header, 'header') },
        };
      }
      case 'switch': {
        const bytes = num(p.bytes, 'bytes');
        const proto = str(p.proto, 'proto');
        return {
          ...scene,
          proto,
          openBytes: num(p.openBytes, 'openBytes'),
          sent: [
            ...scene.sent,
            {
              kind: 'response',
              dir: 's2c',
              head: 0,
              body: bytes,
              lines: [...scene.responseLines],
              mark: 0,
            },
          ],
          step: { kind: 'switch', bytes, status: str(p.status, 'status'), proto },
        };
      }
      case 'frame': {
        const index = num(p.index, 'index');
        const text = scene.framePayloads[index];
        if (text === undefined) throw new Error(`장면: 틀 ${index} 의 짐이 없다`);
        const dir = dirOf(p.dir);
        const head = num(p.head, 'head');
        const body = num(p.body, 'body');
        return {
          ...scene,
          messages: num(p.messages, 'messages'),
          httpRequests: num(p.httpRequests, 'httpRequests'),
          headSum: num(p.headSum, 'headSum'),
          sent: [...scene.sent, { kind: 'frame', dir, head, body, lines: [text], mark: -1 }],
          step: { kind: 'frame', dir, head, body, bytes: num(p.bytes, 'bytes') },
        };
      }
      default:
        throw new Error(`장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
