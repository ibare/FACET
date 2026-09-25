/**
 * TLS 핸드셰이크 — 비밀을 "누구와" 맞췄는가.
 *
 * 세 자리(클라이언트 · 가운데 사람 · 서버)가 한 선 위에 있다. 클라이언트와 서버는 작은 수의 디피-헬먼으로
 * 비밀 K 를 맞추고, 서버는 인증서 둘과 함께 (받은 클라이언트 쪽 값, 제 B) 의 요약에 서명해 보낸다.
 * 손잡이 둘이 판을 가른다.
 *   middle  0 = 엿듣기만 (선을 건넌 값의 사본을 쥔다) · 1 = 끼어들기 (A · B 를 쥐고 제 M 을 대신 보낸다)
 *   verify  0 = 인증서를 보지 않음 · 1 = 사슬과 서명을 확인
 *
 * 한 판 = 걸음 0 (round-start) 뒤로 phase 하나씩. 걸음 경계는 `sleep` 과 입력 대기뿐이다.
 * 판이 끝나면 `waitForInput` 으로 손잡이를 기다렸다가 받은 값으로 다시 재생한다.
 *
 * ── 셈 규약
 *   powMod(x, power, modulus) = 반복 곱 r = (r × (x mod n)) mod n 을 power 번 (IR 과 같은 식).
 *   서버의 서명: 요약 = (서버가 받은 클라이언트 쪽 값) × p + B, 서명 = 요약^d mod n(잎).
 *   클라이언트의 확인: 서명^e mod n(잎) = (제 A) × p + (받은 서버 쪽 값) 이면 맞음.
 *   사슬: 잎부터 issuer 이름으로 다음 칸을 찾는다 (꾸러미 먼저, 없으면 신뢰 저장소). 칸마다
 *         서명^e(발급자) mod n(발급자) = tbs 코드값 합 mod n(발급자). 저장소에서 온 발급자를 확인하면 멈춘다.
 *         tbs = `<subject>|<issuer>|<n>|<e>` 의 코드값(UTF-16 코드 단위) 합.
 *   동률 · 순위는 없다. 견주는 것은 모두 정수 등식이다.
 *
 * ── 이벤트 (silent 가 아닌 것은 모두 걸음 하나)
 *   round-start       { middle: 0|1, verify: 0|1, p, g, a, b, m: number,
 *                       bundle: string[] (서버가 보내는 인증서 subject 차례), store: string[] (신뢰 저장소 subject) }
 *   client-share      { share: number (A), intercepted: boolean }
 *   middle-to-server  { held: number (쥔 A), sent: number (M) }
 *   server-share      { share: number (B), received: number (서버가 받은 클라이언트 쪽 값) }
 *   server-sign       { digest: number, signature: number, share: number (B), certs: number (보낸 인증서 수),
 *                       intercepted: boolean }
 *   middle-to-client  { held: number (쥔 B), sent: number (M), signature: number }
 *   chain-check       { links: { subject: string, issuer: string, decoded: number, expected: number,
 *                       holds: boolean, fromStore: boolean }[], held: number (맞은 고리 수), ok: boolean }
 *   sign-check        { decoded: number, expected: number, ok: boolean }   (ok false 면 판이 끝난다 — 끊김)
 *   client-key        { key: number }
 *   server-key        { key: number, other: number (클라이언트 K), same: boolean, open: boolean }
 *   middle-keys       { withClient: number, withServer: number,
 *                       sameAsClient: boolean, sameAsServer: boolean }
 *   phase (silent)    { phase: string }
 *
 * ── phase 어휘 (irs.ts 와 정확히 같다, 열하나)
 *   client-share · middle-to-server · server-share · server-sign · middle-to-client · chain-check ·
 *   sign-ok · handshake-abort · client-key · server-key · middle-keys
 *
 * ── 계기 (판 시작에 0 으로 — 지금 값을 들고 차이만 보낸다)
 *   open-connections       판 끝에 1 (열림) 또는 0 (끊김). server-key 걸음에서 1 이 된다
 *   keys-known-to-middle   가운데가 셈한 K 수. middle-keys 걸음에서 2 가 된다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TlsCertificate = {
  id: string;
  subject: string;
  issuer: string;
  n: number;
  e: number;
  /** 발급자가 단 서명. 스스로 선 뿌리는 없다. */
  sig?: number;
};

