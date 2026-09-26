/**
 * certificate-stage — CA 한 곳 · 공격자의 인증서 · 받는 쪽의 확인 줄.
 *
 * 왼쪽 열은 서명하는 쪽(CA · 가짜 뿌리)과 청하는 쪽(주인 · 공격자), 가운데는 CA 에 청한 인증서와 목표 인증서,
 * 오른쪽은 받는 쪽의 확인 줄(저장소 → 서명 확인 → 통과)이다.
 *
 * 운동
 *   준비   — 청하는 쪽 상자에서 인증서가 가운데로 **미끄러져 온다** · 후보 막대가 차오른다 · 짝이면 두 카드 사이에 같은 수가 이어진다
 *   서명   — 서명 토큰이 서명하는 쪽에서 카드로 **건너간다**
 *   위조   — 토큰이 목표 카드로 **옮겨 붙거나**, 둘이 한 자리로 모여 **하나가 된다**(곱하기) · 발급자 열쇠 칩이 서명하는 쪽에서 붙는다
 *   저장소 · 서명 확인 — 위조 인증서의 꾸러미가 확인 줄을 따라 **내려가다 막힌 자리에서 선다**
 *
 * 무대는 셈하지 않는다 — 모든 수는 projector 가 payload 에서 넘긴다. 받은 값이 비면 던진다.
 * 첫 그림(begin)은 멱등이다 — 들어오면 도는 프레임을 끊고 움직이는 층을 비운 뒤 다시 짓는다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
} from '@ffacet/core/runtime';

const W = 760;
const H = 440;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 자리
const LEFT_X = 16;
const LEFT_W = 156;
const CA_Y = 64;
const FAKE_Y = 158;
const SIGNER_H = 78;
const OWNER_Y = 262;
const MALLORY_Y = 330;
const PERSON_H = 56;
const MID_X = 188;
const REQ_Y = 74;
const REQ_W = 160;
const REQ_H = 84;
const REQ_GAP = 8;
const TARGET_X = 188;
const TARGET_Y = 214;
const TARGET_W = 224;
const TARGET_H = 118;
const LINE_X = 524;
// 확인 줄은 청한 인증서 줄 아래에서 시작한다 — 꾸러미가 카드를 덮지 않게
const STATION_Y = { top: 168, store: 196, verify: 282, pass: 362 } as const;
const GATE_X = 588;
const TOKEN_W = 86;
const TOKEN_H = 22;
const PACKET_W = 100;
const PACKET_H = 36;
const CAPTION_Y = 412;

export type CertCard = { subject: string; n: number; e: number; h16: number; value: number };
export type KeyCard = { name: string; n: number; e: number; d: number };

export type CertificateBegin = {
  signTarget: number;
  ca: KeyCard;
  store: { name: string; n: number; e: number };
  owner: { name: string; n: number; e: number };
  mallory: { name: string; n: number };
  target: CertCard;
  triesMax: number;
};

export type CertificatePrepare = {
  forgery: 'multiply' | 'pair' | 'swap' | 'fakeroot';
  tries: number;
  triesMax: number;
  requests: CertCard[];
  pairTarget: CertCard | null;
  pairValue: number | null;
  fake: KeyCard | null;
};

export type CertificateSign = {
  signer: 'ca' | 'fakeRoot';
  targets: ('request0' | 'request1' | 'target')[];
  /** 서명받은 인증서 — 서명한 쪽 n 으로 본 서명받는 수가 value 에 있다 */
  certs: CertCard[];
  signatures: number[];
};

export type CertificateForge = {
  forgery: 'multiply' | 'pair' | 'swap' | 'fakeroot';
  signature: number;
  forged: CertCard;
  presented: { n: number; e: number };
};

export type CertificateStore = {
  signature: number;
  presented: { n: number; e: number };
  store: { n: number; e: number };
  ok: boolean;
};
export type CertificateVerify = { recovered: number; expected: number; ok: boolean };

/** projector 가 보는 무대의 표면. */
export type CertificateStage = {
  reset(): void;
  begin(p: CertificateBegin): void;
  prepare(p: CertificatePrepare, ms: number): void;
  sign(p: CertificateSign, ms: number): void;
  forge(p: CertificateForge, ms: number): void;
  store(p: CertificateStore, ms: number): void;
  verify(p: CertificateVerify, ms: number): void;
  caption(text: string): void;
};

