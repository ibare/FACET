/**
 * stateless-needs-token 의 stage.
 *
 * 위에 브라우저 창 둘(창마다 쿠키 보관 · 받은 응답), 아래에 서버(지금 쥔 요청 · 세션 표).
 * 동사 둘을 운동으로 둔다.
 *   실려 온다 — 요청이 나갈 때 쿠키 보관의 표가 요청 카드에 얹혀 함께 내려온다
 *   비워진다 — 응답이 나가면 서버가 쥐고 있던 요청 카드가 접혀 없어지고 자리가 빈다
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
  type ViewInstance,
} from '@ffacet/core/runtime';
import type { Answer, HeldRequest, StatelessNeedsTokenScene } from './scene.js';

const H = 436;
const SVG = 'http://www.w3.org/2000/svg';

const SEND_MS = 820;
const RESPOND_MS = 1050;

type Headers = { cookie: string; setCookie: string };

function readHeaders(initialData: Record<string, unknown> | undefined): Headers | null {
  if (!initialData) return null;
  const h = initialData.headers;
  if (typeof h !== 'object' || h === null) return null;
  const o = h as Record<string, unknown>;
  if (typeof o.cookie !== 'string' || typeof o.setCookie !== 'string') return null;
  return { cookie: o.cookie, setCookie: o.setCookie };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function r2(v: number): number {
  const n = Math.round(v * 100) / 100;
  return n === 0 ? 0 : n;
}

function ease(u: number): number {
  const c = Math.min(1, Math.max(0, u));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

/** 구간 [a,b] 안의 진행률 0..1 */
function span(u: number, a: number, b: number): number {
  if (u <= a) return 0;
  if (u >= b) return 1;
  return (u - a) / (b - a);
}

