/**
 * 복제와 CAP — projector. 알고리즘 이벤트를 무대 메서드와 캡션으로 옮긴다.
 * 운동 길이는 재생 속도를 따라간다 — 걸음마다 `runtime.getSpeed()` 를 다시 읽는다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { ReplicationStage } from './replication-stage.js';

/** 속도 1 에서 운동 길이 (ms). 사양 — 운동 500 이하. */
const MOTION_MS = 480;

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

type Shadow = { key: string; oldValue: number; newValue: number; nodes: string[] };

const num = (p: Record<string, unknown>, name: string): number => {
  const v = p[name];
  if (typeof v !== 'number') throw new Error(`payload.${name} 이 수가 아니다`);
  return v;
};
const bools = (p: Record<string, unknown>, name: string): boolean[] => {
  const v = p[name];
  if (!Array.isArray(v)) throw new Error(`payload.${name} 이 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'boolean') throw new Error(`payload.${name} 의 원소가 참거짓이 아니다`);
    return x;
  });
};
const nums = (p: Record<string, unknown>, name: string): number[] => {
  const v = p[name];
  if (!Array.isArray(v)) throw new Error(`payload.${name} 이 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number') throw new Error(`payload.${name} 의 원소가 수가 아니다`);
    return x;
  });
};
const strs = (p: Record<string, unknown>, name: string): string[] => {
  const v = p[name];
  if (!Array.isArray(v)) throw new Error(`payload.${name} 이 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`payload.${name} 의 원소가 글자가 아니다`);
    return x;
  });
};

export const replicationProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ReplicationStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const dur = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);
  let shadow: Shadow | null = null;

  const need = (): Shadow => {
    if (!shadow) throw new Error('초기 자료를 받지 못했다');
    return shadow;
  };
  const payloadOf = (e: FacetRuntimeEvent): Record<string, unknown> => {
    const p = e.payload;
    if (typeof p !== 'object' || p === null) throw new Error(`${e.type} 의 payload 가 없다`);
    return p as Record<string, unknown>;
  };

  return {
    onInit(data) {
      if (typeof data !== 'object' || data === null) throw new Error('초기 자료가 객체가 아니다');
      const d = data as Record<string, unknown>;
      const { key, oldValue, newValue, nodes } = d;
      if (typeof key !== 'string' || typeof oldValue !== 'number' || typeof newValue !== 'number') {
        throw new Error('초기 자료에 key · oldValue · newValue 가 없다');
      }
      if (!Array.isArray(nodes) || !nodes.every((x): x is string => typeof x === 'string')) throw new Error('초기 자료에 nodes 가 없다');
      shadow = { key, oldValue, newValue, nodes: [...nodes] };
    },

    async onEvent(e) {
      const p = payloadOf(e);
      switch (e.type) {
        case 'phase': {
          const ph = p.phase;
          if (typeof ph !== 'string') throw new Error('phase 이름이 없다');
          code?.highlightPhase?.(ph);
          return;
        }
      }
      // 여기서부터는 무대에 그리는 이벤트
      if (!stage) return;
      const s = need();
      const value = (v: number): string => `${s.key}=${v}`;
      switch (e.type) {
        case 'round-start': {
          const k = num(p, 'k');
          const reach = nums(p, 'reach');
          const cut = strs(p, 'cut');
          stage.setCaption(
            cut.length === 0
              ? t('caption.start', 'Start · every node holds {old} · followers to wait for: {k}', { old: value(s.oldValue), k })
              : t('caption.startSplit', 'Start · every node holds {old} · followers to wait for: {k} · cut off: {cut}', {
                  old: value(s.oldValue),
                  k,
                  cut: cut.join(' '),
                }),
          );
          await stage.startRound(reach, dur());
          return;
        }
        case 'write-arrive': {
          const ms = num(p, 'ms');
          stage.setCaption(
            t('caption.write', '{ms} ms · write {write} reaches the leader · reachable followers: {reach} · to wait for: {k}', {
              ms,
              write: value(s.newValue),
              reach: num(p, 'reachable'),
              k: num(p, 'k'),
            }),
          );
          await stage.writeArrive(ms, bools(p, 'holders'), nums(p, 'blocked'), dur());
          return;
        }
        case 'refuse': {
          const ms = num(p, 'ms');
          stage.setCaption(
            t('caption.refuse', '{ms} ms · reachable {reach} < wait for {k} · write refused, not logged', {
              ms,
              reach: num(p, 'reachable'),
              k: num(p, 'k'),
            }),
          );
          await stage.refuse(ms, dur());
          return;
        }
        case 'follower-write': {
          const ms = num(p, 'ms');
          const follower = num(p, 'follower');
          const node = s.nodes[follower + 1];
          if (node === undefined) throw new Error(`팔로워 색인 ${follower} 에 노드가 없다`);
          stage.setCaption(
            t('caption.arrive', '{ms} ms · written: {node} {write} · copies: {copies}', {
              ms,
              node,
              write: value(s.newValue),
              copies: num(p, 'copies'),
            }),
          );
          await stage.followerWrite(follower, ms, bools(p, 'holders'), dur());
          return;
        }
        case 'ok': {
          const ms = num(p, 'ms');
          stage.setCaption(t('caption.ok', '{ms} ms · OK goes back to the client · copies: {copies}', { ms, copies: num(p, 'copies') }));
          await stage.ok(ms, bools(p, 'holders'), dur());
          return;
        }
        case 'read': {
          const ms = num(p, 'ms');
          const which = p.which;
          if (which !== 'answer' && which !== 'late') throw new Error(`읽기 종류를 모른다: ${String(which)}`);
          const values = nums(p, 'values');
          stage.setCaption(
            t('caption.read', '{ms} ms · reads from followers: {count} · old values: {stale}', {
              ms,
              count: values.length,
              stale: num(p, 'staleCount'),
            }),
          );
          await stage.read(which, ms, values, bools(p, 'stale'), dur());
          return;
        }
        default:
          throw new Error(`모르는 이벤트: ${e.type}`);
      }
    },

    onReset() {
      stage?.reset();
      code?.clearHighlight?.();
    },
  };
};
