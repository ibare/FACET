/**
 * certificate-chain 의 장면 — 이벤트를 잇기만 한다. 찾기와 서명 셈은 알고리즘이 했다.
 *
 * 바탕  certs · bundle · store (initialData 에서 베낀다)
 * 자취  arrived · chain(확인을 마치고 오른 칸) · pending(찾았으나 아직 확인 전) · rejected(견주었으나 이름이 다른 것)
 *       · verdicts(서명 확인 결과) · trusted(멈춘 뿌리)
 * 이번 걸음  step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneCert = { id: string; subject: string; issuer: string | null };

export type ChainStep =
  | { kind: 'ready' }
  | { kind: 'receive'; count: number }
  | { kind: 'find'; from: string; to: string; issuer: string; where: 'bundle' | 'store'; looked: string[] }
  | { kind: 'verify'; lower: string; upper: string; ok: boolean }
  | { kind: 'anchor'; root: string; links: number };

export type ChainScene = {
  certs: SceneCert[];
  bundle: string[];
  store: string[];
  arrived: boolean;
  chain: string[];
  pending: { from: string; to: string } | null;
  rejected: string[];
  verdicts: { lower: string; ok: boolean }[];
  trusted: string | null;
  step: ChainStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function str(p: Record<string, unknown>, key: string, type: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`certificate-chain 장면: ${type}.${key} 가 문자열이 아니다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) throw new Error(`certificate-chain 장면: ${event.type} 에 payload 가 없다`);
  return event.payload;
}

export const certificateChainScene: ScenePlan<ChainScene> = {
  initial(initialData: unknown): ChainScene {
    if (!isRecord(initialData)) throw new Error('certificate-chain 장면: initialData 가 없다');
    const { certs, bundle, store } = initialData;
    if (!Array.isArray(certs) || !isStringArray(bundle) || !isStringArray(store)) {
      throw new Error('certificate-chain 장면: certs · bundle · store 모양이 다르다');
    }
    const copied: SceneCert[] = certs.map((c: unknown, i: number) => {
      if (!isRecord(c) || typeof c.id !== 'string' || typeof c.subject !== 'string') {
        throw new Error(`certificate-chain 장면: certs[${String(i)}] 모양이 다르다`);
      }
      return { id: c.id, subject: c.subject, issuer: typeof c.issuer === 'string' ? c.issuer : null };
    });
    return {
      certs: copied,
      bundle: [...bundle],
      store: [...store],
      arrived: false,
      chain: [],
      pending: null,
      rejected: [],
      verdicts: [],
      trusted: null,
      step: { kind: 'ready' },
    };
  },

  reduce(scene: ChainScene, event: FacetRuntimeEvent): ChainScene {
    if (event.type === 'receive') {
      const p = payloadOf(event);
      if (!isStringArray(p.bundle) || p.bundle.length === 0) {
        throw new Error('certificate-chain 장면: receive.bundle 이 비었다');
      }
      return {
        ...scene,
        arrived: true,
        chain: [p.bundle[0] as string],
        step: { kind: 'receive', count: p.bundle.length },
      };
    }
    if (event.type === 'find') {
      const p = payloadOf(event);
      const from = str(p, 'from', 'find');
      const to = str(p, 'to', 'find');
      const issuer = str(p, 'issuer', 'find');
      const where = p.where;
      if (where !== 'bundle' && where !== 'store') throw new Error('certificate-chain 장면: find.where 가 다르다');
      if (!isStringArray(p.looked)) throw new Error('certificate-chain 장면: find.looked 가 다르다');
      const looked = [...p.looked];
      const missed = looked.filter((id) => id !== to && !scene.rejected.includes(id));
      return {
        ...scene,
        pending: { from, to },
        rejected: [...scene.rejected, ...missed],
        step: { kind: 'find', from, to, issuer, where, looked },
      };
    }
    if (event.type === 'verify') {
      const p = payloadOf(event);
      const lower = str(p, 'lower', 'verify');
      const upper = str(p, 'upper', 'verify');
      if (typeof p.ok !== 'boolean') throw new Error('certificate-chain 장면: verify.ok 가 없다');
      const ok = p.ok;
      return {
        ...scene,
        chain: ok ? [...scene.chain, upper] : [...scene.chain],
        pending: null,
        verdicts: [...scene.verdicts, { lower, ok }],
        step: { kind: 'verify', lower, upper, ok },
      };
    }
    if (event.type === 'anchor') {
      const p = payloadOf(event);
      const root = str(p, 'root', 'anchor');
      if (!isStringArray(p.chain)) throw new Error('certificate-chain 장면: anchor.chain 이 다르다');
      return { ...scene, trusted: root, step: { kind: 'anchor', root, links: p.chain.length } };
    }
    throw new Error(`certificate-chain 장면: 모르는 이벤트 ${event.type}`);
  },
};