type Job = { id: number | null; finished: boolean; finish(): void };

type CardRefs = { g: SVGGElement; x: number; y: number; w: number; h: number; subject: SVGTextElement; key: SVGTextElement; value: SVGTextElement };

const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export const certificateStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const isInstant = params.isInstant ?? (() => false);
    const SM = parseFloat(fontSizes.sm);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: SVGElement,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };
    const text = (
      parent: SVGElement,
      x: number,
      y: number,
      content: string,
      opts: { size?: string; fill?: string; anchor?: string; mono?: boolean; weight?: number } = {},
    ): SVGTextElement => {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 400,
        },
        parent,
      );
      node.textContent = content;
      return node;
    };
    const place = (g: SVGGElement, x: number, y: number) => g.setAttribute('transform', `translate(${x} ${y})`);

    // ── 고정 틀 (자료와 무관 — 이름표와 확인 줄)
    const frame = el('g', {}, svg);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, frame);
    text(frame, LEFT_X, 40, t('label.signers', 'Who signs'), { fill: c.textMuted, size: fontSizes.xs });
    text(frame, LEFT_X, OWNER_Y - 10, t('label.requesters', 'Who asks'), { fill: c.textMuted, size: fontSizes.xs });
    text(frame, GATE_X, STATION_Y.top - 8, t('label.verifier', 'Receiver'), { fill: c.textMuted, size: fontSizes.xs });
    el('line', { x1: LINE_X, y1: STATION_Y.top, x2: LINE_X, y2: STATION_Y.pass, stroke: c.border, 'stroke-width': 2 }, frame);
    const stationRing = (y: number) => el('circle', { cx: LINE_X, cy: y, r: 9, fill: c.bg, stroke: c.border, 'stroke-width': 2 }, frame);
    const rings = { store: stationRing(STATION_Y.store), verify: stationRing(STATION_Y.verify), pass: stationRing(STATION_Y.pass) };
    text(frame, GATE_X, STATION_Y.store - 20, t('label.store', 'Trust store'), { weight: 600 });
    text(frame, GATE_X, STATION_Y.verify - 20, t('label.verify', 'Signature check'), { weight: 600 });
    text(frame, GATE_X, STATION_Y.pass - 20, t('label.pass', 'Accepted'), { weight: 600 });
    const caption = text(frame, W / 2, CAPTION_Y, '', { anchor: 'middle', size: fontSizes.sm });

    // ── 움직이는 층 (begin 마다 비우고 다시 짓는다)
    let layer = el('g', {}, svg);

    const pending = new Set<Job>();
    const tween = (ms: number, draw: (k: number) => void, done?: () => void): void => {
      const job: Job = {
        id: null,
        finished: false,
        finish() {
          if (job.finished) return;
          job.finished = true;
          if (job.id !== null) cancelAnimationFrame(job.id);
          pending.delete(job);
          draw(1);
          done?.();
        },
      };
      if (ms <= 0 || isInstant()) {
        job.finish();
        return;
      }
      pending.add(job);
      const start = performance.now();
      const frameFn = (now: number) => {
        if (job.finished) return;
        const k = (now - start) / ms;
        if (k >= 1) {
          job.id = null;
          job.finish();
          return;
        }
        draw(ease(Math.max(0, k)));
        job.id = requestAnimationFrame(frameFn);
      };
      job.id = requestAnimationFrame(frameFn);
    };
    /** 앞 걸음의 운동을 끝 상태로 마무리한다 — 걸음이 넘어갔는데 앞 운동이 늦게 끝나며 새 걸음을 덮지 않게. */
    const flush = () => {
      for (const job of [...pending]) job.finish();
    };
    /** 도는 운동을 끝 상태로 가지 않고 끊는다 — 판을 비울 때. */
    const cancelAll = () => {
      for (const job of pending) {
        job.finished = true;
        if (job.id !== null) cancelAnimationFrame(job.id);
      }
      pending.clear();
    };
    params.onScrubStart?.(() => cancelAll());

    // ── 판 상태
    let mode: number | null = null;
    let caBox: { x: number; y: number } | null = null;
    let fakeBox: { g: SVGGElement; x: number; y: number } | null = null;
    let requesterAt: { owner: { x: number; y: number }; mallory: { x: number; y: number } } | null = null;
    let reqCards: CardRefs[] = [];
    let target: (CardRefs & { role: SVGTextElement }) | null = null;
    let counter: { label: SVGTextElement; bar: SVGRectElement } | null = null;
    let tokens: { g: SVGGElement; x: number; y: number }[] = [];
    let packet: { g: SVGGElement; x: number; y: number } | null = null;
    let gateText: { store: SVGTextElement; storeVerdict: SVGTextElement; verify: SVGTextElement; verifyVerdict: SVGTextElement; pass: SVGTextElement } | null =
      null;

    const need = <T>(v: T | null, what: string): T => {
      if (v === null) throw new Error(`certificate-stage: ${what} 없이 불렸다 (begin 이 먼저)`);
      return v;
    };

    const valueText = (card: CertCard | { h16: number; value: number }, value: number): string => {
      const m = need(mode, 'mode');
      if (m === 0) return t('card.doc', 'number {v}', { v: value });
      if (m === 1) return t('card.digest', 'digest {v} (H {h})', { v: value, h: card.h16.toString(16).padStart(4, '0') });
      throw new Error(`certificate-stage: 모르는 서명 대상 ${m}`);
    };

    const drawCard = (parent: SVGElement, x: number, y: number, w: number, h: number, card: CertCard, role: string, strong: boolean) => {
      const g = el('g', {}, parent);
      place(g, x, y);
      el('rect', { x: 0, y: 0, width: w, height: h, rx: 6, fill: c.bgSubtle, stroke: strong ? c.text : c.border, 'stroke-width': strong ? 2 : 1 }, g);
      const roleText = text(g, 10, 16, role, { size: fontSizes.xs, fill: c.textMuted });
      // 좁은 카드(청한 인증서)는 한 단 작은 글자 — 가장 긴 줄(이름 · 요약)이 폭 안에 들게
      const size = strong ? fontSizes.sm : fontSizes.xs;
      const subject = text(g, 10, 34, card.subject, { mono: true, size });
      const key = text(g, 10, 52, `(${card.n}, ${card.e})`, { mono: true, size });
      const value = text(g, 10, 70, valueText(card, card.value), { mono: true, fill: c.text, size });
      return { g, x, y, w, h, subject, key, value, role: roleText };
    };

    const setCard = (card: CardRefs, v: CertCard) => {
      card.subject.textContent = v.subject;
      card.key.textContent = `(${v.n}, ${v.e})`;
      card.value.textContent = valueText(v, v.value);
    };

    const drawToken = (x: number, y: number, s: number, fill: string) => {
      const g = el('g', {}, layer);
      place(g, x, y);
      el('rect', { x: 0, y: 0, width: TOKEN_W, height: TOKEN_H, rx: TOKEN_H / 2, fill, stroke: c.bg, 'stroke-width': 1 }, g);
      text(g, TOKEN_W / 2, TOKEN_H / 2 + SM / 2 - 2, t('label.sig', 'sig {s}', { s }), { anchor: 'middle', fill: c.textInverse, mono: true });
      return { g, x, y };
    };
    const move = (item: { g: SVGGElement; x: number; y: number }, x: number, y: number, ms: number, done?: () => void) => {
      const fx = item.x;
      const fy = item.y;
      item.x = x;
      item.y = y;
      tween(ms, (k) => place(item.g, lerp(fx, x, k), lerp(fy, y, k)), done);
    };
    const slotOf = (which: 'request0' | 'request1' | 'target'): { x: number; y: number } => {
      if (which === 'target') {
        const tg = need(target, 'target');
        return { x: tg.x + tg.w - TOKEN_W - 10, y: tg.y + tg.h - TOKEN_H / 2 };
      }
      const card = reqCards[which === 'request0' ? 0 : 1];
      if (!card) throw new Error(`certificate-stage: ${which} 카드가 없다`);
      return { x: card.x + card.w / 2 - TOKEN_W / 2, y: card.y + card.h - TOKEN_H / 2 };
    };

    const reset = () => {
      cancelAll();
      layer.remove();
      layer = el('g', {}, svg);
      mode = null;
      caBox = null;
      fakeBox = null;
      requesterAt = null;
      reqCards = [];
      target = null;
      counter = null;
      tokens = [];
      packet = null;
      gateText = null;
      for (const ring of Object.values(rings)) {
        ring.setAttribute('fill', c.bg);
        ring.setAttribute('stroke', c.border);
      }
      caption.textContent = '';
    };

    const keyBox = (x: number, y: number, role: string, k: KeyCard, strong: boolean) => {
      const g = el('g', {}, layer);
      place(g, x, y);
      el('rect', { x: 0, y: 0, width: LEFT_W, height: SIGNER_H, rx: 6, fill: c.bgSubtle, stroke: strong ? c.text : c.danger, 'stroke-width': 2 }, g);
      text(g, 10, 16, role, { size: fontSizes.xs, fill: c.textMuted });
      text(g, 10, 34, k.name, { mono: true, weight: 600 });
      text(g, 10, 52, `n ${k.n} · e ${k.e}`, { mono: true });
      text(g, 10, 70, `d ${k.d}`, { mono: true, fill: c.textMuted });
      return g;
    };

    const begin = (p: CertificateBegin) => {
      reset();
      mode = p.signTarget;
      caBox = { x: LEFT_X, y: CA_Y };
      keyBox(LEFT_X, CA_Y, t('label.ca', 'CA'), p.ca, true);

      const person = (y: number, role: string, name: string, key: string) => {
        const g = el('g', {}, layer);
        place(g, LEFT_X, y);
        el('rect', { x: 0, y: 0, width: LEFT_W, height: PERSON_H, rx: 6, fill: c.bg, stroke: c.border, 'stroke-width': 1 }, g);
        text(g, 10, 16, role, { size: fontSizes.xs, fill: c.textMuted });
        text(g, 10, 33, name, { mono: true });
        text(g, 10, 49, key, { mono: true, fill: c.textMuted });
      };
      person(OWNER_Y, t('label.owner', 'Owner'), p.owner.name, `(${p.owner.n}, ${p.owner.e})`);
      person(MALLORY_Y, t('label.mallory', 'Attacker'), p.mallory.name, `n ${p.mallory.n}`);
      requesterAt = { owner: { x: LEFT_X, y: OWNER_Y }, mallory: { x: LEFT_X, y: MALLORY_Y } };

      // 후보 막대 — 자리는 늘 있고, 값은 준비 걸음이 채운다
      const cg = el('g', {}, layer);
      const label = text(cg, MID_X, 40, t('label.tries', 'Forger tries {n}', { n: 0 }), { fill: c.textMuted, size: fontSizes.xs });
      el('rect', { x: MID_X, y: 48, width: REQ_W * 2 + REQ_GAP, height: 6, rx: 3, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1 }, cg);
      const bar = el('rect', { x: MID_X, y: 48, width: 0, height: 6, rx: 3, fill: c.itemComparing }, cg);
      counter = { label, bar };

      const tg = drawCard(layer, TARGET_X, TARGET_Y, TARGET_W, TARGET_H, p.target, t('label.target', 'Target'), true);
      target = tg;

      // 저장소 항목 — 걸음 0 에 이미 있다
      const gl = el('g', {}, layer);
      text(gl, GATE_X, STATION_Y.store - 4, p.store.name, { mono: true, fill: c.textMuted });
      text(gl, GATE_X, STATION_Y.store + 12, `(${p.store.n}, ${p.store.e})`, { mono: true, fill: c.textMuted });
      gateText = {
        store: text(gl, GATE_X, STATION_Y.store + 30, '', { mono: true, size: fontSizes.xs }),
        storeVerdict: text(gl, GATE_X, STATION_Y.store + 48, '', { weight: 700 }),
        verify: text(gl, GATE_X, STATION_Y.verify + 4, '', { size: fontSizes.xs }),
        verifyVerdict: text(gl, GATE_X, STATION_Y.verify + 22, '', { weight: 700 }),
        pass: text(gl, GATE_X, STATION_Y.pass + 4, '', { weight: 700 }),
      };
    };

    const prepare = (p: CertificatePrepare, ms: number) => {
      flush();
      const cnt = need(counter, 'counter');
      const who = need(requesterAt, 'requesterAt');
      if (p.triesMax > 0) {
        const full = REQ_W * 2 + REQ_GAP;
        tween(ms, (k) => {
          cnt.label.textContent = t('label.tries', 'Forger tries {n}', { n: Math.round(p.tries * k) });
          cnt.bar.setAttribute('width', String((full * p.tries * k) / p.triesMax));
        });
      }
      const from = p.forgery === 'swap' ? who.owner : who.mallory;
      reqCards = p.requests.map((card, i) => {
        const x = MID_X + i * (REQ_W + REQ_GAP);
        const refs = drawCard(layer, from.x, from.y, REQ_W, REQ_H, card, t('label.request', 'Sent to the CA'), false);
        const item = { g: refs.g, x: from.x, y: from.y };
        move(item, x, REQ_Y, ms);
        refs.x = x;
        refs.y = REQ_Y;
        return refs;
      });
      if (p.pairTarget) {
        const tg = need(target, 'target');
        const pt = p.pairTarget;
        const req = reqCards[0];
        if (!req || p.pairValue === null) throw new Error('certificate-stage: 짝의 한쪽이나 값이 없다');
        setCard(tg, pt);
        // 짝지어진다 — 같은 서명받는 수 두 줄을 잇는 선이 자라난다
        // 두 카드 사이 빈자리에서 잇는다 — 카드 글자를 가로지르지 않게
        const x1 = req.x + req.w - 16;
        const y1 = req.y + req.h;
        const x2 = x1;
        const y2 = tg.y;
        const link = el('line', { x1, y1, x2: x1, y2: y1, stroke: c.itemComparing, 'stroke-width': 2, 'stroke-dasharray': '4 3' }, layer);
        const eq = text(layer, x1 + 8, (y1 + y2) / 2 + 4, `= ${p.pairValue}`, { mono: true, fill: c.itemComparing, weight: 700 });
        eq.setAttribute('opacity', '0');
        req.value.setAttribute('fill', c.itemComparing);
        tg.value.setAttribute('fill', c.itemComparing);
        tween(ms, (k) => {
          link.setAttribute('x2', String(lerp(x1, x2, k)));
          link.setAttribute('y2', String(lerp(y1, y2, k)));
          eq.setAttribute('opacity', String(k));
        });
      }
      if (p.fake) {
        const g = keyBox(who.mallory.x, who.mallory.y, t('label.fakeRoot', 'Fake root'), p.fake, false);
        const item = { g, x: who.mallory.x, y: who.mallory.y };
        move(item, LEFT_X, FAKE_Y, ms);
        fakeBox = { g, x: LEFT_X, y: FAKE_Y };
      }
    };

    const sign = (p: CertificateSign, ms: number) => {
      flush();
      if (p.targets.length !== p.signatures.length || p.certs.length !== p.signatures.length) {
        throw new Error('certificate-stage: 서명 목록의 길이가 맞지 않는다');
      }
      const from = p.signer === 'ca' ? need(caBox, 'caBox') : need(fakeBox, 'fakeBox');
      const fill = p.signer === 'ca' ? c.primary : c.danger;
      tokens = p.signatures.map((s, i) => {
        const which = p.targets[i]!;
        // 가짜 뿌리는 목표에 직접 서명한다 — 제 n 으로 줄인 서명받는 수가 카드에 뜬다
        if (which === 'target') setCard(need(target, 'target'), p.certs[i]!);
        const tok = drawToken(from.x + LEFT_W - TOKEN_W - 8, from.y + SIGNER_H - TOKEN_H - 6, s, fill);
        const to = slotOf(which);
        move(tok, to.x, to.y, ms);
        return tok;
      });
    };

    const forge = (p: CertificateForge, ms: number) => {
      flush();
      const tg = need(target, 'target');
      setCard(tg, p.forged);
      tg.role.textContent = t('label.forged', 'Forged certificate');
      const slot = slotOf('target');
      if (p.forgery === 'multiply') {
        if (tokens.length !== 2) throw new Error('certificate-stage: 곱하기인데 서명 토큰이 둘이 아니다');
        const [a, b] = tokens as [(typeof tokens)[0], (typeof tokens)[0]];
        // 둘이 한 자리로 모여 하나가 된다
        move(a, slot.x, slot.y, ms);
        move(b, slot.x, slot.y, ms, () => {
          b.g.remove();
          const label = a.g.querySelector('text');
          if (!label) throw new Error('certificate-stage: 토큰 글자가 없다');
          label.textContent = t('label.sig', 'sig {s}', { s: p.signature });
        });
        tokens = [a];
      } else {
        const tok = tokens[0];
        if (!tok || tokens.length !== 1) throw new Error('certificate-stage: 옮겨 붙일 서명 토큰이 하나가 아니다');
        move(tok, slot.x, slot.y, ms);
      }
      // 발급자 열쇠 칩 — 서명한 쪽에서 날아와 붙는다
      const from = p.forgery === 'fakeroot' ? need(fakeBox, 'fakeBox') : need(caBox, 'caBox');
      const g = el('g', {}, layer);
      const cw = 150;
      el('rect', { x: 0, y: 0, width: cw, height: 20, rx: 4, fill: c.bg, stroke: p.forgery === 'fakeroot' ? c.danger : c.text, 'stroke-width': 1.5 }, g);
      text(g, cw / 2, 14, t('label.issuer', 'issuer ({n}, {e})', { n: p.presented.n, e: p.presented.e }), { anchor: 'middle', mono: true, size: fontSizes.xs });
      const item = { g, x: from.x + 20, y: from.y + 20 };
      place(g, item.x, item.y);
      move(item, tg.x + 10, tg.y + 80, ms);
    };

    const setRing = (which: 'store' | 'verify' | 'pass', fill: string, stroke: string) => {
      rings[which].setAttribute('fill', fill);
      rings[which].setAttribute('stroke', stroke);
    };

    const store = (p: CertificateStore, ms: number) => {
      flush();
      const tg = need(target, 'target');
      const gt = need(gateText, 'gateText');
      // 위조 인증서의 꾸러미 — 서명과 발급자 열쇠를 들고 확인 줄로 간다
      const g = el('g', {}, layer);
      el('rect', { x: 0, y: 0, width: PACKET_W, height: PACKET_H, rx: 6, fill: c.bg, stroke: c.text, 'stroke-width': 2 }, g);
      text(g, PACKET_W / 2, 15, t('label.sig', 'sig {s}', { s: p.signature }), { anchor: 'middle', mono: true, size: fontSizes.xs });
      text(g, PACKET_W / 2, 29, `(${p.presented.n}, ${p.presented.e})`, { anchor: 'middle', mono: true, size: fontSizes.xs });
      const item = { g, x: tg.x + tg.w / 2 - PACKET_W / 2, y: tg.y + tg.h / 2 - PACKET_H / 2 };
      place(g, item.x, item.y);
      const cmp = p.ok ? '=' : '≠';
      gt.store.textContent = `(${p.presented.n}, ${p.presented.e}) ${cmp} (${p.store.n}, ${p.store.e})`;
      gt.store.setAttribute('opacity', '0');
      move(item, LINE_X - PACKET_W / 2, STATION_Y.store - PACKET_H / 2, ms, () => {
        gt.store.setAttribute('opacity', '1');
        if (p.ok) {
          setRing('store', c.bg, c.text);
          gt.storeVerdict.textContent = t('label.through', 'Passed');
          gt.storeVerdict.setAttribute('fill', c.text);
        } else {
          setRing('store', c.danger, c.danger);
          gt.storeVerdict.textContent = t('label.blocked', 'Stopped here');
          gt.storeVerdict.setAttribute('fill', c.danger);
        }
      });
      packet = item;
    };

    const verify = (p: CertificateVerify, ms: number) => {
      flush();
      const gt = need(gateText, 'gateText');
      const item = need(packet, 'packet');
      gt.verify.textContent = t('label.recovered', 'opened {r} · signed value {x}', { r: p.recovered, x: p.expected });
      gt.verify.setAttribute('opacity', '0');
      const half = p.ok ? ms / 2 : ms;
      move(item, item.x, STATION_Y.verify - PACKET_H / 2, half, () => {
        gt.verify.setAttribute('opacity', '1');
        if (p.ok) {
          setRing('verify', c.bg, c.text);
          gt.verifyVerdict.textContent = t('label.through', 'Passed');
          gt.verifyVerdict.setAttribute('fill', c.text);
          move(item, item.x, STATION_Y.pass - PACKET_H / 2, ms - half, () => {
            setRing('pass', c.accent, c.text);
            gt.pass.textContent = t('label.accepted', 'Made it through');
          });
        } else {
          setRing('verify', c.danger, c.danger);
          gt.verifyVerdict.textContent = t('label.blocked', 'Stopped here');
          gt.verifyVerdict.setAttribute('fill', c.danger);
        }
      });
    };

    const instance: ViewInstance & CertificateStage = {
      reset,
      begin,
      prepare,
      sign,
      forge,
      store,
      verify,
      caption(s: string) {
        caption.textContent = s;
      },
      destroy() {
        cancelAll();
        svg.replaceChildren();
      },
    };
    return instance;
  },
};
