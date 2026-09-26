/**
 * certificate projector — 알고리즘 이벤트를 무대 메서드와 캡션으로 옮긴다.
 *
 * payload 는 typeof 가드로 읽는다. 모르는 이벤트 · 어긋난 모양은 던진다.
 * 운동 길이는 payload 의 motionMs 를 그때그때의 재생 속도로 나눈다.
 * 판 머리(init)에서 코드 패널을 끈다 — 준비 걸음에는 phase 가 없다.
 */
import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';
import type {
  CertCard,
  CertificateBegin,
  CertificateForge,
  CertificatePrepare,
  CertificateSign,
  CertificateStage,
  KeyCard,
} from './certificate-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

type Rec = Record<string, unknown>;

function rec(v: unknown, where: string): Rec {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`certificate projector: ${where} 가 객체가 아니다`);
  return v as Rec;
}
function int(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`certificate projector: ${where} 가 정수가 아니다`);
  return v;
}
function text(v: unknown, where: string): string {
  if (typeof v !== 'string') throw new Error(`certificate projector: ${where} 가 글자가 아니다`);
  return v;
}
function bool(v: unknown, where: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`certificate projector: ${where} 가 참거짓이 아니다`);
  return v;
}
function list(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`certificate projector: ${where} 가 목록이 아니다`);
  return v;
}
function cert(v: unknown, where: string): CertCard & { docNumber: number } {
  const o = rec(v, where);
  return {
    subject: text(o.subject, `${where}.subject`),
    n: int(o.n, `${where}.n`),
    e: int(o.e, `${where}.e`),
    h16: int(o.h16, `${where}.h16`),
    value: int(o.value, `${where}.value`),
    docNumber: int(o.docNumber, `${where}.docNumber`),
  };
}
function key(v: unknown, where: string): KeyCard {
  const o = rec(v, where);
  return { name: text(o.name, `${where}.name`), n: int(o.n, `${where}.n`), e: int(o.e, `${where}.e`), d: int(o.d, `${where}.d`) };
}
function nPair(v: unknown, where: string): { n: number; e: number } {
  const o = rec(v, where);
  return { n: int(o.n, `${where}.n`), e: int(o.e, `${where}.e`) };
}
const FORGERIES = ['multiply', 'pair', 'swap', 'fakeroot'] as const;
function forgeryOf(v: unknown): CertificatePrepare['forgery'] {
  const f = FORGERIES.find((x) => x === v);
  if (!f) throw new Error(`certificate projector: 모르는 위조 ${String(v)}`);
  return f;
}
const SLOTS = ['request0', 'request1', 'target'] as const;
function slotOf(v: unknown): CertificateSign['targets'][number] {
  const s = SLOTS.find((x) => x === v);
  if (!s) throw new Error(`certificate projector: 모르는 서명 자리 ${String(v)}`);
  return s;
}

