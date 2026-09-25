/**
 * store-and-forward 장면.
 *
 * 바탕 — 세 곳의 이름(자료)과 받는 서버가 닫힌 구간, 시간 띠의 끝. initialData 에서 베낀다.
 * 자취 — 지금 시각, 지금 맡은 곳, 맡은 구간들, 넘김 · 시도의 자국, 보내는 쪽이 떠난 시각, 우편함을 열었는지.
 * 이번 걸음 — step. 운동의 출발 시각(`was`)을 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 메일을 맡을 수 있는 곳 — 받는 서버(mx)에서는 받는 사람의 우편함이 맡는다 */
export type Place = 'sender' | 'relay' | 'mx';

export interface StoreAndForwardBase {
  sender: string;
  relay: string;
  mx: string;
  mailbox: string;
  reply: string;
  mxClosedFrom: number;
  mxClosedUntil: number;
  /** 시간 띠의 끝 (분) — 데이터의 시각 중 가장 늦은 것 */
  horizon: number;
}

/** 한 곳이 메일을 맡은 구간. to 가 null 이면 아직 맡고 있다 */
export interface Custody {
  place: Place;
  from: number;
  to: number | null;
}

/** 한 곳에서 다음 곳으로 넘겨 본 자국 */
export interface Link {
  t: number;
  from: Place;
  to: Place;
  ok: boolean;
}

export type StoreAndForwardStep =
  | { kind: 'ready' }
  | { kind: 'submit'; was: number; from: Place; to: Place }
  | { kind: 'fail'; was: number; n: number; next: number }
  | { kind: 'leave'; was: number }
  | { kind: 'deliver'; was: number; n: number; from: Place; to: Place; dwell: number }
  | { kind: 'open'; was: number; mails: number; offlineFor: number };

export interface StoreAndForwardScene {
  base: StoreAndForwardBase;
  now: number;
  holder: Place;
  custody: Custody[];
  links: Link[];
  senderLeftAt: number | null;
  opened: boolean;
  step: StoreAndForwardStep;
}

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`store-and-forward 장면: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`store-and-forward 장면: ${k} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string' || v === '') throw new Error(`store-and-forward 장면: ${k} 가 글자가 아니다`);
  return v;
}

function place(o: Record<string, unknown>, k: string): Place {
  const v = o[k];
  if (v === 'sender' || v === 'relay' || v === 'mx') return v;
  throw new Error(`store-and-forward 장면: ${k} 가 모르는 곳이다 (${String(v)})`);
}

export const storeAndForwardScene: ScenePlan<StoreAndForwardScene> = {
  initial(initialData: unknown): StoreAndForwardScene {
    const d = rec(initialData, 'initialData');
    const submitAt = num(d, 'submitAt');
    const horizon = Math.max(
      num(d, 'recipientOpensAt'),
      num(d, 'senderLeavesAt'),
      num(d, 'mxClosedUntil'),
      submitAt,
    );
    return {
      base: {
        sender: str(d, 'sender'),
        relay: str(d, 'relay'),
        mx: str(d, 'mx'),
        mailbox: str(d, 'mailbox'),
        reply: str(d, 'reply'),
        mxClosedFrom: num(d, 'mxClosedFrom'),
        mxClosedUntil: num(d, 'mxClosedUntil'),
        horizon,
      },
      now: submitAt,
      holder: 'sender',
      custody: [{ place: 'sender', from: submitAt, to: null }],
      links: [],
      senderLeftAt: null,
      opened: false,
      step: { kind: 'ready' },
    };
  },

  reduce(scene: StoreAndForwardScene, event: FacetRuntimeEvent): StoreAndForwardScene {
    const p = rec(event.payload, `${event.type} payload`);
    const t = num(p, 't');
    const was = scene.now;
    switch (event.type) {
      case 'submit':
      case 'delivered': {
        const from = place(p, 'from');
        const to = place(p, 'to');
        if (from !== scene.holder) {
          throw new Error(`store-and-forward 장면: ${from} 가 맡고 있지 않은 메일을 넘긴다`);
        }
        // 맡는 곳은 한 번에 하나 — 앞 곳의 구간을 닫고 다음 곳의 구간을 연다
        const custody = scene.custody.map((c) => (c.to === null ? { ...c, to: t } : { ...c }));
        custody.push({ place: to, from: t, to: null });
        const links = [...scene.links.map((l) => ({ ...l })), { t, from, to, ok: true }];
        const step: StoreAndForwardStep =
          event.type === 'submit'
            ? { kind: 'submit', was, from, to }
            : { kind: 'deliver', was, from, to, n: num(p, 'n'), dwell: num(p, 'dwell') };
        return { ...scene, now: t, holder: to, custody, links, step };
      }
      case 'attempt-failed':
        return {
          ...scene,
          now: t,
          custody: scene.custody.map((c) => ({ ...c })),
          links: [...scene.links.map((l) => ({ ...l })), { t, from: scene.holder, to: 'mx', ok: false }],
          step: { kind: 'fail', was, n: num(p, 'n'), next: num(p, 'next') },
        };
      case 'sender-left':
        return {
          ...scene,
          now: t,
          custody: scene.custody.map((c) => ({ ...c })),
          links: scene.links.map((l) => ({ ...l })),
          senderLeftAt: t,
          step: { kind: 'leave', was },
        };
      case 'mailbox-opened':
        return {
          ...scene,
          now: t,
          custody: scene.custody.map((c) => ({ ...c })),
          links: scene.links.map((l) => ({ ...l })),
          opened: true,
          step: { kind: 'open', was, mails: num(p, 'mails'), offlineFor: num(p, 'offlineFor') },
        };
      default:
        throw new Error(`store-and-forward 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