export type TlsHandshakeData = {
  type: 'tls-handshake';
  stepMs: number;
  p: number;
  g: number;
  secrets: { client: number; server: number; middle: number };
  serverSignExponent: number;
  certificates: TlsCertificate[];
  bundle: string[];
  trustStore: string[];
  middleLadder: number[];
  middle: number;
  verifyLadder: number[];
  verify: number;
};

export type ChainLink = {
  subject: string;
  issuer: string;
  /** 서명^e(발급자) mod n(발급자) */
  decoded: number;
  /** tbs 코드값 합 mod n(발급자) */
  expected: number;
  /** IR 에 건네는 수 — tbs 코드값 합 (나머지 전) */
  tbsSum: number;
  sig: number;
  issuerN: number;
  issuerE: number;
  holds: boolean;
  fromStore: boolean;
};

export type HandshakeRound = {
  middle: number;
  verify: number;
  clientShare: number;
  /** 가운데의 M. 엿듣기만이면 -1 (셈하지 않음) */
  middleShare: number;
  serverShare: number;
  toServer: number;
  toClient: number;
  digest: number;
  signature: number;
  /** 확인 안 함이면 빈 배열 */
  chain: ChainLink[];
  chainOk: boolean;
  signDecoded: number;
  signExpected: number;
  signOk: boolean;
  /** 1 열림 · 0 끊김 */
  open: number;
  /** [client K, server K, 가운데 K(client 와), 가운데 K(server 와)] — 셈하지 않은 칸은 -1 */
  keys: number[];
  /** 이 판에 켜지는 phase 차례 (걸음 0 을 뺀 걸음마다 하나) */
  phases: string[];
};

/** 반복 곱 거듭제곱 — IR 의 powMod 와 같은 식. */
export function powMod(x: number, power: number, modulus: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(power) || !Number.isInteger(modulus) || modulus <= 0 || power < 0 || x < 0) {
    throw new Error(`powMod: 셈할 수 없는 인자 (${x}, ${power}, ${modulus})`);
  }
  let r = 1;
  for (let i = 1; i <= power; i += 1) r = (r * (x % modulus)) % modulus;
  return r;
}

/** tbs = `<subject>|<issuer>|<n>|<e>` 의 코드값 합. */
export function tbsSum(cert: TlsCertificate): number {
  const text = `${cert.subject}|${cert.issuer}|${cert.n}|${cert.e}`;
  let sum = 0;
  for (let i = 0; i < text.length; i += 1) sum += text.charCodeAt(i);
  return sum;
}

function certById(data: TlsHandshakeData, id: string): TlsCertificate {
  const c = data.certificates.find((x) => x.id === id);
  if (!c) throw new Error(`tls-handshake: 인증서 '${id}' 가 certificates 에 없다`);
  return c;
}

/** 잎부터 사슬을 오른다. 꾸러미 먼저, 없으면 신뢰 저장소. 찾지 못하면 던진다. */
export function walkChain(data: TlsHandshakeData): ChainLink[] {
  const bundle = data.bundle.map((id) => certById(data, id));
  const store = data.trustStore.map((id) => certById(data, id));
  if (bundle.length === 0) throw new Error('tls-handshake: 꾸러미가 비었다');
  const links: ChainLink[] = [];
  let cur = bundle[0];
  for (let guard = 0; guard <= bundle.length + store.length; guard += 1) {
    const inBundle = bundle.find((c) => c !== cur && c.subject === cur.issuer);
    const inStore = inBundle ? undefined : store.find((c) => c.subject === cur.issuer);
    const issuer = inBundle ?? inStore;
    if (!issuer) throw new Error(`tls-handshake: '${cur.subject}' 의 발급자 '${cur.issuer}' 를 찾지 못했다`);
    if (cur.sig === undefined) throw new Error(`tls-handshake: '${cur.subject}' 에 서명이 없다`);
    const sum = tbsSum(cur);
    const decoded = powMod(cur.sig, issuer.e, issuer.n);
    const expected = sum % issuer.n;
    links.push({
      subject: cur.subject,
      issuer: issuer.subject,
      decoded,
      expected,
      tbsSum: sum,
      sig: cur.sig,
      issuerN: issuer.n,
      issuerE: issuer.e,
      holds: decoded === expected,
      fromStore: inStore !== undefined,
    });
    if (inStore !== undefined || decoded !== expected) return links;
    cur = issuer;
  }
  throw new Error('tls-handshake: 사슬이 신뢰 저장소에 닿지 않고 돈다');
}

