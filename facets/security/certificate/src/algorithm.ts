/**
 * certificate — 인증서 위조 넷과 받는 쪽의 확인 줄.
 *
 * CA 하나(`CN=Sample CA`)가 장난감 RSA 로 인증서에 서명한다. 손잡이 signTarget 이 **서명받는 수**를 가른다 —
 * 0 문서 그대로(문서 번호 `10 × e + 이름 자리`) · 1 요약(`H(tbs) mod n`). 손잡이 forgery 가 공격자의 길을 고른다 —
 * 곱하기 · 겹치는 짝 · 열쇠 바꿔 끼우기 · 가짜 뿌리. 공격자의 절차는 서명 대상과 상관없이 같고 바뀌는 것은 서명받는 수뿐이다.
 * 위조 인증서는 받는 쪽의 확인 줄(저장소 → 서명 확인)을 따라 내려가다 막힌 자리에서 멈춘다.
 *
 * 셈 규약
 *   tbs  = `<subject>|<issuer>|<n>|<e>` (십진 · 공백 없음)
 *   H    = 장난감 해시 (상태 16 비트 · IV 6a09 · 덩어리 2 바이트 · 덩어리마다 세 라운드
 *          `x ⊕ m → x × 9e37 mod 2¹⁶ → rotl16(x, 5)` · 끝에 앞 상태를 더함 · 0x80 · 0 · 길이 비트 16 비트 패딩)
 *   요약 = H(tbs 의 ASCII 바이트) mod (서명한 쪽 n) · 문서 번호 = 10 × e + nameDigit[subject] (서명한 쪽 n 이상이면 던진다)
 *   서명 = 서명받는 수^d mod n · 푼 값 = 서명^e mod n (곱할 때마다 mod)
 *   공격자의 e 후보 = eRange 안에서 φ(공격자 n) 와 서로소인 것, 오름차순
 *   곱하기 — 후보 e 를 차례로 A 로 잡고 번호(B) = 번호(X) × 번호(A)⁻¹ mod n(CA). B 가 공격자 이름 자리이고 그 e 가 후보면 멈춘다.
 *            번호(A) 가 n 과 서로소가 아니면 역원이 없어 그 A 는 쓸 수 없다 (잡아 본 수에는 든다). 끝까지 못 찾으면 던진다
 *   겹치는 짝 — 후보 e 마다 공격자 이름 인증서 먼저 · 목표 이름 인증서 다음으로 서명받는 수를 셈해, 반대쪽에 같은 수가 이미
 *            있으면 멈춘다. 같은 수가 한쪽에 여럿이면 먼저 셈한 것을 쥔다(이 데이터에서는 걸리지 않는다). 짝이 없으면 후보를
 *            다 셈한 뒤 첫 무해 인증서의 서명을 X 에 붙인다
 *   동률 — 없다. 두 찾기 모두 오름차순 첫 성립에서 멈춘다
 *
 * 이벤트 (type · payload · silent)
 *   init      silent  RoundInit — 걸음 0. 판 머리의 모든 인물 · 저장소 · 목표 꼴 · 후보 수 · 이 판의 손잡이 값
 *   prepared          { forgery, tries, triesMax, requests: CertView[], pairTarget: CertView | null, pairValue: number | null,
 *                       multiply: { aE, bE, aNumber, bNumber, targetNumber, modulus, valueProduct } | null, fake: KeyView | null, motionMs }
 *   signed            { signer: 'ca' | 'fakeRoot', key: KeyView, targets: ('request0' | 'request1' | 'target')[],
 *                       certs: CertView[], signatures: number[], motionMs }
 *   forged            { forgery, parts: number[], signature, forged: CertView, presented: { n, e }, motionMs }
 *   stored            { signature, presented: { n, e }, store: { n, e }, ok, stop: 'store' | null, motionMs }
 *   verified          { recovered, expected, ok, stop, motionMs }
 *   phase     silent  { phase }
 *
 * phase 어휘 (irs.ts 와 같다): sign · forge · store · verify
 *   준비 걸음(prepared)에는 phase 가 없다 — IR 에 공격자의 찾기가 없다. 판 머리에서 projector 가 패널을 끈다.
 *
 * 계기: forger-tries (준비 걸음의 후보 수) · ca-signatures (CA 가 서명해 준 수, 가짜 뿌리의 서명은 세지 않는다) ·
 *       accepted (마지막 걸음에서 통과면 1)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export const FORGERY_IDS = ['multiply', 'pair', 'swap', 'fakeroot'] as const;
export type ForgeryId = (typeof FORGERY_IDS)[number];

type Party = { name: string; p: number; q: number; e: number };

export type CertificateData = {
  type: 'certificate';
  stepMs: number;
  ca: Party;
  store: { name: string; n: number; e: number };
  owner: Party;
  mallory: { name: string; p: number; q: number; targetE: number };
  fakeRoot: Party;
  nameDigit: Record<string, number>;
  eRange: [number, number];
  signTargetLadder: number[];
  signTarget: number;
  forgeryLadder: number[];
  forgery: number;
  forgeries: string[];
};

/** 걸음마다 운동 길이 (ms, 속도 1 기준). 걸음 경계의 sleep 은 stepMs + 이 값이다. */
export const MOTION_MS = { prepared: 1200, signed: 600, forged: 800, stored: 600, verified: 600 } as const;