export const statelessNeedsTokenStageView: CanvasView = {
  canvas: { height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const c: Palette = getColors(params.theme);
    const headers = readHeaders(params.initialData);

    const W = PIECE_CANVAS_W;
    const smPx = parseFloat(fontSizes.sm);
    const mdPx = parseFloat(fontSizes.md);
    const CH = smPx * 0.6; // 고정폭 글자 한 칸

    // --- 자리 (캔버스에서 역산) ---
    const PAD = 16;
    const GAP = 16;
    const winY = 10;
    const winH = 150;
    const winW = (W - 2 * PAD - GAP) / 2;
    const srvY = 180;
    const srvH = 206;
    const srvX = PAD;
    const srvW = W - 2 * PAD;
    const deskX = srvX + 14;
    const deskY = srvY + 46;
    const deskW = Math.min(310, srvW * 0.52);
    const deskH = srvH - 60;
    const tableX = deskX + deskW + 18;
    const tableW = srvX + srvW - 14 - tableX;
    const tableY = deskY;
    const cardW = deskW - 40;
    const cardH = 92;
    const cardX = deskX + 20;
    const cardY = deskY + (deskH - cardH) / 2;
    const tagW = cardW - 24;
    const tagH = 22;
    const tagDX = 12;
    const tagDY = 36;
    const rowH = 26;
    const jarDX = 92;
    const jarW = Math.min(170, winW - jarDX - 10);
    const jarDY = 32;
    const listDY = 76;
    const lineH = 22;
    const captionY = H - 22;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function winX(i: number): number {
      return PAD + i * (winW + GAP);
    }

    function windowLabel(id: string): string {
      if (id === 'normal') return t('label.window.normal', 'Window');
      if (id === 'private') return t('label.window.private', 'Private window');
      throw new Error(`모르는 창 식별자 ${id}`);
    }

    function needHeaders(): Headers {
      if (headers === null) throw new Error('initialData.headers 가 없어 쿠키 줄을 그릴 수 없다');
      return headers;
    }

    function text(
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { size?: string; fill?: string; mono?: boolean; anchor?: string; weight?: number } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x: r2(x),
          y: r2(y),
          fill: opts.fill ?? c.text,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.sm,
          'text-anchor': opts.anchor ?? 'start',
          'font-weight': opts.weight ?? 400,
        },
        parent,
      );
      node.textContent = s;
      return node;
    }

    function jarPos(wi: number): { x: number; y: number } {
      return { x: winX(wi) + jarDX, y: winY + jarDY };
    }

    function answerPos(scene: StatelessNeedsTokenScene, a: Answer): { x: number; y: number } {
      const wi = scene.windows.indexOf(a.window);
      if (wi < 0) throw new Error(`응답 ${a.index}: 모르는 창 ${a.window}`);
      const mine = scene.answers.filter((b) => b.window === a.window);
      const k = mine.indexOf(a);
      return { x: winX(wi) + 12, y: winY + listDY + k * lineH };
    }

    function rowPos(k: number): { x: number; y: number } {
      return { x: tableX + 10, y: tableY + 30 + k * (rowH + 6) };
    }

    function drawTag(parent: Element, x: number, y: number, w: number, value: string | null, label: string): SVGGElement {
      const g = el('g', {}, parent);
      if (value === null) {
        el('rect', { x: r2(x), y: r2(y), width: r2(w), height: tagH, rx: 4, fill: 'none', stroke: c.border, 'stroke-dasharray': '4 3' }, g);
        return g;
      }
      el('rect', { x: r2(x), y: r2(y), width: r2(w), height: tagH, rx: 4, fill: c.bg, stroke: c.primary, 'stroke-width': 1.5 }, g);
      text(g, x + 8, y + tagH / 2 + smPx * 0.35, `${label}: ${value}`, { mono: true, fill: c.primary });
      return g;
    }

    /** 요청 카드. 돌려주는 것은 카드 묶음과 그 안의 쿠키 표 묶음. */
    function drawCard(parent: Element, req: HeldRequest, x: number, y: number): { card: SVGGElement; tag: SVGGElement } {
      const card = el('g', {}, parent);
      el('rect', { x: r2(x), y: r2(y), width: r2(cardW), height: cardH, rx: 6, fill: c.bgSubtle, stroke: c.text, 'stroke-width': 1.2 }, card);
      text(card, x + 12, y + 22, `${req.method} ${req.path}`, { mono: true, size: fontSizes.md, weight: 600 });
      const tag = drawTag(card, x + tagDX, y + tagDY, tagW, req.cookie, needHeaders().cookie);
      if (req.body !== null) text(card, x + 12, y + cardH - 12, req.body, { mono: true, fill: c.textMuted });
      return { card, tag };
    }

    function drawAnswer(parent: Element, a: Answer, x: number, y: number): SVGGElement {
      const g = el('g', {}, parent);
      const base = y + smPx * 0.9;
      text(g, x, base, String(a.index), { mono: true, fill: c.textMuted });
      const statusX = x + CH * 3;
      const status = `${a.code} ${a.reason}`;
      const ok = a.code < 400;
      text(g, statusX, base, status, { mono: true, weight: 600, fill: ok ? c.success : c.danger });
      const restX = statusX + CH * (status.length + 2);
      let rest = '';
      if (a.setCookie !== null) rest = `${needHeaders().setCookie}: ${a.setCookie}`;
      else if (a.who !== null) rest = [a.who, ...a.items].join(' ');
      if (rest !== '') text(g, restX, base, rest, { mono: true, fill: c.text });
      return g;
    }

    function stepCaption(scene: StatelessNeedsTokenScene): string {
      const step = scene.step;
      const rows = scene.table.length;
      if (step.kind === 'idle') {
        return t('caption.idle', 'Session table rows: {rows}', { rows });
      }
      if (step.kind === 'send') {
        const held = scene.desk;
        if (held === null) throw new Error('send 걸음인데 서버가 쥔 요청이 없다');
        if (held.cookie === null) return t('caption.send.bare', 'Request {n} arrives — cookie carried: none', { n: held.index });
        return t('caption.send.carried', 'Request {n} arrives — cookie carried: {cookie}', { n: held.index, cookie: held.cookie });
      }
      const a = scene.answers[scene.answers.length - 1];
      if (a === undefined) throw new Error('respond 걸음인데 응답이 없다');
      const status = `${a.code} ${a.reason}`;
      if (step.wrote !== null) {
        return t('caption.answer.login', 'Response {n}: {status} — session table rows: {rows}', { n: a.index, status, rows });
      }
      if (a.who === null) {
        return t('caption.answer.unknown', 'Response {n}: {status} — recognized: nobody · session table rows: {rows}', {
          n: a.index,
          status,
          rows,
        });
      }
      return t('caption.answer.known', 'Response {n}: {status} — recognized: {who}', { n: a.index, status, who: a.who });
    }

    type Parts = {
      card: SVGGElement | null;
      tag: SVGGElement | null;
      jarTags: Map<string, SVGGElement>;
      answers: Map<number, SVGGElement>;
      rows: SVGGElement[];
      overlay: SVGGElement;
    };

    /** 그 장면의 화면 전체 */
    function drawStatic(scene: StatelessNeedsTokenScene): Parts {
      svg.textContent = '';
      const jarTags = new Map<string, SVGGElement>();
      const answers = new Map<number, SVGGElement>();
      const rows: SVGGElement[] = [];

      // --- 브라우저 창 ---
      scene.windows.forEach((id, wi) => {
        const x = winX(wi);
        el('rect', { x: r2(x), y: winY, width: r2(winW), height: winH, rx: 8, fill: c.bg, stroke: c.border, 'stroke-width': 1.2 }, svg);
        el('line', { x1: r2(x), y1: winY + 22, x2: r2(x + winW), y2: winY + 22, stroke: c.border }, svg);
        const dash = id === 'private' ? '5 3' : '';
        if (dash !== '') {
          el('rect', { x: r2(x + 3), y: winY + 3, width: r2(winW - 6), height: winH - 6, rx: 6, fill: 'none', stroke: c.textMuted, 'stroke-dasharray': dash }, svg);
        }
        text(svg, x + 12, winY + 16, windowLabel(id), { size: fontSizes.xs, fill: c.textMuted, weight: 600 });
        text(svg, x + 12, winY + jarDY + tagH / 2 + smPx * 0.35, t('label.jar', 'Cookie store'), { size: fontSizes.xs, fill: c.textMuted });
        const jp = jarPos(wi);
        const jarValue = scene.jars[id] ?? null;
        const jarTag = drawTag(svg, jp.x, jp.y, jarW, jarValue, needHeadersOr(jarValue));
        jarTags.set(id, jarTag);
        el('line', { x1: r2(x + 10), y1: winY + listDY - 8, x2: r2(x + winW - 10), y2: winY + listDY - 8, stroke: c.border, 'stroke-dasharray': '2 3' }, svg);
      });
      for (const a of scene.answers) {
        const p = answerPos(scene, a);
        answers.set(a.index, drawAnswer(svg, a, p.x, p.y));
      }

      // --- 서버 ---
      el('rect', { x: srvX, y: srvY, width: srvW, height: srvH, rx: 10, fill: c.bgSubtle, stroke: c.text, 'stroke-width': 1.4 }, svg);
      text(svg, srvX + 14, srvY + 20, t('label.server', 'Server'), { size: fontSizes.md, weight: 700 });
      text(svg, deskX, deskY - 6, t('label.desk', 'Held for this request'), { size: fontSizes.xs, fill: c.textMuted });
      text(svg, tableX, deskY - 6, t('label.table', 'Session table'), { size: fontSizes.xs, fill: c.textMuted });

      const held = scene.desk;
      el(
        'rect',
        {
          x: deskX,
          y: deskY,
          width: r2(deskW),
          height: deskH,
          rx: 8,
          fill: c.bg,
          stroke: held === null ? c.textMuted : c.text,
          'stroke-dasharray': held === null ? '6 4' : '',
        },
        svg,
      );
      if (held === null) {
        text(svg, deskX + deskW / 2, deskY + deskH / 2 + mdPx * 0.35, t('label.empty', 'empty'), {
          size: fontSizes.md,
          fill: c.textMuted,
          anchor: 'middle',
        });
      }

      el('rect', { x: r2(tableX), y: tableY, width: r2(tableW), height: deskH, rx: 8, fill: c.bg, stroke: c.text }, svg);
      const step = scene.step;
      const matched = step.kind === 'respond' ? step.matched : null;
      scene.table.forEach((row, k) => {
        const p = rowPos(k);
        const g = el('g', {}, svg);
        const hit = matched !== null && matched === row.sid;
        el(
          'rect',
          {
            x: r2(p.x),
            y: r2(p.y),
            width: r2(tableW - 20),
            height: rowH,
            rx: 4,
            fill: c.bgSubtle,
            stroke: hit ? c.accent : c.border,
            'stroke-width': hit ? 2.5 : 1,
          },
          g,
        );
        text(g, p.x + 10, p.y + rowH / 2 + smPx * 0.35, `${row.sid} → ${row.user}`, { mono: true });
        rows.push(g);
      });
      if (scene.table.length === 0) {
        const p = rowPos(0);
        el('rect', { x: r2(p.x), y: r2(p.y), width: r2(tableW - 20), height: rowH, rx: 4, fill: 'none', stroke: c.border, 'stroke-dasharray': '4 3' }, svg);
      }

      let card: SVGGElement | null = null;
      let tag: SVGGElement | null = null;
      if (held !== null) {
        const d = drawCard(svg, held, cardX, cardY);
        card = d.card;
        tag = d.tag;
      }

      text(svg, W / 2, captionY, stepCaption(scene), { size: fontSizes.md, anchor: 'middle' });

      const overlay = el('g', {}, svg);
      return { card, tag, jarTags, answers, rows, overlay };
    }

    function needHeadersOr(value: string | null): string {
      return value === null ? '' : needHeaders().cookie;
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const wake = (): void => {
          waiters.delete(wake);
          resolve();
        };
        waiters.add(wake);
        const id = setTimeout(() => {
          timers.delete(id);
          wake();
        }, ms);
        timers.add(id);
      });
    }

    /** 한 시계 — ms 동안 frame(u) 를 부른다. 도중에 물러나야 하면 거짓. */
    async function clock(ms: number, mine: number, frame: (u: number) => void): Promise<boolean> {
      const start = performance.now();
      frame(0);
      for (;;) {
        if (destroyed || mine !== gen) return false;
        await wait(16);
        if (destroyed || mine !== gen) return false;
        const u = Math.min(1, (performance.now() - start) / ms);
        frame(u);
        if (u >= 1) return true;
      }
    }

    function move(node: Element, dx: number, dy: number): void {
      if (dx === 0 && dy === 0) node.removeAttribute('transform');
      else node.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
    }

    async function animateSend(scene: StatelessNeedsTokenScene, parts: Parts, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'send' || parts.card === null || parts.tag === null) return;
      const wi = scene.windows.indexOf(step.window);
      if (wi < 0) throw new Error(`요청 ${step.index}: 모르는 창 ${step.window}`);
      // 카드는 창 안에서 출발한다
      const fromX = winX(wi) + (winW - cardW) / 2;
      const fromY = winY + winH - cardH + 10;
      const cdx = fromX - cardX;
      const cdy = fromY - cardY;
      // 쿠키 표는 창의 보관에서 카드로 얹힌다 (보관의 것은 그대로 남는다)
      const jp = jarPos(wi);
      const tdx = jp.x - (fromX + tagDX);
      const tdy = jp.y - (fromY + tagDY);
      const card = parts.card;
      const tag = parts.tag;
      await clock(SEND_MS, mine, (u) => {
        const lift = step.carried ? ease(span(u, 0, 0.35)) : 1;
        move(tag, tdx * (1 - lift), tdy * (1 - lift));
        const go = ease(span(u, step.carried ? 0.35 : 0.1, 1));
        move(card, cdx * (1 - go), cdy * (1 - go));
      });
    }

    async function animateRespond(scene: StatelessNeedsTokenScene, parts: Parts, mine: number): Promise<void> {
      const step = scene.step;
      if (step.kind !== 'respond') return;
      const overlay = parts.overlay;
      // 비워지기 전의 요청을 겹층에 다시 세운다 — 이것이 접혀 없어진다
      const ghost = drawCard(overlay, step.was, cardX, cardY).card;
      const midX = cardX + cardW / 2;
      const midY = cardY + cardH / 2;

      // 세션 표에 새로 적히는 줄 — 카드의 본문 자리에서 표로 옮겨 간다
      let newRow: SVGGElement | null = null;
      let rowDX = 0;
      let rowDY = 0;
      if (step.wrote !== null) {
        const k = scene.table.findIndex((r) => r.sid === step.wrote?.sid);
        newRow = parts.rows[k] ?? null;
        const p = rowPos(k);
        rowDX = cardX + 12 - p.x;
        rowDY = cardY + cardH - 26 - p.y;
      }

      // 쿠키로 표를 찾는 선
      let seek: SVGLineElement | null = null;
      let seekLen = 0;
      if (step.matched !== null) {
        const k = scene.table.findIndex((r) => r.sid === step.matched);
        const p = rowPos(k);
        const x1 = cardX + tagDX + tagW;
        const y1 = cardY + tagDY + tagH / 2;
        const x2 = p.x;
        const y2 = p.y + rowH / 2;
        seekLen = Math.hypot(x2 - x1, y2 - y1);
        seek = el('line', { x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), stroke: c.accent, 'stroke-width': 2.5 }, overlay);
      }

      // 응답 줄 — 서버에서 창으로 올라간다
      const a = scene.answers[scene.answers.length - 1];
      const answerNode = a === undefined ? null : (parts.answers.get(a.index) ?? null);
      let adx = 0;
      let ady = 0;
      if (a !== undefined) {
        const p = answerPos(scene, a);
        adx = cardX + 12 - p.x;
        ady = cardY + cardH / 2 - p.y;
      }

      // Set-Cookie 는 응답 줄에서 창의 보관으로 떨어진다
      const jarNode = a !== undefined && a.setCookie !== null ? (parts.jarTags.get(a.window) ?? null) : null;
      let jdx = 0;
      let jdy = 0;
      if (a !== undefined && jarNode !== null) {
        const wi = scene.windows.indexOf(a.window);
        const jp = jarPos(wi);
        const ap = answerPos(scene, a);
        jdx = ap.x + CH * 12 - jp.x;
        jdy = ap.y - jp.y;
      }

      await clock(RESPOND_MS, mine, (u) => {
        const look = ease(span(u, 0, 0.3));
        if (newRow !== null) {
          newRow.setAttribute('opacity', String(r2(Math.min(1, look * 1.5))));
          move(newRow, rowDX * (1 - look), rowDY * (1 - look));
        }
        if (seek !== null) {
          seek.setAttribute('stroke-dasharray', `${r2(seekLen)} ${r2(seekLen)}`);
          seek.setAttribute('stroke-dashoffset', String(r2(seekLen * (1 - look))));
        }
        const up = ease(span(u, 0.28, 0.72));
        if (answerNode !== null) {
          answerNode.setAttribute('opacity', String(r2(Math.min(1, 0.2 + up))));
          move(answerNode, adx * (1 - up), ady * (1 - up));
        }
        if (jarNode !== null) {
          const drop = ease(span(u, 0.72, 1));
          jarNode.setAttribute('opacity', drop === 0 ? '0' : '1');
          move(jarNode, jdx * (1 - drop), jdy * (1 - drop));
        }
        // 비워진다 — 쥐고 있던 요청이 세로로 접혀 사라진다
        const shut = ease(span(u, 0.55, 1));
        const sy = r2(Math.max(0.001, 1 - shut));
        ghost.setAttribute('transform', `translate(${r2(midX)} ${r2(midY)}) scale(${r2(1 - shut * 0.15)} ${sy}) translate(${r2(-midX)} ${r2(-midY)})`);
        if (seek !== null && shut > 0) seek.setAttribute('opacity', String(r2(1 - shut)));
      });
    }

    const instance = {
      async render(next: StatelessNeedsTokenScene, _prev: StatelessNeedsTokenScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const parts = drawStatic(next);
        if (!opts.animate) return;
        if (next.step.kind === 'send') await animateSend(next, parts, mine);
        else if (next.step.kind === 'respond') await animateRespond(next, parts, mine);
        else return;
        if (destroyed || mine !== gen) return;
        drawStatic(next);
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
    return instance;
  },
};