function onLadder(ladder: number[], value: number, name: string): number {
  if (!ladder.includes(value)) throw new Error(`tls-handshake: ${name} ${value} 가 사다리 [${ladder.join(', ')}] 밖이다`);
  return value;
}

/** 한 판을 셈한다 — 화면과 IR 대조가 같은 답을 본다. */
export function computeHandshake(data: TlsHandshakeData, middle: number, verify: number): HandshakeRound {
  onLadder(data.middleLadder, middle, 'middle');
  onLadder(data.verifyLadder, verify, 'verify');
  const { p, g } = data;
  const { client: a, server: b, middle: m } = data.secrets;
  const leaf = certById(data, data.bundle[0] ?? '');
  const phases: string[] = [];

  const clientShare = powMod(g, a, p);
  phases.push('client-share');
  let middleShare = -1;
  let toServer = clientShare;
  if (middle === 1) {
    middleShare = powMod(g, m, p);
    toServer = middleShare;
    phases.push('middle-to-server');
  }
  const serverShare = powMod(g, b, p);
  phases.push('server-share');
  const digest = toServer * p + serverShare;
  const signature = powMod(digest, data.serverSignExponent, leaf.n);
  phases.push('server-sign');
  let toClient = serverShare;
  if (middle === 1) {
    toClient = middleShare;
    phases.push('middle-to-client');
  }

  const keys = [-1, -1, -1, -1];
  let chain: ChainLink[] = [];
  let chainOk = true;
  let signDecoded = -1;
  let signExpected = -1;
  let signOk = false;
  let open = 1;
  if (verify === 1) {
    chain = walkChain(data);
    chainOk = chain.every((l) => l.holds);
    phases.push('chain-check');
    if (!chainOk) open = 0;
    else {
      signDecoded = powMod(signature, leaf.e, leaf.n);
      signExpected = clientShare * p + toClient;
      signOk = signDecoded === signExpected;
      phases.push(signOk ? 'sign-ok' : 'handshake-abort');
      if (!signOk) open = 0;
    }
  }
  if (open === 1) {
    keys[0] = powMod(toClient, a, p);
    phases.push('client-key');
    keys[1] = powMod(toServer, b, p);
    phases.push('server-key');
    if (middle === 1) {
      keys[2] = powMod(clientShare, m, p);
      keys[3] = powMod(serverShare, m, p);
      phases.push('middle-keys');
    }
  }
  return {
    middle,
    verify,
    clientShare,
    middleShare,
    serverShare,
    toServer,
    toClient,
    digest,
    signature,
    chain,
    chainOk,
    signDecoded,
    signExpected,
    signOk,
    open,
    keys,
    phases,
  };
}

function checkData(data: TlsHandshakeData): void {
  if (data.type !== 'tls-handshake') throw new Error(`tls-handshake: 모르는 자료 '${String(data.type)}'`);
  for (const [name, v] of [['p', data.p], ['g', data.g], ['stepMs', data.stepMs], ['d', data.serverSignExponent]] as const) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) throw new Error(`tls-handshake: ${name} 가 양의 정수가 아니다`);
  }
  if (!Array.isArray(data.middleLadder) || !Array.isArray(data.verifyLadder)) throw new Error('tls-handshake: 사다리가 없다');
}

