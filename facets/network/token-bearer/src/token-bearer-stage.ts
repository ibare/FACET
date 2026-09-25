/**
 * 베어러 토큰의 무대.
 *
 * 위쪽에 손 셋(발급 서버 · 앱 · 훔친 쪽)이 나란히 서고, 토큰 카드가 손에서 손으로 건너간다.
 * 가운데를 가로지르는 벽에는 읽개 틈과 문이 있다. 요청 쪽지가 손에서 벽으로 내려오면
 * 토큰 글자만 틈으로 떨어지고, 보낸 곳이 적힌 나머지는 벽 바깥에 남는다. 문은 틈에 든
 * 글자를 발급 기록과 맞춰 보고 열리거나 닫힌 채 남는다. 벽 아래 기록 표가 문이 읽은 것을
 * 줄마다 남긴다 — 보낸 곳은 흐리게, 읽은 토큰과 판정은 또렷하게.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { HolderId } from './algorithm.js';
import type { DoorRecord, TokenBearerScene } from './scene.js';

const H = 440;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 고정폭 글자의 폭 비율 — 글자 크기는 토큰에서 온다. */
const MONO_RATIO = 0.6;
const XS = parseFloat(fontSizes.xs);
const SM = parseFloat(fontSizes.sm);
const MD = parseFloat(fontSizes.md);

type Party = 'issuer' | HolderId;
const PARTIES: readonly Party[] = ['issuer', 'app', 'attacker'];
const PARTY_CX: Record<Party, number> = { issuer: W / 6, app: W / 2, attacker: (W * 5) / 6 };

const CLOCK_Y = 18;
const NAME_Y = 40;
const ADDR_Y = 57;
const HAND_Y = 66;
const HAND_H = 30;

const WALL_Y = 214;
const WALL_H = 34;
const DOOR_W = 96;
/** 열린 문 판이 오른쪽 벽 뒤로 다 숨도록 오른쪽 벽을 문 폭보다 넓게 둔다. */
const DOOR_X = W - 16 - 2 * DOOR_W;

const LEDGER_Y = 264;
const LEDGER_H = 58;
const LOG_HEAD_Y = 344;
const LOG_ROW0 = 363;
const LOG_BOTTOM = 392;
const CAPTION_Y1 = 414;
const CAPTION_Y2 = 432;

/** 토큰 글자를 떨군 쪽지의 나머지 — 벽 바깥에 흐리게 남는다 */
const REST_OPACITY = 0.55;

const MS_HAND = 620;
const MS_SLIDE = 520;
const MS_DROP = 300;
const MS_DOOR = 330;

type Attrs = Record<string, string | number>;

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

function narrowScene(v: unknown): TokenBearerScene | null {
  if (typeof v !== 'object' || v === null) return null;
  if (!('holding' in v) || !('ledger' in v) || !('log' in v)) return null;
  return v as TokenBearerScene;
}

/** 걸음 하나를 흘릴 때 손대는 것들. 정적 그리기가 매번 새로 만든다. */
type Handles = {
  cards: Map<HolderId, SVGGElement>;
  slipRest: SVGGElement | null;
  readToken: SVGTextElement | null;
  panel: SVGRectElement | null;
  status: SVGTextElement | null;
  link: SVGLineElement | null;
  ledgerMark: SVGRectElement | null;
  newRow: SVGGElement | null;
  /** 쪽지에서 토큰 글자가 앉는 자리 − 읽개 틈에서 앉는 자리 */
  dropDx: number;
  dropDy: number;
  /** 쪽지 안 토큰 글자의 바닥선 */
  slipTokenY: number;
};

