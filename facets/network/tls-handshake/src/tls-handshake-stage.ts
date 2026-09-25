/**
 * TLS 핸드셰이크 stage — 세 자리 사이로 건너는 값 조각과, 가운데에서 바꿔 끼워지는 것.
 *
 * 가로로 클라이언트 · 가운데 사람 · 서버. 선은 두 끝을 잇는다. 엿듣기만이면 가운데 상자는 선 **아래**에
 * 매달려 사본만 받고, 끼어들기면 가운데 상자가 선 **위로 올라와** 선을 끊고 앉는다 (판 옮김 운동).
 * 움직이는 주인공은 값 조각이다 — A · B · M · 서명 · 인증서. 조각은 자리에 닿으면 그 자리에 남는다
 * (걸음 끝 화면이 캡션이 센 것을 그대로 보인다).
 *
 * 왼쪽 아래 기둥은 클라이언트 앞: 받은 서명 · 인증서 더미 · 사슬 · 신뢰 저장소. 확인을 켜면 인증서가
 * 열려 사슬로 이어 붙고, 끄면 닫힌 채 쌓인다. 맨 아래 줄은 서명 맞대기(두 수와 맞음/어긋남), 그 아래 캡션.
 * 위쪽 호는 "같은 K 를 쥔 둘" 을 잇는다 — 누가 누구와 비밀을 맞췄는가.
 *
 * 셈은 하지 않는다. 받은 값과 알고리즘이 셈한 판정(same · holds · ok · open)만 그린다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 820;
const H = 480;

// 자리
const BOX_W = 180;
const BOX_H = 120;
const MID_W = 220;
const TOP = 60;
const WIRE_Y = TOP + 60;
const CLIENT_X = 20;
const SERVER_X = W - 20 - BOX_W;
const MID_X = (W - MID_W) / 2;
const MID_CX = W / 2;
const MID_Y_ON = TOP;
const MID_Y_OFF = 210;

const CHIP_W = 64;
const CHIP_H = 22;
const HAND_W = 44;
const DOC_W = 16;
const DOC_H = 20;
const OPEN_W = 176;
const OPEN_H = 26;

const ROW_SHARE = 44;
const ROW_RECV = 71;
const ROW_KEY = 99;

const LEFT_CX = CLIENT_X + BOX_W / 2;
const SIG_SPOT = { x: CLIENT_X + 34, y: 212 };
const PILE_X = CLIENT_X + 100;
const CHAIN_Y0 = 248;
const CHAIN_GAP = 46;
const STORE_Y = 352;
const SIGN_ROW_Y = 425;
const CAPTION_Y = 452;
/** 한 줄 캡션의 글자 폭 한도 (넓은 글자는 둘) */
const CAPTION_UNITS = 96;

export type RoundSetup = {
  middle: number;
  verify: number;
  p: number;
  g: number;
  a: number;
  b: number;
  m: number;
  bundle: string[];
  store: string[];
};

export type ChainLinkView = { subject: string; issuer: string; decoded: number; expected: number; holds: boolean; fromStore: boolean };

/** projector 가 부르는 표면. 운동 메서드는 운동이 끝나면 풀린다. */
export type TlsHandshakeStage = {
  reset(setup: RoundSetup, ms: number): Promise<void>;
  clientShare(share: number, intercepted: boolean, ms: number): Promise<void>;
  middleToServer(held: number, sent: number, ms: number): Promise<void>;
  serverShare(share: number, ms: number): Promise<void>;
  serverSign(signature: number, share: number, intercepted: boolean, ms: number): Promise<void>;
  middleToClient(held: number, sent: number, ms: number): Promise<void>;
  chainCheck(links: ChainLinkView[], ms: number): Promise<void>;
  signCheck(decoded: number, expected: number, ok: boolean, ms: number): Promise<void>;
  clientKey(key: number, ms: number): Promise<void>;
  serverKey(key: number, same: boolean, open: boolean, ms: number): Promise<void>;
  middleKeys(withClient: number, withServer: number, sameAsClient: boolean, sameAsServer: boolean, ms: number): Promise<void>;
  caption(text: string): void;
  destroy(): void;
};