export async function tlsHandshakeAlgorithm(ctx: FacetContext<TlsHandshakeData>): Promise<void> {
  const rc = ctx as ReactiveContext<TlsHandshakeData>;
  const data = ctx.data;
  checkData(data);
  let middle = onLadder(data.middleLadder, data.middle, 'middle');
  let verify = onLadder(data.verifyLadder, data.verify, 'verify');

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const before = shown.get(name);
    if (before === value) return;
    ctx.metric(name, value - (before ?? 0));
    shown.set(name, value);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const rest = () => rc.sleep(data.stepMs);

  const play = async (): Promise<boolean> => {
    const r = computeHandshake(data, middle, verify);
    const { p, g } = data;
    const { client: a, server: b, middle: m } = data.secrets;

    // 걸음 0 — 세 자리 · 공개값 · 비밀 · 신뢰 저장소
    setMetric('open-connections', 0);
    setMetric('keys-known-to-middle', 0);
    await ctx.emit({
      type: 'round-start',
      payload: {
        middle,
        verify,
        p,
        g,
        a,
        b,
        m,
        bundle: data.bundle.map((id) => certById(data, id).subject),
        store: data.trustStore.map((id) => certById(data, id).subject),
      },
    });
    if (!(await rest())) return false;

    await phase('client-share');
    await ctx.emit({ type: 'client-share', payload: { share: r.clientShare, intercepted: middle === 1 } });
    if (!(await rest())) return false;

    if (middle === 1) {
      await phase('middle-to-server');
      await ctx.emit({ type: 'middle-to-server', payload: { held: r.clientShare, sent: r.middleShare } });
      if (!(await rest())) return false;
    }

    await phase('server-share');
    await ctx.emit({ type: 'server-share', payload: { share: r.serverShare, received: r.toServer } });
    if (!(await rest())) return false;

    await phase('server-sign');
    await ctx.emit({
      type: 'server-sign',
      payload: {
        digest: r.digest,
        signature: r.signature,
        share: r.serverShare,
        certs: data.bundle.length,
        intercepted: middle === 1,
      },
    });
    if (!(await rest())) return false;

    if (middle === 1) {
      await phase('middle-to-client');
      await ctx.emit({ type: 'middle-to-client', payload: { held: r.serverShare, sent: r.middleShare, signature: r.signature } });
      if (!(await rest())) return false;
    }

    if (verify === 1) {
      await phase('chain-check');
      await ctx.emit({
        type: 'chain-check',
        payload: {
          links: r.chain.map((l) => ({
            subject: l.subject,
            issuer: l.issuer,
            decoded: l.decoded,
            expected: l.expected,
            holds: l.holds,
            fromStore: l.fromStore,
          })),
          held: r.chain.filter((l) => l.holds).length,
          ok: r.chainOk,
        },
      });
      if (!(await rest())) return false;
      if (!r.chainOk) return true;

      if (r.signOk) await phase('sign-ok');
      else await phase('handshake-abort');
      await ctx.emit({ type: 'sign-check', payload: { decoded: r.signDecoded, expected: r.signExpected, ok: r.signOk } });
      if (!(await rest())) return false;
      if (!r.signOk) return true;
    }

    await phase('client-key');
    await ctx.emit({ type: 'client-key', payload: { key: r.keys[0] } });
    if (!(await rest())) return false;

    await phase('server-key');
    setMetric('open-connections', r.open);
    await ctx.emit({
      type: 'server-key',
      payload: { key: r.keys[1], other: r.keys[0], same: r.keys[0] === r.keys[1], open: r.open === 1 },
    });
    if (!(await rest())) return false;

    if (middle === 1) {
      await phase('middle-keys');
      setMetric('keys-known-to-middle', r.keys.slice(2).filter((k) => k >= 0).length);
      await ctx.emit({
        type: 'middle-keys',
        payload: {
          withClient: r.keys[2],
          withServer: r.keys[3],
          sameAsClient: r.keys[2] === r.keys[0],
          sameAsServer: r.keys[3] === r.keys[1],
        },
      });
      if (!(await rest())) return false;
    }
    return true;
  };

  try {
    while (!ctx.cancelled) {
      if (ctx.cancelled) return;
      if (!(await play())) return;
      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'middle' && input.type !== 'verify') continue;
        const payload = input.payload as { value?: unknown } | undefined;
        const value = payload?.value;
        if (typeof value !== 'number') continue;
        if (input.type === 'middle') {
          if (!data.middleLadder.includes(value)) continue;
          middle = value;
        } else {
          if (!data.verifyLadder.includes(value)) continue;
          verify = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
