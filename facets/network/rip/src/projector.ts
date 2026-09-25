/**
 * ripProjector — rip-start · rip-round 를 rip-stage 의 메서드로 옮긴다.
 * payload 는 typeof 로 읽고, 모르는 모양이면 던진다. 캡션 문안은 messages 의 키로만 조회한다.
 * 운동 길이 = payload.motionMs / 지금 재생 속도 (걸음마다 다시 읽는다).
 */
import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';
import type { RipStage, RipStageAdvert, RipStageRow } from './rip-stage';

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`ripProjector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`ripProjector: ${what} 가 수가 아니다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`ripProjector: ${what} 가 문자열이 아니다`);
  return v;
}

function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`ripProjector: ${what} 가 배열이 아니다`);
  return v;
}

function numOrNull(v: unknown, what: string): number | null {
  return v === null ? null : num(v, what);
}

function strOrNull(v: unknown, what: string): string | null {
  return v === null ? null : str(v, what);
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`ripProjector: ${what} 가 참거짓이 아니다`);
  return v;
}

function readRow(v: unknown): RipStageRow {
  const o = obj(v, 'row');
  return {
    router: str(o.router, 'row.router'),
    metric: numOrNull(o.metric, 'row.metric'),
    nextHop: strOrNull(o.nextHop, 'row.nextHop'),
    path: o.path === null ? null : arr(o.path, 'row.path').map((x) => str(x, 'row.path[]')),
    lsas:
      o.lsas === null
        ? null
        : arr(o.lsas, 'row.lsas').map((x) => {
            const l = obj(x, 'lsa');
            return { origin: str(l.origin, 'lsa.origin'), seq: num(l.seq, 'lsa.seq') };
          }),
    wrong: bool(o.wrong, 'row.wrong'),
    direct: bool(o.direct, 'row.direct'),
    unreachable: bool(o.unreachable, 'row.unreachable'),
  };
}

function readAdvert(v: unknown): RipStageAdvert {
  const o = obj(v, 'advert');
  const kind = str(o.kind, 'advert.kind');
  if (kind !== 'metric' && kind !== 'path' && kind !== 'withdraw' && kind !== 'lsa') {
    throw new Error(`ripProjector: 모르는 알림 ${kind}`);
  }
  const fate = str(o.fate, 'advert.fate');
  if (fate !== 'taken' && fate !== 'ignored' && fate !== 'dropped') throw new Error(`ripProjector: 모르는 처리 ${fate}`);
  return {
    from: str(o.from, 'advert.from'),
    to: str(o.to, 'advert.to'),
    kind,
    metric: numOrNull(o.metric, 'advert.metric'),
    path: o.path === null ? null : arr(o.path, 'advert.path').map((x) => str(x, 'advert.path[]')),
    origin: strOrNull(o.origin, 'advert.origin'),
    seq: numOrNull(o.seq, 'advert.seq'),
    fate,
  };
}

function readLinks(v: unknown): [string, string][] {
  return arr(v, 'cutLinks').map((l) => {
    const pair = arr(l, 'cutLinks[]');
    if (pair.length !== 2) throw new Error('ripProjector: 선은 두 끝이다');
    return [str(pair[0], 'link'), str(pair[1], 'link')] as [string, string];
  });
}

export const ripProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as RipStage | undefined;
  const t = runtime?.t ?? makeTranslator();
  const motion = (ms: number): number => ms / Math.max(0.01, runtime?.getSpeed() ?? 1);
  let dest = '';
  let net = '';
  let inf = 0;

  return {
    onInit(data) {
      const d = obj(data, 'initialData');
      dest = str(d.dest, 'dest');
      net = str(d.network, 'network');
      inf = num(d.unreachable, 'unreachable');
    },
    onEvent(e) {
      if (stage === undefined) return;
      if (e.type === 'rip-start') {
        const p = obj(e.payload, 'payload');
        const method = str(p.method, 'method');
        const cutLinks = readLinks(p.cutLinks);
        const table = arr(p.table, 'table').map(readRow);
        const wrong = num(p.wrongCount, 'wrongCount');
        stage.showStart(
          { method, cutLinks, table, totalRounds: num(p.totalRounds, 'totalRounds') },
          motion(num(p.motionMs, 'motionMs')),
        );
        const links = cutLinks.map(([a, b]) => `${a}–${b}`).join(' · ');
        let head: string;
        if (cutLinks.length === 0) {
          head =
            method === 'ls'
              ? t('caption.startScratchLs', 'Start: each router holds only its own advert')
              : t('caption.startScratch', 'Start: only router {dest} has a row for {net}', { dest, net });
        } else if (method === 'dv' || method === 'dv-sh') {
          head = t('caption.cutDv', 'Cut {links}: rows whose next hop lay across it jump to {inf}', { links, inf });
        } else if (method === 'pv') {
          head = t('caption.cutPv', 'Cut {links}: paths learned over it are removed and each end picks again', {
            links,
          });
        } else if (method === 'ls') {
          head = t('caption.cutLs', 'Cut {links}: both ends issue a new advert and recompute from their own map', {
            links,
          });
        } else {
          throw new Error(`ripProjector: 모르는 방식 ${method}`);
        }
        stage.setCaption([head, t('caption.wrong', 'Wrong tables: {n}', { n: wrong })]);
        return;
      }
      if (e.type === 'rip-round') {
        const p = obj(e.payload, 'payload');
        const method = str(p.method, 'method');
        const round = num(p.round, 'round');
        const adverts = arr(p.adverts, 'adverts').map(readAdvert);
        const heldBack = arr(p.heldBack, 'heldBack').map((h) => {
          const o = obj(h, 'heldBack[]');
          return { from: str(o.from, 'heldBack.from'), to: str(o.to, 'heldBack.to') };
        });
        const table = arr(p.table, 'table').map(readRow);
        const wrongCount = num(p.wrongCount, 'wrongCount');
        const sent = num(p.sent, 'sent');
        const taken = num(p.taken, 'taken');
        const dropped = num(p.dropped, 'dropped');
        const last = bool(p.last, 'last');
        const stop = p.stop === null ? null : str(p.stop, 'stop');
        stage.showRound(
          { method, round, adverts, heldBack, table, wrong: wrongCount > 0 },
          motion(num(p.motionMs, 'motionMs')),
        );
        let head: string;
        if (method === 'dv-sh') {
          head = t('caption.roundHeld', 'Round {n} · sent: {sent} · taken in: {taken} · held back: {held}', {
            n: round,
            sent,
            taken,
            held: heldBack.length,
          });
        } else if (method === 'pv' || method === 'ls') {
          head = t('caption.roundDropped', 'Round {n} · sent: {sent} · taken in: {taken} · discarded: {dropped}', {
            n: round,
            sent,
            taken,
            dropped,
          });
        } else {
          head = t('caption.round', 'Round {n} · sent: {sent} · taken in: {taken}', { n: round, sent, taken });
        }
        const lines = [head, t('caption.wrong', 'Wrong tables: {n}', { n: wrongCount })];
        if (last) {
          if (stop === 'unchanged') lines.push(t('caption.stopUnchanged', 'No table changed in round {n}: stop', { n: round }));
          else if (stop === 'no-copies') {
            lines.push(t('caption.stopNoCopies', 'Nothing left to forward after round {n}: stop', { n: round }));
          } else throw new Error('ripProjector: 마지막 라운드에 멈춘 까닭이 없다');
        }
        stage.setCaption(lines);
        return;
      }
    },
    onReset() {
      stage?.clear();
    },
  };
};