type Tone = 'client' | 'server' | 'middle' | 'sig' | 'key';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

function text(x: number, y: number, content: string, attrs: Record<string, string | number> = {}): SVGTextElement {
  const node = el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, ...attrs });
  node.textContent = content;
  return node;
}

function place(node: SVGElement, x: number, y: number, ms: number): void {
  node.style.transition = ms > 0 ? `transform ${ms}ms ease-in-out, opacity ${ms}ms ease` : 'none';
  node.style.transform = `translate(${x}px, ${y}px)`;
}

export const tlsHandshakeStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    const later = (fn: () => void, ms: number): void => {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, Math.max(0, ms));
      timers.add(id);
    };
    const settle = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        later(done, ms);
      });

    const tone = (k: Tone): string =>
      k === 'client' ? c.primary : k === 'server' ? c.accent : k === 'middle' ? c.danger : k === 'sig' ? c.itemPivot : c.text;

    // ── 층: 호 · 선 · 상자 · 조각 · 캡션
    const arcLayer = el('g');
    const wireLayer = el('g');
    const boxLayer = el('g');
    const leftLayer = el('g');
    const pieceLayer = el('g');
    const captionLayer = el('g');
    svg.append(arcLayer, wireLayer, boxLayer, leftLayer, pieceLayer, captionLayer);

    // ── 선 (왼쪽 · 오른쪽 반쪽). 끊기면 왼쪽 반쪽이 클라이언트 쪽으로 오그라든다
    const wireLeft = el('line', { x1: CLIENT_X + BOX_W, y1: WIRE_Y, x2: MID_CX, y2: WIRE_Y, stroke: c.textMuted, 'stroke-width': 2 });
    const wireRight = el('line', { x1: MID_CX, y1: WIRE_Y, x2: SERVER_X, y2: WIRE_Y, stroke: c.textMuted, 'stroke-width': 2 });
    wireLeft.style.transformOrigin = `${CLIENT_X + BOX_W}px ${WIRE_Y}px`;
    const tap = el('line', { x1: MID_CX, y1: WIRE_Y, x2: MID_CX, y2: MID_Y_OFF, stroke: c.textMuted, 'stroke-width': 1.5, 'stroke-dasharray': '4 4' });
    const wireNote = text((CLIENT_X + BOX_W + MID_X) / 2, WIRE_Y - 10, '', { 'text-anchor': 'middle', 'font-weight': 600 });
    wireLayer.append(wireLeft, wireRight, tap, wireNote);

    // ── 상자
    const box = (x: number, y: number, w: number, title: string, k: Tone): SVGGElement => {
      const g = el('g');
      g.append(
        el('rect', { x: 0, y: 0, width: w, height: BOX_H, rx: 8, fill: c.bgSubtle, stroke: tone(k), 'stroke-width': 1.5 }),
        text(10, 20, title, { fill: c.text, 'font-size': fontSizes.md, 'font-weight': 600 }),
      );
      place(g, x, y, 0);
      return g;
    };
    const slot = (g: SVGGElement, x: number, y: number, w: number): void => {
      g.append(el('rect', { x: x - w / 2, y: y - CHIP_H / 2, width: w, height: CHIP_H, rx: 5, fill: 'none', stroke: c.border, 'stroke-dasharray': '3 3' }));
    };
    const rowLabel = (g: SVGGElement, y: number, label: string): void => {
      g.append(text(10, y + 4, label, { fill: c.textMuted, 'font-size': fontSizes.xs }));
    };

    const clientBox = box(CLIENT_X, TOP, BOX_W, t('label.client', 'Client'), 'client');
    const serverBox = box(SERVER_X, TOP, BOX_W, t('label.server', 'Server'), 'server');
    const middleBox = box(MID_X, MID_Y_OFF, MID_W, t('label.middle', 'Middle party'), 'middle');
    for (const g of [clientBox, serverBox]) {
      rowLabel(g, ROW_RECV, t('label.received', 'Received'));
      rowLabel(g, ROW_KEY, t('label.key', 'K'));
      slot(g, 102, ROW_RECV, CHIP_W);
      slot(g, 102, ROW_KEY, CHIP_W);
    }
    rowLabel(middleBox, ROW_RECV, t('label.hand', 'Holding'));
    rowLabel(middleBox, ROW_KEY, t('label.key', 'K'));
    slot(middleBox, 80, ROW_KEY, CHIP_W);
    slot(middleBox, 160, ROW_KEY, CHIP_W);
    const clientSecret = text(10, ROW_SHARE + 4, '', { fill: c.text, 'font-family': fonts.mono });
    const serverSecret = text(10, ROW_SHARE + 4, '', { fill: c.text, 'font-family': fonts.mono });
    const middleSecret = text(10, ROW_SHARE + 4, '', { fill: c.text, 'font-family': fonts.mono });
    clientBox.append(clientSecret);
    serverBox.append(serverSecret);
    middleBox.append(middleSecret);
    boxLayer.append(clientBox, serverBox, middleBox);

    // 공개값
    const publicTitle = text(SERVER_X + BOX_W / 2, 216, t('label.public', 'Public'), { 'text-anchor': 'middle', fill: c.textMuted });
    const publicValue = text(SERVER_X + BOX_W / 2, 236, '', { 'text-anchor': 'middle', fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.md });
    boxLayer.append(publicTitle, publicValue);

    // 신뢰 저장소 (뿌리)
    const storeBox = el('rect', { x: CLIENT_X, y: STORE_Y - 18, width: BOX_W, height: 64, rx: 8, fill: 'none', stroke: c.border });
    const storeTitle = text(CLIENT_X + BOX_W - 8, STORE_Y - 4, t('label.trustStore', 'Trust store'), { fill: c.textMuted, 'font-size': fontSizes.xs, 'text-anchor': 'end' });
    const storeRoot = el('g');
    leftLayer.append(storeBox, storeTitle, storeRoot);

    // 캡션
    const captionLines = [0, 1].map((i) =>
      text(W / 2, CAPTION_Y + i * 18, '', { 'text-anchor': 'middle', fill: c.text, 'font-size': fontSizes.md }),
    );
    captionLayer.append(...captionLines);

    // ── 그 판의 움직이는 것들
    let setup: RoundSetup | null = null;
    let middleOn = false;
    const midY = (): number => (middleOn ? MID_Y_ON : MID_Y_OFF);
    /** 가운데 손의 칸 i 중심 (캔버스 좌표) */
    const handAt = (i: number, w: number): { x: number; y: number } => ({ x: MID_X + 60 + w / 2 + i * (w + 6), y: midY() + ROW_RECV });
    const docAt = (i: number): { x: number; y: number } => ({ x: MID_X + MID_W - 44 + i * (DOC_W + 6), y: midY() + 22 });
    const recvAt = (side: 'client' | 'server'): { x: number; y: number } => ({
      x: (side === 'client' ? CLIENT_X : SERVER_X) + 102,
      y: TOP + ROW_RECV,
    });
    const keyAt = (side: 'client' | 'server'): { x: number; y: number } => ({
      x: (side === 'client' ? CLIENT_X : SERVER_X) + 102,
      y: TOP + ROW_KEY,
    });
    const middleKeyAt = (i: number): { x: number; y: number } => ({ x: MID_X + 80 + i * 80, y: midY() + ROW_KEY });

    let pieces: SVGGElement[] = [];
    const certs = new Map<string, { g: SVGGElement; closed: SVGGElement; open: SVGGElement }>();
    let sigChip: SVGGElement | null = null;
    /** 선 위에 멈춰 선 조각 (끼어들기 판) */
    let heldLeft: SVGGElement | null = null;
    let heldRight: SVGGElement | null = null;
    let pileNote: SVGTextElement | null = null;

    const newPiece = (): SVGGElement => {
      const g = el('g');
      pieceLayer.append(g);
      pieces.push(g);
      return g;
    };

    /** 값 조각 — 가운데 (cx, cy) 에 놓인다. copy 면 점선 테두리 (사본) */
    const chip = (label: string, k: Tone, cx: number, cy: number, w = CHIP_W, copy = false): SVGGElement => {
      const g = newPiece();
      g.append(
        el('rect', {
          x: 0,
          y: 0,
          width: w,
          height: CHIP_H,
          rx: 5,
          fill: c.bg,
          stroke: tone(k),
          'stroke-width': copy ? 1.2 : 2,
          ...(copy ? { 'stroke-dasharray': '3 2' } : {}),
        }),
        text(w / 2, CHIP_H / 2 + 4, label, { 'text-anchor': 'middle', fill: c.text, 'font-family': fonts.mono, 'font-size': copy ? fontSizes.xs : fontSizes.sm }),
      );
      g.dataset.w = String(w);
      g.dataset.h = String(CHIP_H);
      place(g, cx - w / 2, cy - CHIP_H / 2, 0);
      return g;
    };
    /** 조각을 가운데 (cx, cy) 로 옮긴다 */
    const moveTo = (g: SVGGElement, cx: number, cy: number, ms: number, delay = 0): void => {
      const w = Number(g.dataset.w);
      const h = Number(g.dataset.h);
      later(() => place(g, cx - w / 2, cy - h / 2, ms), delay + 16);
    };

    /** 인증서 — 닫힌 문서(작은 모양)와 열린 칸(subject 글자) 두 겹 */
    const certPiece = (subject: string, cx: number, cy: number, copy: boolean): SVGGElement => {
      const g = newPiece();
      const closed = el('g');
      closed.append(
        el('rect', { x: -DOC_W / 2, y: -DOC_H / 2, width: DOC_W, height: DOC_H, rx: 2, fill: c.bg, stroke: c.textMuted, 'stroke-width': copy ? 1 : 1.5, ...(copy ? { 'stroke-dasharray': '2 2' } : {}) }),
        el('line', { x1: -4, y1: -3, x2: 4, y2: -3, stroke: c.textMuted }),
        el('line', { x1: -4, y1: 2, x2: 4, y2: 2, stroke: c.textMuted }),
      );
      const open = el('g');
      open.append(
        el('rect', { x: -OPEN_W / 2, y: -OPEN_H / 2, width: OPEN_W, height: OPEN_H, rx: 4, fill: c.bg, stroke: c.textMuted, 'stroke-width': 1.5 }),
        text(0, 4, subject, { 'text-anchor': 'middle', fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs }),
      );
      open.style.opacity = '0';
      open.style.transform = 'scale(0.2, 0.8)';
      g.append(closed, open);
      g.dataset.w = '0';
      g.dataset.h = '0';
      place(g, cx, cy, 0);
      if (!copy) certs.set(subject, { g, closed, open });
      return g;
    };
    const openCert = (subject: string, ms: number, delay: number): void => {
      const cert = certs.get(subject);
      if (!cert) throw new Error(`tls-handshake-stage: 인증서 '${subject}' 가 클라이언트에 닿지 않았다`);
      later(() => {
        for (const part of [cert.closed, cert.open]) part.style.transition = `opacity ${ms}ms ease, transform ${ms}ms ease`;
        cert.closed.style.opacity = '0';
        cert.open.style.opacity = '1';
        cert.open.style.transform = 'scale(1, 1)';
      }, delay + 16);
    };
    const note = (x: number, y: number, content: string, fill: string, anchor = 'start'): SVGTextElement => {
      const g = newPiece();
      const n = text(x, y, content, { fill, 'text-anchor': anchor, 'font-weight': 600 });
      g.append(n);
      g.style.opacity = '0';
      later(() => {
        g.style.transition = 'opacity 200ms ease';
        g.style.opacity = '1';
      }, 16);
      return n;
    };
    /** 두 점을 잇는 위쪽 호 — 같은 K 를 쥔 둘 */
    const arc = (x1: number, y1: number, x2: number, y2: number, lift: number, ms: number): void => {
      const g = newPiece();
      arcLayer.append(g);
      const mx = (x1 + x2) / 2;
      const top = Math.min(y1, y2) - lift;
      const path = el('path', {
        d: `M ${x1} ${y1} Q ${mx} ${top} ${x2} ${y2}`,
        fill: 'none',
        stroke: c.success,
        'stroke-width': 3,
        pathLength: 1,
        'stroke-dasharray': 1,
        'stroke-dashoffset': 1,
      });
      const label = text(mx, (Math.min(y1, y2) + top) / 2 - 6, t('label.sameKey', 'same K'), { 'text-anchor': 'middle', fill: c.text, 'font-size': fontSizes.xs, 'font-weight': 600 });
      label.style.opacity = '0';
      g.append(path, label);
      later(() => {
        path.style.transition = `stroke-dashoffset ${ms}ms ease-out`;
        path.style.strokeDashoffset = '0';
        label.style.transition = `opacity ${ms}ms ease`;
        label.style.opacity = '1';
      }, 16);
    };

    const requireSetup = (): RoundSetup => {
      if (!setup) throw new Error('tls-handshake-stage: 판이 시작되지 않았다 (reset 전)');
      return setup;
    };

    const api: TlsHandshakeStage = {
      async reset(next, ms) {
        setup = next;
        const old = pieces;
        pieces = [];
        certs.clear();
        sigChip = null;
        heldLeft = null;
        heldRight = null;
        pileNote = null;
        const out = Math.min(200, ms / 3);
        for (const g of old) {
          g.style.transition = `opacity ${out}ms ease`;
          g.style.opacity = '0';
        }
        later(() => {
          for (const g of old) g.remove();
        }, out + 20);
        // 가운데 상자가 선 위로 올라오거나 선 아래로 내려간다 — 판 옮김 운동
        middleOn = next.middle === 1;
        place(middleBox, MID_X, midY(), ms);
        tap.style.transition = `opacity ${ms}ms ease`;
        tap.style.opacity = middleOn ? '0' : '1';
        for (const line of [wireLeft, wireRight]) {
          line.style.transition = `transform ${ms}ms ease, stroke-width ${ms}ms ease`;
          line.style.transform = 'none';
          line.style.strokeWidth = '2';
          line.removeAttribute('stroke-dasharray');
          line.setAttribute('stroke', c.textMuted);
        }
        wireNote.textContent = '';
        clientSecret.textContent = `a ${next.a}`;
        serverSecret.textContent = `b ${next.b}`;
        middleSecret.textContent = `m ${next.m}`;
        publicValue.textContent = `p ${next.p} · g ${next.g}`;
        // 저장소의 뿌리
        storeRoot.replaceChildren();
        next.store.forEach((subject, i) => {
          const cy = STORE_Y + 18 + i * (OPEN_H + 4);
          storeRoot.append(
            el('rect', { x: LEFT_CX - OPEN_W / 2, y: cy - OPEN_H / 2, width: OPEN_W, height: OPEN_H, rx: 4, fill: c.bg, stroke: c.text, 'stroke-width': 1.5 }),
            text(LEFT_CX, cy + 4, subject, { 'text-anchor': 'middle', fill: c.text, 'font-family': fonts.mono, 'font-size': fontSizes.xs }),
          );
        });
        await settle(ms);
      },

      async clientShare(share, intercepted, ms) {
        clientSecret.textContent = `a ${requireSetup().a} · A ${share}`;
        const g = chip(`A ${share}`, 'client', CLIENT_X + BOX_W - CHIP_W / 2, WIRE_Y);
        if (intercepted) {
          // 가운데가 선 위에 앉아 있다 — 그 앞에서 멈춘다
          moveTo(g, MID_X - CHIP_W / 2 - 4, WIRE_Y, ms);
          heldLeft = g;
        } else {
          const r = recvAt('server');
          const run = ms * 0.65;
          moveTo(g, SERVER_X - CHIP_W / 2 - 4, WIRE_Y, run);
          moveTo(g, r.x, r.y, ms - run, run);
          // 가운데를 지나칠 때 사본 하나가 떨어진다
          later(() => {
            const h = handAt(0, HAND_W);
            const copy = chip(`A ${share}`, 'client', MID_CX, WIRE_Y, HAND_W, true);
            moveTo(copy, h.x, h.y, ms - run / 2);
          }, run / 2);
        }
        await settle(ms);
      },

      async middleToServer(held, sent, ms) {
        if (!heldLeft) throw new Error('tls-handshake-stage: 가운데 앞에 멈춘 A 가 없다');
        middleSecret.textContent = `m ${requireSetup().m} · M ${sent}`;
        const h = handAt(0, CHIP_W);
        moveTo(heldLeft, h.x, h.y, ms * 0.4);
        heldLeft.dataset.value = String(held);
        heldLeft = null;
        const g = chip(`M ${sent}`, 'middle', MID_X + MID_W + CHIP_W / 2 - 10, WIRE_Y);
        const r = recvAt('server');
        const run = ms * 0.65;
        moveTo(g, SERVER_X - CHIP_W / 2 - 4, WIRE_Y, run, ms * 0.2);
        moveTo(g, r.x, r.y, ms * 0.8 - run, ms * 0.2 + run);
        await settle(ms);
      },

      async serverShare(share, ms) {
        const s = requireSetup();
        serverSecret.textContent = `b ${s.b} · B ${share}`;
        serverSecret.style.opacity = '0.2';
        later(() => {
          serverSecret.style.transition = `opacity ${ms}ms ease`;
          serverSecret.style.opacity = '1';
        }, 16);
        await settle(ms);
      },

      async serverSign(signature, share, intercepted, ms) {
        const s = requireSetup();
        const startX = SERVER_X + CHIP_W / 2 - 10;
        const b = chip(`B ${share}`, 'server', startX, WIRE_Y);
        const sig = chip(`${signature}`, 'sig', startX, WIRE_Y + 26);
        const docs = s.bundle.map((subject, i) => certPiece(subject, startX - 12 + i * (DOC_W + 6), WIRE_Y + 50, false));
        sigChip = sig;
        const run = ms * 0.65;
        if (intercepted) {
          const stopX = MID_X + MID_W + CHIP_W / 2 + 4;
          moveTo(b, stopX, WIRE_Y, ms);
          moveTo(sig, stopX, WIRE_Y + 26, ms);
          docs.forEach((d, i) => moveTo(d, stopX - 12 + i * (DOC_W + 6), WIRE_Y + 50, ms));
          heldRight = b;
        } else {
          const edge = CLIENT_X + BOX_W + CHIP_W / 2 + 4;
          const r = recvAt('client');
          moveTo(b, edge, WIRE_Y, run);
          moveTo(b, r.x, r.y, ms - run, run);
          moveTo(sig, edge, WIRE_Y + 26, run);
          moveTo(sig, SIG_SPOT.x, SIG_SPOT.y, ms - run, run);
          docs.forEach((d, i) => {
            moveTo(d, edge - 12 + i * (DOC_W + 6), WIRE_Y + 50, run);
            moveTo(d, PILE_X + i * (DOC_W + 6), SIG_SPOT.y, ms - run, run);
          });
          // 지나칠 때 사본이 가운데 손으로
          later(() => {
            const hb = handAt(1, HAND_W);
            const hs = handAt(2, HAND_W);
            moveTo(chip(`B ${share}`, 'server', MID_CX, WIRE_Y, HAND_W, true), hb.x, hb.y, ms - run / 2);
            moveTo(chip(`${signature}`, 'sig', MID_CX, WIRE_Y + 26, HAND_W, true), hs.x, hs.y, ms - run / 2);
            s.bundle.forEach((subject, i) => {
              const d = docAt(i);
              const copy = certPiece(subject, MID_CX, WIRE_Y + 50, true);
              later(() => place(copy, d.x, d.y, ms - run / 2), 16);
            });
          }, run / 2);
          if (s.verify === 0) later(() => (pileNote = note(PILE_X - 8, SIG_SPOT.y + 28, t('label.unopened', 'unopened'), c.textMuted)), ms);
        }
        await settle(ms);
      },

      async middleToClient(held, sent, ms) {
        const s = requireSetup();
        if (!heldRight || !sigChip) throw new Error('tls-handshake-stage: 가운데 앞에 멈춘 B · 서명이 없다');
        const h = handAt(1, CHIP_W);
        moveTo(heldRight, h.x, h.y, ms * 0.4);
        heldRight.dataset.value = String(held);
        heldRight = null;
        // M 이 가운데 왼쪽에서 나와 클라이언트로 — 바꿔 끼워진 값
        const g = chip(`M ${sent}`, 'middle', MID_X - CHIP_W / 2 + 10, WIRE_Y);
        const r = recvAt('client');
        const edge = CLIENT_X + BOX_W + CHIP_W / 2 + 4;
        const run = ms * 0.55;
        moveTo(g, edge, WIRE_Y, run, ms * 0.2);
        moveTo(g, r.x, r.y, ms * 0.8 - run, ms * 0.2 + run);
        // 서명 · 인증서는 가운데를 그대로 지나 클라이언트 앞으로
        moveTo(sigChip, SIG_SPOT.x, SIG_SPOT.y, ms);
        s.bundle.forEach((subject, i) => {
          const cert = certs.get(subject);
          if (!cert) throw new Error(`tls-handshake-stage: 인증서 '${subject}' 가 없다`);
          later(() => place(cert.g, PILE_X + i * (DOC_W + 6), SIG_SPOT.y, ms), 16);
        });
        if (s.verify === 0) later(() => (pileNote = note(PILE_X - 8, SIG_SPOT.y + 28, t('label.unopened', 'unopened'), c.textMuted)), ms);
        await settle(ms);
      },

      async chainCheck(links, ms) {
        if (pileNote) pileNote.textContent = '';
        const rowOf = new Map<string, number>();
        links.forEach((l, i) => rowOf.set(l.subject, CHAIN_Y0 + i * CHAIN_GAP));
        const per = ms / Math.max(1, links.length);
        links.forEach((l, i) => {
          const cert = certs.get(l.subject);
          if (!cert) throw new Error(`tls-handshake-stage: 사슬 칸 '${l.subject}' 의 인증서가 클라이언트에 없다`);
          const y = CHAIN_Y0 + i * CHAIN_GAP;
          later(() => place(cert.g, LEFT_CX, y, per * 0.7), i * per * 0.3 + 16);
          openCert(l.subject, per * 0.7, i * per * 0.3);
          const issuerY = l.fromStore ? STORE_Y + 18 : rowOf.get(l.issuer);
          if (issuerY === undefined) throw new Error(`tls-handshake-stage: 발급자 '${l.issuer}' 의 자리가 없다`);
          later(() => {
            const g = newPiece();
            const x = CLIENT_X + 24;
            const line = el('line', {
              x1: x,
              y1: y + OPEN_H / 2,
              x2: x,
              y2: issuerY - OPEN_H / 2,
              stroke: l.holds ? c.success : c.danger,
              'stroke-width': 3,
              ...(l.holds ? {} : { 'stroke-dasharray': '4 3' }),
            });
            line.style.transformOrigin = `${x}px ${y + OPEN_H / 2}px`;
            line.style.transform = 'scaleY(0)';
            g.append(
              line,
              text(x + 10, (y + issuerY) / 2 + 4, l.holds ? t('label.match', 'match') : t('label.mismatch', 'mismatch'), {
                fill: l.holds ? c.text : c.danger,
                'font-size': fontSizes.xs,
                'font-weight': 600,
              }),
            );
            later(() => {
              line.style.transition = `transform ${per * 0.4}ms ease-out`;
              line.style.transform = 'scaleY(1)';
            }, 16);
          }, i * per * 0.3 + per * 0.6);
        });
        await settle(ms);
      },

      async signCheck(decoded, expected, ok, ms) {
        if (!sigChip) throw new Error('tls-handshake-stage: 클라이언트 앞에 서명이 없다');
        moveTo(sigChip, CLIENT_X + CHIP_W / 2, SIGN_ROW_Y, ms * 0.5);
        const x0 = CLIENT_X + CHIP_W + 16;
        later(() => {
          note(x0, SIGN_ROW_Y + 4, `${t('label.decoded', 'opens to')} ${decoded}`, c.text);
          note(x0 + 140, SIGN_ROW_Y + 4, `${t('label.digest', 'client digest')} ${expected}`, c.text);
          note(x0 + 320, SIGN_ROW_Y + 4, ok ? t('label.match', 'match') : t('label.mismatch', 'mismatch'), ok ? c.success : c.danger);
        }, ms * 0.5);
        if (!ok) {
          // 연결 띠가 끊긴다 — 클라이언트 쪽 반쪽이 오그라들고 점선이 된다
          later(() => {
            wireLeft.style.transition = `transform ${ms * 0.5}ms ease-in`;
            wireLeft.style.transform = 'scaleX(0.12)';
            wireLeft.setAttribute('stroke', c.danger);
            wireLeft.setAttribute('stroke-dasharray', '5 4');
            wireNote.textContent = t('label.broken', 'cut');
            wireNote.setAttribute('fill', c.danger);
          }, ms * 0.5);
        }
        await settle(ms);
      },

      async clientKey(key, ms) {
        const from = recvAt('client');
        const to = keyAt('client');
        moveTo(chip(`K ${key}`, 'key', from.x, from.y), to.x, to.y, ms);
        await settle(ms);
      },

      async serverKey(key, same, open, ms) {
        const from = recvAt('server');
        const to = keyAt('server');
        moveTo(chip(`K ${key}`, 'key', from.x, from.y), to.x, to.y, ms * 0.6);
        later(() => {
          if (same) arc(CLIENT_X + BOX_W / 2, TOP, SERVER_X + BOX_W / 2, TOP, 44, ms * 0.4);
          else note(MID_CX, 30, t('label.differentKey', 'different K'), c.danger, 'middle');
          if (open) {
            for (const line of [wireLeft, wireRight]) {
              line.style.transition = `stroke-width ${ms * 0.4}ms ease`;
              line.style.strokeWidth = '6';
            }
            wireNote.textContent = t('label.open', 'open');
            wireNote.setAttribute('fill', c.text);
          }
        }, ms * 0.6);
        await settle(ms);
      },

      async middleKeys(withClient, withServer, sameAsClient, sameAsServer, ms) {
        const hands = [handAt(0, CHIP_W), handAt(1, CHIP_W)];
        [withClient, withServer].forEach((key, i) => {
          const to = middleKeyAt(i);
          moveTo(chip(`K ${key}`, 'key', hands[i].x, hands[i].y), to.x, to.y, ms * 0.6);
        });
        later(() => {
          const y = midY();
          if (sameAsClient) arc(CLIENT_X + BOX_W / 2 + 20, TOP, MID_X + 40, y, 34, ms * 0.4);
          if (sameAsServer) arc(MID_X + MID_W - 40, y, SERVER_X + BOX_W / 2 - 20, TOP, 34, ms * 0.4);
        }, ms * 0.6);
        await settle(ms);
      },

      caption(content) {
        // 넓은 글자(한중일)는 두 칸으로 센다
        const units = (x: string): number => [...x].reduce((sum, ch) => sum + ((ch.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1), 0);
        if (units(content) <= CAPTION_UNITS) {
          captionLines[0].textContent = content;
          captionLines[1].textContent = '';
          return;
        }
        // 가운데에 가까운 빈칸에서 두 줄로. 빈칸이 없으면 글자 가운데에서
        const chars = [...content];
        const half = units(content) / 2;
        let best = -1;
        let bestGap = Infinity;
        let acc = 0;
        chars.forEach((ch, i) => {
          acc += units(ch);
          if (ch === ' ' && Math.abs(acc - half) < bestGap) {
            bestGap = Math.abs(acc - half);
            best = i;
          }
        });
        if (best < 0) {
          acc = 0;
          best = chars.findIndex((ch) => (acc += units(ch)) >= half);
        }
        captionLines[0].textContent = chars.slice(0, best + 1).join('').trim();
        captionLines[1].textContent = chars.slice(best + 1).join('').trim();
      },

      destroy() {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.replaceChildren();
      },
    };
    return api as unknown as ViewInstance;
  },
};