export const tokenBearerStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }) {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Attrs,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    }

    function write(parent: Element, x: number, y: number, s: string, attrs: Attrs): SVGTextElement {
      const node = el('text', { x: r2(x), y: r2(y), ...attrs }, parent);
      node.textContent = s;
      return node;
    }

    function roleName(id: Party | 'api'): string {
      if (id === 'issuer') return t('label.issuer', 'Issuer');
      if (id === 'app') return t('label.app', 'App');
      if (id === 'attacker') return t('label.attacker', 'Thief');
      return t('label.api', 'API server');
    }

    function monoW(s: string, px: number): number {
      return s.length * px * MONO_RATIO;
    }

    /** 손 자리의 폭 — 토큰 글자가 들어갈 만큼, 세 칸이 부딪히지 않을 만큼. */
    function handW(chars: number): number {
      return Math.min(W / 3 - 20, chars * SM * MONO_RATIO + 22);
    }

    /** 요청 쪽지가 벽 앞에 멈추는 자리. 토큰 글자가 읽개 틈 바로 위에 온다. */
    function slipLayout(scene: TokenBearerScene, token: string) {
      const pad = 8;
      const prefixW = monoW(`${scene.authPrefix} `, XS);
      const tokenW = monoW(token, XS);
      const width = pad * 2 + Math.max(prefixW + tokenW, monoW(scene.requestLine, XS));
      const height = 58;
      const x = W / 2 - tokenW / 2 - pad - prefixW;
      const y = WALL_Y - 14 - height;
      return { pad, prefixW, tokenW, width, height, x, y, tokenX: x + pad + prefixW, tokenY: y + 48 };
    }

    function readerBox(chars: number) {
      const w = chars * XS * MONO_RATIO + 20;
      return { x: W / 2 - w / 2, y: WALL_Y + 7, w, h: WALL_H - 14 };
    }

    function drawCard(layer: Element, cx: number, token: string): SVGGElement {
      const g = el('g', {}, layer);
      const w = handW(token.length);
      el(
        'rect',
        {
          x: r2(cx - w / 2),
          y: HAND_Y,
          width: r2(w),
          height: HAND_H,
          rx: 5,
          fill: colors.bg,
          stroke: colors.accent,
          'stroke-width': 2,
        },
        g,
      );
      write(g, cx, HAND_Y + HAND_H / 2 + SM / 3, token, {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      return g;
    }

    function drawStatic(scene: TokenBearerScene): Handles {
      svg.textContent = '';
      const h: Handles = {
        cards: new Map(),
        slipRest: null,
        readToken: null,
        panel: null,
        status: null,
        link: null,
        ledgerMark: null,
        newRow: null,
        dropDx: 0,
        dropDy: 0,
        slipTokenY: 0,
      };
      const step = scene.step;
      const reading = step !== null && step.kind === 'request' ? step : null;
      const tokenChars = Math.max(0, ...scene.ledger.map((e) => e.token.length), ...scene.holding.map((e) => e.token.length), ...scene.log.map((e) => e.token.length));

      el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }, svg);

      if (scene.now !== null) {
        write(svg, W - 12, CLOCK_Y, t('label.clock', 't = {now} s', { now: scene.now }), {
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
      }

      // 손 셋 — 이름 · 주소 · 손 자리
      for (const party of PARTIES) {
        const cx = PARTY_CX[party];
        write(svg, cx, NAME_Y, roleName(party), {
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.md,
          'font-weight': 600,
          fill: colors.text,
        });
        if (party !== 'issuer') {
          write(svg, cx, ADDR_Y, scene.addresses[party], {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: colors.textMuted,
          });
        }
        const w = handW(tokenChars);
        el(
          'rect',
          {
            x: r2(cx - w / 2),
            y: HAND_Y,
            width: r2(w),
            height: HAND_H,
            rx: 5,
            fill: 'none',
            stroke: colors.border,
            'stroke-dasharray': '4 4',
          },
          svg,
        );
      }
      const cardLayer = el('g', {}, svg);
      for (const held of scene.holding) {
        h.cards.set(held.holder, drawCard(cardLayer, PARTY_CX[held.holder], held.token));
      }

      // 벽 — 문 판은 벽보다 먼저 그려 열리면 오른쪽 벽 뒤로 숨는다
      const open = reading !== null && reading.status === 200;
      const panel = el(
        'rect',
        {
          x: DOOR_X,
          y: WALL_Y + 2,
          width: DOOR_W,
          height: WALL_H - 4,
          fill: colors.textMuted,
          stroke: colors.text,
          'stroke-width': 1,
        },
        svg,
      );
      if (open) panel.setAttribute('transform', `translate(${DOOR_W} 0)`);
      h.panel = panel;
      el('rect', { x: 0, y: WALL_Y, width: DOOR_X, height: WALL_H, fill: colors.border }, svg);
      el(
        'rect',
        { x: DOOR_X + DOOR_W, y: WALL_Y, width: W - DOOR_X - DOOR_W, height: WALL_H, fill: colors.border },
        svg,
      );

      const rb = readerBox(reading !== null ? reading.token.length : tokenChars);
      el(
        'rect',
        {
          x: r2(rb.x),
          y: rb.y,
          width: r2(rb.w),
          height: rb.h,
          rx: 3,
          fill: colors.bg,
          stroke: reading !== null ? colors.accent : colors.textMuted,
          'stroke-width': reading !== null ? 2 : 1,
        },
        svg,
      );

      if (reading !== null) {
        const good = reading.status === 200;
        const statusColor = good ? colors.success : colors.danger;
        // 열리면 빈 문간에, 닫힌 채면 문 판 위에 판정을 적는다
        if (!good) panel.setAttribute('fill', statusColor);
        h.status = write(svg, DOOR_X + DOOR_W / 2, WALL_Y + WALL_H / 2 + MD / 3, String(reading.status), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          'font-weight': 700,
          fill: good ? statusColor : colors.bg,
        });

        // 쪽지 — 토큰 글자를 뺀 나머지가 벽 바깥에 남는다
        const sl = slipLayout(scene, reading.token);
        const rest = el('g', { opacity: REST_OPACITY }, svg);
        el(
          'rect',
          {
            x: r2(sl.x),
            y: r2(sl.y),
            width: r2(sl.width),
            height: sl.height,
            rx: 4,
            fill: colors.bgSubtle,
            stroke: colors.border,
          },
          rest,
        );
        write(rest, sl.x + sl.pad, sl.y + 16, t('label.from', 'From: {addr}', { addr: scene.addresses[reading.from] }), {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        write(rest, sl.x + sl.pad, sl.y + 32, scene.requestLine, {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        write(rest, sl.x + sl.pad, sl.tokenY, scene.authPrefix, {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        h.slipRest = rest;

        const readY = rb.y + rb.h / 2 + XS / 3;
        h.readToken = write(svg, W / 2, readY, reading.token, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': 600,
          fill: colors.text,
        });
        h.dropDx = r2(sl.tokenX + sl.tokenW / 2 - W / 2);
        h.dropDy = r2(sl.tokenY - readY);
        h.slipTokenY = sl.tokenY;

        h.link = el(
          'line',
          {
            x1: r2(W / 2),
            y1: WALL_Y + WALL_H,
            x2: r2(W / 2),
            y2: LEDGER_Y,
            stroke: colors.accent,
            'stroke-width': 2,
          },
          svg,
        );
      }

      // 발급 기록 — 문 안쪽
      write(svg, 16, LEDGER_Y + 20, roleName('api'), {
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        'font-weight': 600,
        fill: colors.text,
      });
      const ledgerW = Math.min(240, W - 2 * 150);
      const lx = W / 2 - ledgerW / 2;
      el(
        'rect',
        { x: r2(lx), y: LEDGER_Y, width: r2(ledgerW), height: LEDGER_H, rx: 4, fill: colors.bgSubtle, stroke: colors.border },
        svg,
      );
      write(svg, lx + 8, LEDGER_Y + 14, t('label.ledger', 'Issued tokens'), {
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      const rowGapL = scene.ledger.length > 0 ? Math.min(36, (LEDGER_H - 20) / scene.ledger.length) : 0;
      scene.ledger.forEach((rec, i) => {
        const y = LEDGER_Y + 20 + i * rowGapL;
        if (reading !== null && reading.reason !== 'unknown' && rec.token === reading.token) {
          h.ledgerMark = el(
            'rect',
            {
              x: r2(lx + 3),
              y: r2(y),
              width: r2(ledgerW - 6),
              height: r2(rowGapL - 2),
              rx: 3,
              fill: 'none',
              stroke: colors.accent,
              'stroke-width': 2,
            },
            svg,
          );
        }
        write(svg, lx + 8, y + 14, rec.token, {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        write(svg, lx + 8, y + 29, t('label.record', 'Subject: {sub} · Expires: t={exp} s', { sub: rec.subject, exp: rec.expiresAt }), {
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      });

      // 문이 읽은 것의 기록
      const addrChars = Math.max(scene.addresses.app.length, scene.addresses.attacker.length);
      const tableW = (addrChars + tokenChars + 3) * XS * MONO_RATIO + 90;
      const colFrom = (W - tableW) / 2;
      const colToken = colFrom + addrChars * XS * MONO_RATIO + 40;
      const colStatus = colToken + tokenChars * XS * MONO_RATIO + 50;
      const head = { 'font-family': fonts.body, 'font-size': fontSizes.xs, fill: colors.textMuted };
      if (scene.log.length > 0) {
        write(svg, colFrom, LOG_HEAD_Y, t('label.colFrom', 'From'), head);
        write(svg, colToken, LOG_HEAD_Y, t('label.colToken', 'Token the door read'), head);
        write(svg, colStatus, LOG_HEAD_Y, t('label.colStatus', 'Status'), head);
      }
      const rowGap = Math.min(18, (LOG_BOTTOM - LOG_ROW0) / Math.max(1, scene.log.length - 1));
      scene.log.forEach((rec: DoorRecord, i) => {
        const g = el('g', {}, svg);
        const y = LOG_ROW0 + i * rowGap;
        write(g, colFrom, y, scene.addresses[rec.from], {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        write(g, colToken, y, rec.token, {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.text,
        });
        write(g, colStatus, y, String(rec.status), {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          'font-weight': 700,
          fill: rec.status === 200 ? colors.success : colors.danger,
        });
        if (reading !== null && i === scene.log.length - 1) h.newRow = g;
      });

      // 캡션 — 지금 일어나는 일
      const [line1, line2] = captionOf(scene);
      const cap = { 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: colors.text };
      write(svg, W / 2, CAPTION_Y1, line1, cap);
      if (line2 !== '') write(svg, W / 2, CAPTION_Y2, line2, { ...cap, fill: colors.textMuted });

      return h;
    }

    function captionOf(scene: TokenBearerScene): [string, string] {
      const step = scene.step;
      if (step === null) return [t('caption.start', 'Nobody holds a token yet.'), ''];
      if (step.kind === 'issue') {
        return [
          t('caption.issue', 'The issuer hands a token to {to}.', { to: roleName(step.to) }),
          t('caption.expires', 'Expires at: t={exp} s', { exp: step.expiresAt }),
        ];
      }
      if (step.kind === 'leak') {
        return [
          t('caption.leak', 'A copy of the token passes from {from} to {to}. {from} still holds it.', {
            from: roleName(step.from),
            to: roleName(step.to),
          }),
          t('caption.holders', 'Holders: {n}', { n: step.holders }),
        ];
      }
      const first = t('caption.request', 'Request from {from}, address {addr}. The door reads the token.', {
        from: roleName(step.from),
        addr: scene.addresses[step.from],
      });
      if (step.reason === 'valid') {
        return [first, t('caption.valid', 'Status: {status} · on record · time left: {left} s', { status: step.status, left: step.left })];
      }
      if (step.reason === 'expired') {
        return [first, t('caption.expired', 'Status: {status} · expired · overdue: {over} s', { status: step.status, over: -step.left })];
      }
      return [first, t('caption.unknown', 'Status: {status} · not on record', { status: step.status })];
    }

    /** ms 동안 frame(0..1) 을 흘린다. destroy 나 새 render 가 오면 곧바로 풀린다. */
    function flow(ms: number, mine: number, frame: (k: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = () => {
          if (destroyed || mine !== gen) return finish();
          const k = Math.min(1, (Date.now() - start) / ms);
          frame(ease(k));
          if (k >= 1) return finish();
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function alive(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    function place(node: Element | null, dx: number, dy: number): void {
      if (node === null) return;
      if (dx === 0 && dy === 0) node.removeAttribute('transform');
      else node.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
    }

    /** 카드 하나가 한 손에서 다른 손으로 건너간다 — 살짝 떠올랐다 내려앉는 호. */
    async function handOver(card: SVGGElement | undefined, from: Party, to: Party, mine: number) {
      if (card === undefined) return;
      const dx0 = PARTY_CX[from] - PARTY_CX[to];
      place(card, dx0, 0);
      await flow(MS_HAND, mine, (k) => {
        place(card, dx0 * (1 - k), -22 * Math.sin(Math.PI * k));
      });
    }

    async function sendRequest(scene: TokenBearerScene, h: Handles, from: HolderId, mine: number) {
      const rest = h.slipRest;
      const tok = h.readToken;
      if (rest === null || tok === null) return;
      // 쪽지는 보낸 쪽 손의 카드 자리에서 떠난다 — 카드의 토큰 글자와 쪽지의 토큰 글자가 겹친 채로
      const startDx = PARTY_CX[from] - (W / 2 + h.dropDx);
      const startDy = HAND_Y + HAND_H / 2 + SM / 3 - h.slipTokenY;
      const hidden = [h.status, h.link, h.ledgerMark, h.newRow];
      for (const n of hidden) n?.setAttribute('opacity', '0');
      rest.setAttribute('opacity', '1');
      if (h.panel !== null && scene.step?.kind === 'request' && scene.step.status === 200) {
        h.panel.removeAttribute('transform');
      }

      // 1. 쪽지가 손에서 벽 앞으로 내려온다
      await flow(MS_SLIDE, mine, (k) => {
        const dx = startDx * (1 - k);
        const dy = startDy * (1 - k);
        place(rest, dx, dy);
        place(tok, h.dropDx + dx, h.dropDy + dy);
      });
      if (!alive(mine)) return;

      // 2. 토큰 글자만 틈으로 떨어지고, 나머지는 바깥에 남아 흐려진다
      await flow(MS_DROP, mine, (k) => {
        place(tok, h.dropDx * (1 - k), h.dropDy * (1 - k));
        rest.setAttribute('opacity', String(r2(1 - (1 - REST_OPACITY) * k)));
      });
      if (!alive(mine)) return;

      // 3. 발급 기록과 맞춰 보고, 문이 열린다 (200) — 판정이 적힌다
      const opening = scene.step?.kind === 'request' && scene.step.status === 200;
      await flow(MS_DOOR, mine, (k) => {
        for (const n of hidden) n?.setAttribute('opacity', String(r2(k)));
        if (opening && h.panel !== null) h.panel.setAttribute('transform', `translate(${r2(DOOR_W * k)} 0)`);
      });
    }

    async function play(scene: TokenBearerScene, h: Handles, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) return;
      if (step.kind === 'issue') {
        await handOver(h.cards.get(step.to), 'issuer', step.to, mine);
      } else if (step.kind === 'leak') {
        // 넘긴 쪽의 카드는 제자리에 있고, 똑같은 카드가 하나 더 건너간다
        await handOver(h.cards.get(step.to), step.from, step.to, mine);
      } else {
        await sendRequest(scene, h, step.from, mine);
      }
    }

    return {
      async render(next: unknown, _prev: unknown, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        const scene = narrowScene(next);
        if (scene === null || destroyed) {
          svg.textContent = '';
          return;
        }
        const handles = drawStatic(scene);
        if (!opts.animate || scene.step === null) return;
        await play(scene, handles, mine);
        if (alive(mine)) drawStatic(scene);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