// ─────────────────────────────── 좁히개

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`certificate: ${where} 가 정수가 아니다`);
  return v;
}
function str(v: unknown, where: string): string {
  if (typeof v !== 'string') throw new Error(`certificate: ${where} 가 글자가 아니다`);
  return v;
}
function obj(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`certificate: ${where} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function numList(v: unknown, where: string): number[] {
  if (!Array.isArray(v)) throw new Error(`certificate: ${where} 가 목록이 아니다`);
  return v.map((x, i) => num(x, `${where}[${i}]`));
}
function party(v: unknown, where: string): Party {
  const o = obj(v, where);
  return { name: str(o.name, `${where}.name`), p: num(o.p, `${where}.p`), q: num(o.q, `${where}.q`), e: num(o.e, `${where}.e`) };
}

export function readCertificateData(raw: unknown): CertificateData {
  const o = obj(raw, 'data');
  if (o.type !== 'certificate') throw new Error('certificate: data.type 이 certificate 가 아니다');
  const store = obj(o.store, 'store');
  const mallory = obj(o.mallory, 'mallory');
  const digits = obj(o.nameDigit, 'nameDigit');
  const nameDigit: Record<string, number> = {};
  for (const [k, v] of Object.entries(digits)) nameDigit[k] = num(v, `nameDigit.${k}`);
  const eRange = numList(o.eRange, 'eRange');
  if (eRange.length !== 2) throw new Error('certificate: eRange 는 두 수다');
  const forgeries = Array.isArray(o.forgeries) ? o.forgeries.map((x, i) => str(x, `forgeries[${i}]`)) : null;
  if (!forgeries || forgeries.join() !== FORGERY_IDS.join()) throw new Error('certificate: forgeries 가 위조 넷과 다르다');
  return {
    type: 'certificate',
    stepMs: num(o.stepMs, 'stepMs'),
    ca: party(o.ca, 'ca'),
    store: { name: str(store.name, 'store.name'), n: num(store.n, 'store.n'), e: num(store.e, 'store.e') },
    owner: party(o.owner, 'owner'),
    mallory: {
      name: str(mallory.name, 'mallory.name'),
      p: num(mallory.p, 'mallory.p'),
      q: num(mallory.q, 'mallory.q'),
      targetE: num(mallory.targetE, 'mallory.targetE'),
    },
    fakeRoot: party(o.fakeRoot, 'fakeRoot'),
    nameDigit,
    eRange: [eRange[0]!, eRange[1]!],
    signTargetLadder: numList(o.signTargetLadder, 'signTargetLadder'),
    signTarget: num(o.signTarget, 'signTarget'),
    forgeryLadder: numList(o.forgeryLadder, 'forgeryLadder'),
    forgery: num(o.forgery, 'forgery'),
    forgeries,
  };
}

// ─────────────────────────────── 셈

function rotl16(x: number, r: number): number {
  return ((x << r) | (x >>> (16 - r))) & 0xffff;
}

/** 장난감 해시 H — 16 비트. 곱은 Math.imul 로 아래 32 비트를 지켜 자리를 잃지 않는다. */
export function H(text: string): number {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 0x7f) throw new Error(`certificate: H 는 ASCII 만 받는다 (${text})`);
    bytes.push(c);
  }
  const bits = bytes.length * 8;
  if (bits > 0xffff) throw new Error('certificate: H 의 길이 칸(16 비트)을 넘는다');
  bytes.push(0x80);
  while (bytes.length % 2 !== 0) bytes.push(0);
  bytes.push((bits >>> 8) & 0xff, bits & 0xff);
  let x = 0x6a09;
  for (let i = 0; i < bytes.length; i += 2) {
    const m = (bytes[i]! << 8) | bytes[i + 1]!;
    const prev = x;
    for (let r = 0; r < 3; r++) {
      x ^= m;
      x = Math.imul(x, 0x9e37) & 0xffff;
      x = rotl16(x, 5);
    }
    x = (x + prev) & 0xffff;
  }
  return x;
}

export function modPow(b: number, e: number, m: number): number {
  if (m <= 0 || e < 0 || b < 0) throw new Error('certificate: modPow 인자가 음수다');
  let result = 1 % m;
  let base = b % m;
  let k = e;
  while (k > 0) {
    if (k % 2 === 1) result = (result * base) % m;
    base = (base * base) % m;
    k = Math.floor(k / 2);
  }
  return result;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

/** 확장 유클리드 역원. 없으면 null — 부르는 쪽이 그 자리의 뜻을 정한다. */
export function modInverse(a: number, m: number): number | null {
  let [oldR, r] = [a % m, m];
  let [oldS, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1) return null;
  return ((oldS % m) + m) % m;
}

export type KeyView = { name: string; n: number; e: number; d: number };

export type CertView = {
  subject: string;
  issuer: string;
  n: number;
  e: number;
  tbs: string;
  h16: number;
  docNumber: number;
  /** 서명한 쪽 n 으로 본 서명받는 수 (문서 번호 또는 요약) */
  value: number;
};

export type StopAt = 'store' | 'verify' | 'pass';

export type Round = {
  signTarget: number;
  forgery: ForgeryId;
  ca: KeyView;
  fake: KeyView;
  owner: { name: string; n: number; e: number };
  mallory: { name: string; n: number; phi: number };
  store: { name: string; n: number; e: number };
  candidates: number[];
  target: CertView;
  tries: number;
  triesMax: number;
  requests: CertView[];
  pairValue: number | null;
  /** 곱하기 — A · B 는 문서 번호로 고른다. valueProduct = 두 서명받는 수의 곱 mod n (요약 판에서 목표의 요약과 견줄 값) */
  multiply: {
    aE: number;
    bE: number;
    aNumber: number;
    bNumber: number;
    targetNumber: number;
    modulus: number;
    valueProduct: number;
  } | null;
  signer: 'ca' | 'fakeRoot';
  signTargets: ('request0' | 'request1' | 'target')[];
  /** 서명받은 인증서 — value 는 서명한 쪽 n 으로 본 서명받는 수 */
  signedCerts: CertView[];
  signedValues: number[];
  signatures: number[];
  forgedSignature: number;
  forged: CertView;
  presented: { n: number; e: number };
  storeOk: boolean;
  recovered: number | null;
  expected: number;
  stop: StopAt;
  caSignatures: number;
  accepted: number;
};

function keyOf(p: Party): KeyView {
  const n = p.p * p.q;
  const phi = (p.p - 1) * (p.q - 1);
  const d = modInverse(p.e, phi);
  if (d === null) throw new Error(`certificate: ${p.name} 의 e ${p.e} 가 φ ${phi} 와 서로소가 아니다`);
  return { name: p.name, n, e: p.e, d };
}

export function signedValue(mode: number, docNumber: number, h16: number, n: number): number {
  if (mode === 0) {
    if (docNumber >= n) throw new Error(`certificate: 문서 번호 ${docNumber} 가 n ${n} 이상이라 문서 그대로 서명할 수 없다`);
    return docNumber;
  }
  if (mode === 1) return h16 % n;
  throw new Error(`certificate: 모르는 서명 대상 ${mode}`);
}

/** 곱하기는 서명 둘, 나머지 셋은 서명 하나를 받는다 — 개수가 어긋나면 던진다. */
export function forgeSignature(forgery: number, signatures: number[], n: number): number {
  if (forgery === 0) {
    const [s1, s2] = signatures;
    if (signatures.length !== 2 || s1 === undefined || s2 === undefined) {
      throw new Error(`certificate: 곱하기는 서명 둘을 받는다 (${signatures.length})`);
    }
    return (s1 * s2) % n;
  }
  if (forgery === 1 || forgery === 2 || forgery === 3) {
    const [s1] = signatures;
    if (signatures.length !== 1 || s1 === undefined) {
      throw new Error(`certificate: 위조 ${forgery} 는 서명 하나를 받는다 (${signatures.length})`);
    }
    return s1;
  }
  throw new Error(`certificate: 모르는 위조 ${forgery}`);
}

/** 한 판을 끝까지 셈한다. 화면에 뜨는 값은 모두 여기서 나온다. */
export function computeRound(data: CertificateData, signTarget: number, forgeryIndex: number): Round {
  if (!data.signTargetLadder.includes(signTarget)) throw new Error(`certificate: 서명 대상 ${signTarget} 가 사다리에 없다`);
  if (!data.forgeryLadder.includes(forgeryIndex)) throw new Error(`certificate: 위조 ${forgeryIndex} 가 사다리에 없다`);
  const forgery = FORGERY_IDS[forgeryIndex];
  if (forgery === undefined) throw new Error(`certificate: 모르는 위조 ${forgeryIndex}`);

  const ca = keyOf(data.ca);
  if (ca.n !== data.store.n || ca.e !== data.store.e || ca.name !== data.store.name) {
    throw new Error('certificate: 저장소 항목이 CA 의 열쇠와 다르다');
  }
  const fake = keyOf(data.fakeRoot);
  const ownerN = data.owner.p * data.owner.q;
  const mN = data.mallory.p * data.mallory.q;
  const mPhi = (data.mallory.p - 1) * (data.mallory.q - 1);
  const targetName = data.owner.name;

  const digitOf = (name: string): number => {
    const d = data.nameDigit[name];
    if (d === undefined) throw new Error(`certificate: 이름 자리가 없다 (${name})`);
    return d;
  };
  const cert = (subject: string, n: number, e: number, signerN: number): CertView => {
    const tbs = `${subject}|${ca.name}|${n}|${e}`;
    const h16 = H(tbs);
    const docNumber = 10 * e + digitOf(subject);
    return { subject, issuer: ca.name, n, e, tbs, h16, docNumber, value: signedValue(signTarget, docNumber, h16, signerN) };
  };

  const candidates: number[] = [];
  for (let e = data.eRange[0]; e <= data.eRange[1]; e++) if (gcd(e, mPhi) === 1) candidates.push(e);
  if (candidates.length === 0) throw new Error('certificate: 공격자의 e 후보가 없다');

  const X = cert(targetName, mN, data.mallory.targetE, ca.n);

  let tries = 0;
  let triesMax = 0;
  let requests: CertView[] = [];
  let pairValue: number | null = null;
  let multiply: Round['multiply'] = null;
  let signer: Round['signer'] = 'ca';
  let signTargets: Round['signTargets'] = [];
  let forged = X;

  if (forgery === 'multiply') {
    triesMax = candidates.length;
    const mDigit = digitOf(data.mallory.name);
    for (const eA of candidates) {
      tries++;
      const aNumber = 10 * eA + mDigit;
      const inv = modInverse(aNumber, ca.n);
      if (inv === null) continue; // 역원이 없는 A 는 쓸 수 없다 — 잡아 본 수에는 든다 (머리말)
      const bNumber = (X.docNumber * inv) % ca.n;
      if (bNumber % 10 !== mDigit) continue;
      const eB = (bNumber - mDigit) / 10;
      if (!candidates.includes(eB)) continue;
      requests = [cert(data.mallory.name, mN, eA, ca.n), cert(data.mallory.name, mN, eB, ca.n)];
      multiply = {
        aE: eA,
        bE: eB,
        aNumber,
        bNumber,
        targetNumber: X.docNumber,
        modulus: ca.n,
        valueProduct: (requests[0]!.value * requests[1]!.value) % ca.n,
      };
      break;
    }
    if (multiply === null) throw new Error('certificate: 곱하기 짝 A · B 를 찾지 못했다');
    signTargets = ['request0', 'request1'];
  } else if (forgery === 'pair') {
    triesMax = candidates.length * 2;
    const harmless = new Map<number, CertView>();
    const targets = new Map<number, CertView>();
    let found: [CertView, CertView] | null = null;
    for (const e of candidates) {
      const h = cert(data.mallory.name, mN, e, ca.n);
      tries++;
      const hitT = targets.get(h.value);
      if (hitT) {
        found = [h, hitT];
        break;
      }
      if (!harmless.has(h.value)) harmless.set(h.value, h);
      const t = cert(targetName, mN, e, ca.n);
      tries++;
      const hitH = harmless.get(t.value);
      if (hitH) {
        found = [hitH, t];
        break;
      }
      if (!targets.has(t.value)) targets.set(t.value, t);
    }
    if (found) {
      requests = [found[0]];
      forged = found[1];
      pairValue = found[0].value;
    } else {
      requests = [cert(data.mallory.name, mN, candidates[0]!, ca.n)];
    }
    signTargets = ['request0'];
  } else if (forgery === 'swap') {
    requests = [cert(targetName, ownerN, data.owner.e, ca.n)];
    signTargets = ['request0'];
  } else {
    signer = 'fakeRoot';
    signTargets = ['target'];
  }

  const signerKey = signer === 'ca' ? ca : fake;
  if (signer === 'fakeRoot') {
    // 가짜 뿌리는 목표에 직접 서명한다 — 서명받는 수는 제 n 으로 줄인 것
    forged = { ...X, value: signedValue(signTarget, X.docNumber, X.h16, fake.n) };
  }
  const signedCerts = signer === 'ca' ? requests : [forged];
  const signedValues = signedCerts.map((r) => r.value);
  const signatures = signedValues.map((v) => modPow(v, signerKey.d, signerKey.n));
  const forgedSignature = forgeSignature(forgeryIndex, signatures, signerKey.n);
  const presented = { n: signerKey.n, e: signerKey.e };

  // 받는 쪽 — 저장소 먼저, 그다음 푼 값. 저장소에서 막히면 서명을 풀지 않는다.
  const expected = signedValue(signTarget, forged.docNumber, forged.h16, presented.n);
  const storeOk = presented.n === data.store.n && presented.e === data.store.e;
  let recovered: number | null = null;
  let stop: StopAt = 'store';
  if (storeOk) {
    recovered = modPow(forgedSignature, presented.e, presented.n);
    stop = recovered === expected ? 'pass' : 'verify';
  }

  return {
    signTarget,
    forgery,
    ca,
    fake,
    owner: { name: data.owner.name, n: ownerN, e: data.owner.e },
    mallory: { name: data.mallory.name, n: mN, phi: mPhi },
    store: { ...data.store },
    candidates,
    target: X,
    tries,
    triesMax,
    requests,
    pairValue,
    multiply,
    signer,
    signTargets,
    signedCerts,
    signedValues,
    signatures,
    forgedSignature,
    forged,
    presented,
    storeOk,
    recovered,
    expected,
    stop,
    caSignatures: signer === 'ca' ? signatures.length : 0,
    accepted: stop === 'pass' ? 1 : 0,
  };
}

// ─────────────────────────────── 재생

type Gauge = 'forger-tries' | 'ca-signatures' | 'accepted';

export async function certificateAlgorithm(ctx: FacetContext<CertificateData>): Promise<void> {
  const rctx = ctx as ReactiveContext<CertificateData>;
  const data = readCertificateData(ctx.data);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다.
  const shown = new Map<Gauge, number>();
  const gauge = (name: Gauge, value: number) => {
    const prev = shown.get(name);
    shown.set(name, value);
    ctx.metric(name, prev === undefined ? value : value - prev);
  };

  let signTarget = data.signTarget;
  let forgery = data.forgery;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const r = computeRound(data, signTarget, forgery);

      // 판 머리 — 계기를 0 으로
      gauge('forger-tries', 0);
      gauge('ca-signatures', 0);
      gauge('accepted', 0);

      // 걸음 0
      await ctx.emit({
        type: 'init',
        silent: true,
        payload: {
          signTarget: r.signTarget,
          forgery: r.forgery,
          ca: r.ca,
          store: r.store,
          owner: r.owner,
          mallory: r.mallory,
          target: r.target,
          candidateCount: r.candidates.length,
          triesMax: r.triesMax,
          steps: r.forgery === 'fakeroot' ? 5 : 6,
        },
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      // 걸음 1 — 준비 (phase 없음)
      if (ctx.cancelled) return;
      await ctx.emit({
        type: 'prepared',
        payload: {
          forgery: r.forgery,
          tries: r.tries,
          triesMax: r.triesMax,
          requests: r.requests,
          pairTarget: r.forgery === 'pair' && r.pairValue !== null ? r.forged : null,
          fake: r.forgery === 'fakeroot' ? r.fake : null,
          pairValue: r.pairValue,
          multiply: r.multiply,
          motionMs: MOTION_MS.prepared,
        },
      });
      gauge('forger-tries', r.tries);
      if (!(await rctx.sleep(data.stepMs + MOTION_MS.prepared))) return;

      // 걸음 2 — 서명
      await phase('sign');
      await ctx.emit({
        type: 'signed',
        payload: {
          signer: r.signer,
          key: r.signer === 'ca' ? r.ca : r.fake,
          targets: r.signTargets,
          certs: r.signedCerts,
          signatures: r.signatures,
          motionMs: MOTION_MS.signed,
        },
      });
      gauge('ca-signatures', r.caSignatures);
      if (!(await rctx.sleep(data.stepMs + MOTION_MS.signed))) return;

      // 걸음 3 — 위조
      await phase('forge');
      await ctx.emit({
        type: 'forged',
        payload: {
          forgery: r.forgery,
          parts: r.signatures,
          signature: r.forgedSignature,
          forged: r.forged,
          presented: r.presented,
          motionMs: MOTION_MS.forged,
        },
      });
      if (!(await rctx.sleep(data.stepMs + MOTION_MS.forged))) return;

      // 걸음 4 — 저장소
      await phase('store');
      await ctx.emit({
        type: 'stored',
        payload: {
          signature: r.forgedSignature,
          presented: r.presented,
          store: { n: r.store.n, e: r.store.e },
          ok: r.storeOk,
          stop: r.storeOk ? null : 'store',
          motionMs: MOTION_MS.stored,
        },
      });
      if (!(await rctx.sleep(data.stepMs + MOTION_MS.stored))) return;
      if (r.storeOk) {
        // 걸음 5 — 서명 확인
        await phase('verify');
        if (r.recovered === null) throw new Error('certificate: 저장소를 지났는데 푼 값이 없다');
        await ctx.emit({
          type: 'verified',
          payload: {
            recovered: r.recovered,
            expected: r.expected,
            ok: r.stop === 'pass',
            stop: r.stop,
            motionMs: MOTION_MS.verified,
          },
        });
        gauge('accepted', r.accepted);
        if (!(await rctx.sleep(data.stepMs + MOTION_MS.verified))) return;
      }

      // 손잡이를 기다린다 — 앞뒤로 취소를 본다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'signTarget' && input.type !== 'forgery') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number') continue;
        if (input.type === 'signTarget') {
          if (!data.signTargetLadder.includes(value)) continue;
          signTarget = value;
        } else {
          if (!data.forgeryLadder.includes(value)) continue;
          forgery = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