export const certificateProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CertificateStage | undefined;
  if (!stage) throw new Error('certificate projector: stage view 가 없다');
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();
  const ms = (p: Rec) => int(p.motionMs, 'motionMs') / Math.max(0.01, runtime?.getSpeed() ?? 1);

  let signer: 'ca' | 'fakeRoot' | null = null;
  /** 이 판의 서명 대상 — 캡션이 화면에 뜬 수(문서 번호 또는 요약)로 말하게 */
  let mode: number | null = null;
  /** 저장소 걸음에서 받은 꾸러미 — 서명 확인 캡션이 그 서명 · 열쇠로 푼 셈을 보인다 */
  let sent: { signature: number; n: number; e: number } | null = null;

  const who = () => {
    if (signer === 'ca') return t('label.ca', 'CA');
    if (signer === 'fakeRoot') return t('label.fakeRoot', 'Fake root');
    throw new Error('certificate projector: 서명한 쪽이 아직 없다');
  };

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload, 'phase');
          code?.highlightPhase?.(text(p.phase, 'phase'));
          return;
        }
        case 'init': {
          const p = rec(event.payload, 'init');
          const tg = cert(p.target, 'target');
          const ca = key(p.ca, 'ca');
          const owner = rec(p.owner, 'owner');
          const mallory = rec(p.mallory, 'mallory');
          const store = rec(p.store, 'store');
          const begin: CertificateBegin = {
            signTarget: int(p.signTarget, 'signTarget'),
            ca,
            store: { name: text(store.name, 'store.name'), n: int(store.n, 'store.n'), e: int(store.e, 'store.e') },
            owner: { name: text(owner.name, 'owner.name'), n: int(owner.n, 'owner.n'), e: int(owner.e, 'owner.e') },
            mallory: { name: text(mallory.name, 'mallory.name'), n: int(mallory.n, 'mallory.n') },
            target: tg,
            triesMax: int(p.triesMax, 'triesMax'),
          };
          signer = null;
          sent = null;
          mode = begin.signTarget;
          code?.highlightPhase?.(null);
          stage.begin(begin);
          stage.caption(
            t('caption.start', 'Goal: the name {target} carrying the attacker key ({n}, {e})', {
              target: tg.subject,
              n: tg.n,
              e: tg.e,
            }),
          );
          return;
        }
        case 'prepared': {
          const p = rec(event.payload, 'prepared');
          const forgery = forgeryOf(p.forgery);
          const requests = list(p.requests, 'requests').map((r, i) => cert(r, `requests[${i}]`));
          const pairTarget = p.pairTarget === null ? null : cert(p.pairTarget, 'pairTarget');
          const pairValue = p.pairValue === null ? null : int(p.pairValue, 'pairValue');
          const fake = p.fake === null ? null : key(p.fake, 'fake');
          const tries = int(p.tries, 'tries');
          stage.prepare(
            { forgery, tries, triesMax: int(p.triesMax, 'triesMax'), requests, pairTarget, pairValue, fake },
            ms(p),
          );
          if (forgery === 'multiply') {
            const m = rec(p.multiply, 'multiply');
            const [a, b] = requests;
            if (!a || !b || requests.length !== 2) throw new Error('certificate projector: 곱하기인데 청한 인증서가 둘이 아니다');
            // 문서 그대로 판은 카드에 문서 번호가 보이고, 요약 판은 요약이 보인다 — 캡션은 화면에 뜬 수로만 말한다
            if (mode === 0) {
              stage.caption(
                t('caption.multiply', 'Multiply: after {tries} tries, {a} × {b} mod {n} = {x}', {
                  tries,
                  a: int(m.aNumber, 'aNumber'),
                  b: int(m.bNumber, 'bNumber'),
                  n: int(m.modulus, 'modulus'),
                  x: int(m.targetNumber, 'targetNumber'),
                }),
              );
            } else {
              stage.caption(
                t('caption.multiplyDigest', 'Multiply: after {tries} tries, e {ea} · e {eb} (by document number); digests {da} × {db} mod {n} = {p}', {
                  tries,
                  ea: int(m.aE, 'aE'),
                  eb: int(m.bE, 'bE'),
                  da: a.value,
                  db: b.value,
                  n: int(m.modulus, 'modulus'),
                  p: int(m.valueProduct, 'valueProduct'),
                }),
              );
            }
          } else if (forgery === 'pair') {
            const harmless = requests[0];
            if (!harmless) throw new Error('certificate projector: 짝 찾기에 무해 인증서가 없다');
            if (pairTarget && pairValue !== null) {
              stage.caption(
                t('caption.pair', 'Colliding pair after {tries} certificates: e {e1} and e {e2} both give {v}', {
                  tries,
                  e1: harmless.e,
                  e2: pairTarget.e,
                  v: pairValue,
                }),
              );
            } else {
              stage.caption(
                t('caption.pairNone', 'No colliding pair in {tries} certificates: the attacker keeps only e {e}', {
                  tries,
                  e: harmless.e,
                }),
              );
            }
          } else if (forgery === 'swap') {
            const own = requests[0];
            if (!own) throw new Error('certificate projector: 주인 인증서가 없다');
            stage.caption(
              t('caption.swap', 'Key swap: the owner asks the CA for {name} ({n}, {e})', { name: own.subject, n: own.n, e: own.e }),
            );
          } else {
            if (!fake) throw new Error('certificate projector: 가짜 뿌리가 없다');
            stage.caption(
              t('caption.fakeroot', 'Fake root: the attacker sets up its own {name} with key ({n}, {e})', {
                name: fake.name,
                n: fake.n,
                e: fake.e,
              }),
            );
          }
          return;
        }
        case 'signed': {
          const p = rec(event.payload, 'signed');
          const s = text(p.signer, 'signer');
          if (s !== 'ca' && s !== 'fakeRoot') throw new Error(`certificate projector: 모르는 서명한 쪽 ${s}`);
          signer = s;
          const k = key(p.key, 'key');
          const certs = list(p.certs, 'certs').map((c, i) => cert(c, `certs[${i}]`));
          const signatures = list(p.signatures, 'signatures').map((x, i) => int(x, `signatures[${i}]`));
          const targets = list(p.targets, 'targets').map(slotOf);
          stage.sign({ signer: s, targets, certs, signatures }, ms(p));
          const sums = certs.map((c, i) => `${c.value}^${k.d} mod ${k.n} = ${signatures[i]}`).join(' · ');
          stage.caption(t('caption.signed', '{who} signs: {sums}', { who: who(), sums }));
          return;
        }
        case 'forged': {
          const p = rec(event.payload, 'forged');
          const forgery = forgeryOf(p.forgery);
          const forged = cert(p.forged, 'forged');
          const signature = int(p.signature, 'signature');
          const presented = nPair(p.presented, 'presented');
          const parts = list(p.parts, 'parts').map((x, i) => int(x, `parts[${i}]`));
          const [s1, s2] = parts;
          const f: CertificateForge = { forgery, signature, forged, presented };
          stage.forge(f, ms(p));
          if (forgery === 'multiply') {
            if (s1 === undefined || s2 === undefined) throw new Error('certificate projector: 곱할 서명이 둘이 아니다');
            stage.caption(
              t('caption.forge.multiply', 'Multiply the two signatures: {s1} × {s2} mod {n} = {s}', {
                s1,
                s2,
                n: presented.n,
                s: signature,
              }),
            );
          } else if (forgery === 'fakeroot') {
            stage.caption(
              t('caption.forge.fakeroot', 'Sent: signature {s} with the fake root key ({n}, {e})', {
                s: signature,
                n: presented.n,
                e: presented.e,
              }),
            );
          } else {
            stage.caption(
              t('caption.forge.move', 'Signature {s} moved onto {subject} ({n}, {e})', {
                s: signature,
                subject: forged.subject,
                n: forged.n,
                e: forged.e,
              }),
            );
          }
          return;
        }
        case 'stored': {
          const p = rec(event.payload, 'stored');
          const presented = nPair(p.presented, 'presented');
          const store = nPair(p.store, 'store');
          const ok = bool(p.ok, 'ok');
          const signature = int(p.signature, 'signature');
          sent = { signature, n: presented.n, e: presented.e };
          stage.store({ signature, presented, store, ok }, ms(p));
          const vars = { n: presented.n, e: presented.e, sn: store.n, se: store.e };
          stage.caption(
            ok
              ? t('caption.store.ok', 'Trust store: issuer key ({n}, {e}) = stored ({sn}, {se}), goes on', vars)
              : t('caption.store.blocked', 'Trust store: issuer key ({n}, {e}) ≠ stored ({sn}, {se}), stopped here', vars),
          );
          return;
        }
        case 'verified': {
          const p = rec(event.payload, 'verified');
          const recovered = int(p.recovered, 'recovered');
          const expected = int(p.expected, 'expected');
          const ok = bool(p.ok, 'ok');
          if (!sent) throw new Error('certificate projector: 저장소 걸음 없이 서명 확인이 왔다');
          stage.verify({ recovered, expected, ok }, ms(p));
          const vars = { s: sent.signature, e: sent.e, n: sent.n, r: recovered, x: expected };
          stage.caption(
            ok
              ? t('caption.verify.pass', 'Signature check: {s}^{e} mod {n} = {r} = signed value {x}, accepted', vars)
              : t('caption.verify.blocked', 'Signature check: {s}^{e} mod {n} = {r} ≠ signed value {x}, stopped here', vars),
          );
          return;
        }
        default:
          throw new Error(`certificate projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      signer = null;
      sent = null;
      mode = null;
      stage.reset();
      code?.highlightPhase?.(null);
    },
  };
};
