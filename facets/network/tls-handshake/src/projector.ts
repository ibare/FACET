/**
 * TLS 핸드셰이크 projector — 알고리즘 이벤트를 stage 운동과 캡션으로 옮긴다.
 *
 * 운동의 길이는 재생 속도를 따른다 — 이벤트마다 `runtime.getSpeed()` 를 다시 읽는다.
 * stage 의 운동 메서드는 운동이 끝나면 풀리고, projector 는 그것을 기다려 걸음이 운동 + stepMs 가 되게 한다.
 */
import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type Translate,
} from '@ffacet/core/runtime';
import type { ChainLinkView, TlsHandshakeStage } from './tls-handshake-stage.js';

/** 속도 1 에서 한 걸음의 운동 (ms). 사양의 운동 ≤ 700 */
const MOTION_MS = 650;

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

function fields(e: FacetRuntimeEvent): Record<string, unknown> {
  const p = e.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`tls-handshake: '${e.type}' 에 payload 가 없다`);
  return p as Record<string, unknown>;
}
function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`tls-handshake: payload.${key} 가 수가 아니다`);
  return v;
}
function flag(p: Record<string, unknown>, key: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`tls-handshake: payload.${key} 가 참/거짓이 아니다`);
  return v;
}
function strs(p: Record<string, unknown>, key: string): string[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`tls-handshake: payload.${key} 가 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`tls-handshake: payload.${key} 에 글자가 아닌 것이 있다`);
    return x;
  });
}
function links(p: Record<string, unknown>): ChainLinkView[] {
  const v = p.links;
  if (!Array.isArray(v)) throw new Error('tls-handshake: payload.links 가 목록이 아니다');
  return v.map((raw) => {
    if (typeof raw !== 'object' || raw === null) throw new Error('tls-handshake: 사슬 칸의 모양이 틀렸다');
    const l = raw as Record<string, unknown>;
    if (typeof l.subject !== 'string' || typeof l.issuer !== 'string') throw new Error('tls-handshake: 사슬 칸에 이름이 없다');
    return {
      subject: l.subject,
      issuer: l.issuer,
      decoded: num(l, 'decoded'),
      expected: num(l, 'expected'),
      holds: flag(l, 'holds'),
      fromStore: flag(l, 'fromStore'),
    };
  });
}

export const tlsHandshakeProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as TlsHandshakeStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();
  const ms = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);
  let middle = 0;

  return {
    async onEvent(e) {
      switch (e.type) {
        case 'phase': {
          const p = fields(e);
          if (typeof p.phase !== 'string') throw new Error('tls-handshake: phase 이름이 없다');
          code?.highlightPhase?.(p.phase);
          return;
        }
      }
      if (!stage) return;
      switch (e.type) {
        case 'round-start': {
          const p = fields(e);
          middle = num(p, 'middle');
          code?.clearHighlight?.();
          const vars = { a: num(p, 'a'), b: num(p, 'b'), m: num(p, 'm'), p: num(p, 'p'), g: num(p, 'g') };
          stage.caption(
            middle === 1
              ? t('caption.start.intercept', 'Secrets stay home: a {a} · b {b} · m {m}. Public: p {p} · g {g}', vars)
              : t('caption.start.listen', 'Secrets stay home: a {a} · b {b}. Public: p {p} · g {g}', vars),
          );
          await stage.reset(
            {
              middle,
              verify: num(p, 'verify'),
              p: vars.p,
              g: vars.g,
              a: vars.a,
              b: vars.b,
              m: vars.m,
              bundle: strs(p, 'bundle'),
              store: strs(p, 'store'),
            },
            ms(),
          );
          return;
        }
        case 'client-share': {
          const p = fields(e);
          const share = num(p, 'share');
          const intercepted = flag(p, 'intercepted');
          stage.caption(
            intercepted
              ? t('caption.clientShare.intercept', 'Client sends A {share}. The middle stops it on the line', { share })
              : t('caption.clientShare.listen', 'Client sends A {share}. A copy drops to the middle as it passes', { share }),
          );
          await stage.clientShare(share, intercepted, ms());
          return;
        }
        case 'middle-to-server': {
          const p = fields(e);
          const held = num(p, 'held');
          const sent = num(p, 'sent');
          stage.caption(t('caption.middleToServer', 'Middle keeps A {held} and sends its own M {sent} to the server', { held, sent }));
          await stage.middleToServer(held, sent, ms());
          return;
        }
        case 'server-share': {
          const p = fields(e);
          const share = num(p, 'share');
          const received = num(p, 'received');
          stage.caption(t('caption.serverShare', "Server makes B {share}. Value it received as the client's: {received}", { share, received }));
          await stage.serverShare(share, ms());
          return;
        }
        case 'server-sign': {
          const p = fields(e);
          const vars = { digest: num(p, 'digest'), signature: num(p, 'signature'), certs: num(p, 'certs') };
          const intercepted = flag(p, 'intercepted');
          stage.caption(
            intercepted
              ? t('caption.serverSign.intercept', 'Server signs digest {digest}: signature {signature}. B, {certs} certificates and the signature stop at the middle', vars)
              : t('caption.serverSign.listen', 'Server signs digest {digest}: signature {signature}. B, {certs} certificates and the signature pass the middle, which copies them', vars),
          );
          await stage.serverSign(vars.signature, num(p, 'share'), intercepted, ms());
          return;
        }
        case 'middle-to-client': {
          const p = fields(e);
          const vars = { held: num(p, 'held'), sent: num(p, 'sent'), signature: num(p, 'signature') };
          stage.caption(
            t('caption.middleToClient', 'Middle keeps B {held} and sends M {sent} to the client. Certificates and signature {signature} go through unchanged', vars),
          );
          await stage.middleToClient(vars.held, vars.sent, ms());
          return;
        }
        case 'chain-check': {
          const p = fields(e);
          const chain = links(p);
          const vars = { held: num(p, 'held'), total: chain.length };
          stage.caption(
            flag(p, 'ok')
              ? t('caption.chainCheck', 'Chain check: links that hold {held} / {total}', vars)
              : t('caption.chainBroken', 'Chain check: links that hold {held} / {total}. The client cuts the connection', vars),
          );
          await stage.chainCheck(chain, ms());
          return;
        }
        case 'sign-check': {
          const p = fields(e);
          const vars = { decoded: num(p, 'decoded'), expected: num(p, 'expected') };
          const ok = flag(p, 'ok');
          stage.caption(
            ok
              ? t('caption.signOk', "Signature opens to {decoded} · client's own digest {expected}. Match", vars)
              : t('caption.signAbort', "Signature opens to {decoded} · client's own digest {expected}. Mismatch: the client cuts the connection", vars),
          );
          await stage.signCheck(vars.decoded, vars.expected, ok, ms());
          return;
        }
        case 'client-key': {
          const key = num(fields(e), 'key');
          stage.caption(t('caption.clientKey', 'Client K: {key}', { key }));
          await stage.clientKey(key, ms());
          return;
        }
        case 'server-key': {
          const p = fields(e);
          const vars = { key: num(p, 'key'), other: num(p, 'other') };
          stage.caption(t('caption.serverKey', 'Server K: {key} · client K: {other}', vars));
          await stage.serverKey(vars.key, flag(p, 'same'), flag(p, 'open'), ms());
          return;
        }
        case 'middle-keys': {
          const p = fields(e);
          const vars = { withClient: num(p, 'withClient'), withServer: num(p, 'withServer') };
          stage.caption(t('caption.middleKeys', "Middle's K with the client: {withClient} · with the server: {withServer}", vars));
          await stage.middleKeys(vars.withClient, vars.withServer, flag(p, 'sameAsClient'), flag(p, 'sameAsServer'), ms());
          return;
        }
        default:
          throw new Error(`tls-handshake: 모르는 이벤트 '${e.type}'`);
      }
    },
    onReset() {
      code?.clearHighlight?.();
    },
  };
};
