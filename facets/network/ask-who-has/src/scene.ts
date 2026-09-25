/**
 * ask-who-has 장면.
 *
 * 바탕  — 호스트 목록 · 묻는 이 · 찾는 IP (initial 이 initialData 에서 베낀다. 걸음 0)
 * 자취  — 요청 프레임과 받은 곳 · 견줌의 판정 · 답 프레임과 보낸 곳 · 받은 곳 · 얻은 쌍
 * 이번 걸음 — `step`
 *
 * 셈(누가 받는가 · 누가 주인인가)은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readAskWhoHasData, type ArpFrame, type ArpHost } from './algorithm.js';

export type AskWhoHasStep = 'start' | 'request' | 'compare' | 'reply' | 'learn';

export type AskWhoHasVerdict = { id: string; owner: boolean };

export type AskWhoHasScene = {
  hosts: ArpHost[];
  asker: string;
  targetIp: string;
  request: ArpFrame | null;
  requestHeard: string[];
  verdicts: AskWhoHasVerdict[];
  reply: ArpFrame | null;
  replyFrom: string | null;
  replyHeard: string[];
  learned: { ip: string; mac: string; frames: number } | null;
  step: AskWhoHasStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readStrings(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`ask-who-has 장면: ${what} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`ask-who-has 장면: ${what} 에 문자열 아닌 것이 있다`);
    return x;
  });
}

function readFrame(v: unknown): ArpFrame {
  if (!isRecord(v)) throw new Error('ask-who-has 장면: frame 이 없다');
  const { ethDst, ethSrc, op, senderMac, senderIp, targetMac, targetIp } = v;
  if (
    typeof ethDst !== 'string' ||
    typeof ethSrc !== 'string' ||
    typeof op !== 'number' ||
    typeof senderMac !== 'string' ||
    typeof senderIp !== 'string' ||
    typeof targetMac !== 'string' ||
    typeof targetIp !== 'string'
  ) {
    throw new Error('ask-who-has 장면: frame 의 모양이 틀렸다');
  }
  return { ethDst, ethSrc, op, senderMac, senderIp, targetMac, targetIp };
}

export const askWhoHasScene: ScenePlan<AskWhoHasScene> = {
  initial(initialData: unknown): AskWhoHasScene {
    const data = readAskWhoHasData(initialData);
    return {
      hosts: data.hosts.map((h) => ({ ...h })),
      asker: data.asker,
      targetIp: data.targetIp,
      request: null,
      requestHeard: [],
      verdicts: [],
      reply: null,
      replyFrom: null,
      replyHeard: [],
      learned: null,
      step: 'start',
    };
  },

  reduce(scene: AskWhoHasScene, event: FacetRuntimeEvent): AskWhoHasScene {
    const p: unknown = event.payload;
    switch (event.type) {
      case 'request': {
        if (!isRecord(p)) throw new Error('ask-who-has 장면: request payload 가 없다');
        return {
          ...scene,
          request: readFrame(p.frame),
          requestHeard: readStrings(p.heard, 'heard'),
          step: 'request',
        };
      }
      case 'compare': {
        if (!isRecord(p) || !Array.isArray(p.verdicts)) {
          throw new Error('ask-who-has 장면: compare payload 에 verdicts 가 없다');
        }
        const verdicts = p.verdicts.map((v: unknown) => {
          if (!isRecord(v) || typeof v.id !== 'string' || typeof v.owner !== 'boolean') {
            throw new Error('ask-who-has 장면: verdict 의 모양이 틀렸다');
          }
          return { id: v.id, owner: v.owner };
        });
        return { ...scene, verdicts, step: 'compare' };
      }
      case 'reply': {
        if (!isRecord(p) || typeof p.from !== 'string') {
          throw new Error('ask-who-has 장면: reply payload 에 from 이 없다');
        }
        return {
          ...scene,
          reply: readFrame(p.frame),
          replyFrom: p.from,
          replyHeard: readStrings(p.heard, 'heard'),
          step: 'reply',
        };
      }
      case 'learn': {
        if (!isRecord(p) || typeof p.ip !== 'string' || typeof p.mac !== 'string' || typeof p.frames !== 'number') {
          throw new Error('ask-who-has 장면: learn payload 의 모양이 틀렸다');
        }
        return { ...scene, learned: { ip: p.ip, mac: p.mac, frames: p.frames }, step: 'learn' };
      }
      default:
        return scene;
    }
  },
};
