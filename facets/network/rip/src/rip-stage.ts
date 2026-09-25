/**
 * rip-stage — 다섯 고리 위의 라우터 · 표 칸 · 선을 건너는 알림 · 라운드 띠.
 *
 * 운동
 * - 알림이 보낸 이에서 받는 이 쪽 선 끝까지 **건너간다**. 받아들인 것(굵은 테두리 + ✓) · 흘린 것 · 버린 것(줄긋기 + ✗)이 선 끝에 남아
 *   캡션의 수와 같은 수로 걸음이 끝난 화면에 있다. 스플릿 호라이즌이 보내지 않은 것은 보낸 이 쪽에서 조금 나가다 ⊘ 로 멈춘다.
 * - 알림의 모양이 방식을 따른다: 수 하나 · 이름 줄(경로 벡터 — 받는 이가 제 이름을 앞에 붙여 칸에 적는다) · 만든 이·번호 사본.
 * - 끊는 선은 가운데서 갈라져 두 반쪽이 제 라우터 쪽으로 물러난다. 다시 이으면 붙는다.
 * - 표 칸의 수가 바뀌면 새 값이 미끄러져 들어오고, 칸 아래 막대가 수/닿을 수 없음(initialData.unreachable) 길이로 늘거나 준다.
 * - 라운드 띠는 판이 바뀌면 앞 판 길이에서 새 판 길이로 칸이 옮겨 가며 줄거나 는다.
 *
 * 운동 길이는 projector 가 재생 속도로 나눠 넘긴다. 세로는 처음부터 고정이다.
 */
import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

export type RipStageRow = {
  router: string;
  metric: number | null;
  nextHop: string | null;
  path: string[] | null;
  lsas: { origin: string; seq: number }[] | null;
  wrong: boolean;
  direct: boolean;
  unreachable: boolean;
};

export type RipStageAdvert = {
  from: string;
  to: string;
  kind: 'metric' | 'path' | 'withdraw' | 'lsa';
  metric: number | null;
  path: string[] | null;
  origin: string | null;
  seq: number | null;
  fate: 'taken' | 'ignored' | 'dropped';
};

export type RipStageStart = {
  method: string;
  cutLinks: [string, string][];
  table: RipStageRow[];
  totalRounds: number;
};

export type RipStageRound = {
  method: string;
  round: number;
  adverts: RipStageAdvert[];
  heldBack: { from: string; to: string }[];
  table: RipStageRow[];
  wrong: boolean;
};

/** projector 가 부르는 표면 */
export type RipStage = {
  showStart(p: RipStageStart, motionMs: number): void;
  showRound(p: RipStageRound, motionMs: number): void;
  setCaption(lines: string[]): void;
  clear(): void;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 780;
const H = 520;
const R = 20; // 라우터 원 반지름
const CELL_W = 120;
const CELL_H = 24;
const GAUGE_H = 4;
const SLOT = 15;
const BAND_Y = 468;
const BAND_X = 130;
const BAND_CELL = 40;
const BAND_H = 22;
const CUT_GAP = 16;

/** 고리 다섯 자리 — 목적지는 오른쪽(자리 2). 칸은 고리 바깥쪽 */
const SLOTS: { x: number; y: number; cell: 'left' | 'top' | 'right' | 'bottom' }[] = [
  { x: 200, y: 265, cell: 'left' },
  { x: 360, y: 160, cell: 'top' },
  { x: 540, y: 265, cell: 'right' },
  { x: 470, y: 385, cell: 'bottom' },
  { x: 280, y: 385, cell: 'bottom' },
];

type Pt = { x: number; y: number };

type RouterUi = {
  name: string;
  at: Pt;
  box: SVGRectElement;
  text: SVGTextElement;
  mark: SVGTextElement;
  gauge: SVGRectElement;
  slots: { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement; held: number; origin: string }[];
  shown: string;
};

type LinkUi = { a: string; b: string; halfA: SVGGElement; halfB: SVGGElement; snip: SVGTextElement; cut: boolean };

type BandCell = { g: SVGGElement; rect: SVGRectElement; mark: SVGTextElement; num: SVGTextElement };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (parent) parent.appendChild(node);
  return node;
}

function move(node: SVGElement, to: string, ms: number): void {
  node.style.transition = ms > 0 ? `transform ${ms}ms ease-in-out, opacity ${ms}ms ease-in-out` : 'none';
  node.style.transform = to;
}

/** 시작 자리를 전이 없이 박고, 다음 그림 틀에서 끝 자리로 옮긴다 */
function glide(node: SVGElement, from: string, to: string, ms: number): void {
  node.style.transition = 'none';
  node.style.transform = from;
  void node.getBoundingClientRect();
  move(node, to, ms);
}

function readString(v: unknown): string {
  if (typeof v !== 'string') throw new Error('rip-stage: 문자열이 아닌 자료');
  return v;
}

/** 고리를 따라 라우터를 줄 세운다 — 목적지가 자리 2 에 오게 돌린다 */
function ringOrder(routers: string[], links: [string, string][], dest: string): string[] {
  if (routers.length !== SLOTS.length) throw new Error(`rip-stage: 라우터 ${SLOTS.length} 개의 고리만 그린다`);
  const nb = (r: string): string[] =>
    links.flatMap(([a, b]) => (a === r ? [b] : b === r ? [a] : [])).sort();
  for (const r of routers) if (nb(r).length !== 2) throw new Error(`rip-stage: ${r} 가 고리 위에 있지 않다`);
  const first = routers[0] as string;
  const order = [first];
  let prev = '';
  let cur = first;
  for (let i = 1; i < routers.length; i += 1) {
    const next = nb(cur).find((x) => x !== prev && !order.includes(x));
    if (next === undefined) throw new Error('rip-stage: 선이 고리 하나를 이루지 않는다');
    order.push(next);
    prev = cur;
    cur = next;
  }
  const at = order.indexOf(dest);
  if (at < 0) throw new Error(`rip-stage: 목적지 ${dest} 가 라우터에 없다`);
  const shift = (at - 2 + order.length) % order.length;
  return [...order.slice(shift), ...order.slice(0, shift)];
}

export const ripStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const sm = parseFloat(fontSizes.sm);
    const xs = parseFloat(fontSizes.xs);
    const md = parseFloat(fontSizes.md);
    void container;

    const root = el('g', {}, svg);
    const captionLayer = el('g', {}, root);
    const linkLayer = el('g', {}, root);
    const advertLayer = el('g', {}, root);
    const routerLayer = el('g', {}, root);
    const bandLayer = el('g', {}, root);

    const captions: SVGTextElement[] = [0, 1, 2].map((i) =>
      el(
        'text',
        {
          x: 24,
          y: 22 + i * 20,
          'font-family': fonts.body,
          'font-size': i === 0 ? fontSizes.md : fontSizes.sm,
          fill: i === 0 ? c.text : c.textMuted,
        },
        captionLayer,
      ),
    );

    const routers = new Map<string, RouterUi>();
    const links: LinkUi[] = [];
    let dest = '';
    let unreachable = 0;

    const init = params.initialData;
    if (init !== undefined && typeof init === 'object' && init !== null) {
      const d = init as Record<string, unknown>;
      const rs = Array.isArray(d.routers) ? d.routers.map(readString) : [];
      const ls: [string, string][] = Array.isArray(d.links)
        ? d.links.map((l) => {
            if (!Array.isArray(l) || l.length !== 2) throw new Error('rip-stage: 선은 두 끝이다');
            return [readString(l[0]), readString(l[1])] as [string, string];
          })
        : [];
      dest = readString(d.dest);
      if (typeof d.unreachable !== 'number' || d.unreachable <= 0) throw new Error('rip-stage: unreachable 이 양수가 아니다');
      unreachable = d.unreachable;
      const net = readString(d.network);
      const order = ringOrder(rs, ls, dest);
      const pos = new Map<string, (typeof SLOTS)[number]>();
      order.forEach((r, i) => pos.set(r, SLOTS[i] as (typeof SLOTS)[number]));
      const P = (r: string): Pt => {
        const p = pos.get(r);
        if (p === undefined) throw new Error(`rip-stage: 자리 없는 라우터 ${r}`);
        return p;
      };

      // 목적지 망
      const dp = P(dest);
      el('line', { x1: dp.x + R, y1: dp.y, x2: dp.x + 100, y2: dp.y, stroke: c.border, 'stroke-width': 2 }, linkLayer);
      const netW = net.length * sm * 0.62 + 16;
      el('rect', { x: dp.x + 100, y: dp.y - 14, width: netW, height: 28, rx: 6, fill: c.bgSubtle, stroke: c.border }, linkLayer);
      el(
        'text',
        {
          x: dp.x + 100 + netW / 2,
          y: dp.y + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.text,
        },
        linkLayer,
      ).textContent = net;

      // 선 — 가운데서 갈라지는 두 반쪽
      for (const [a, b] of ls) {
        const pa = P(a);
        const pb = P(b);
        const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        const halfA = el('g', {}, linkLayer);
        el('line', { x1: pa.x, y1: pa.y, x2: mid.x, y2: mid.y, stroke: c.border, 'stroke-width': 2 }, halfA);
        const halfB = el('g', {}, linkLayer);
        el('line', { x1: pb.x, y1: pb.y, x2: mid.x, y2: mid.y, stroke: c.border, 'stroke-width': 2 }, halfB);
        const snip = el(
          'text',
          {
            x: mid.x,
            y: mid.y + 5,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.md,
            fill: c.danger,
            opacity: 0,
          },
          linkLayer,
        );
        snip.textContent = '✗';
        links.push({ a, b, halfA, halfB, snip, cut: false });
      }

      // 라우터와 표 칸
      for (const r of rs) {
        const s = P(r);
        const slot = pos.get(r) as (typeof SLOTS)[number];
        el('circle', { cx: s.x, cy: s.y, r: R, fill: c.bg, stroke: c.text, 'stroke-width': 1.6 }, routerLayer);
        el(
          'text',
          {
            x: s.x,
            y: s.y + md * 0.36,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.lg,
            'font-weight': 600,
            fill: c.text,
          },
          routerLayer,
        ).textContent = r;
        let bx: number;
        let by: number;
        if (slot.cell === 'left') {
          bx = s.x - R - 14 - CELL_W;
          by = s.y - CELL_H / 2;
        } else if (slot.cell === 'top') {
          bx = s.x - CELL_W / 2;
          by = s.y - R - 12 - GAUGE_H - 4 - CELL_H;
        } else if (slot.cell === 'right') {
          bx = s.x + R + 16;
          by = s.y - R - 12 - GAUGE_H - CELL_H - SLOT;
        } else {
          bx = s.x - CELL_W / 2;
          by = s.y + R + 8;
        }
        const box = el(
          'rect',
          { x: bx, y: by, width: CELL_W, height: CELL_H, rx: 4, fill: c.bg, stroke: c.border, 'stroke-width': 1.2 },
          routerLayer,
        );
        const text = el(
          'text',
          {
            x: bx + 8,
            y: by + CELL_H / 2 + sm * 0.36,
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: c.text,
          },
          routerLayer,
        );
        const mark = el(
          'text',
          {
            x: bx + CELL_W - 8,
            y: by + CELL_H / 2 + sm * 0.36,
            'text-anchor': 'end',
            'font-family': fonts.body,
            'font-size': fontSizes.sm,
            fill: c.textMuted,
          },
          routerLayer,
        );
        el('rect', { x: bx, y: by + CELL_H + 3, width: CELL_W, height: GAUGE_H, fill: c.bgSubtle }, routerLayer);
        const gauge = el('rect', { x: bx, y: by + CELL_H + 3, width: CELL_W, height: GAUGE_H, fill: c.primary }, routerLayer);
        gauge.style.transformBox = 'fill-box';
        gauge.style.transformOrigin = 'left center';
        gauge.style.transform = 'scaleX(0)';
        // 링크 상태 지도 조각 — 칸 아래(위 칸은 위)에 만든 이마다 한 자리
        const slotsY = slot.cell === 'top' ? by - SLOT - 4 : by + CELL_H + GAUGE_H + 7;
        const slots = rs.map((o, i) => {
          const g = el('g', {}, routerLayer);
          g.style.transformBox = 'fill-box';
          g.style.transformOrigin = 'center';
          const x = bx + i * (SLOT + 4);
          const rect = el(
            'rect',
            { x, y: slotsY, width: SLOT, height: SLOT, rx: 2, fill: c.bg, stroke: c.border, 'stroke-dasharray': '2 2' },
            g,
          );
          const tx = el(
            'text',
            {
              x: x + SLOT / 2,
              y: slotsY + SLOT / 2 + xs * 0.36,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: c.textMuted,
            },
            g,
          );
          tx.textContent = '';
          g.setAttribute('opacity', '0');
          return { g, rect, text: tx, held: 0, origin: o };
        });
        routers.set(r, { name: r, at: s, box, text, mark, gauge, slots, shown: '' });
      }
    }

    // 라운드 띠
    el(
      'text',
      {
        x: BAND_X - 12,
        y: BAND_Y + BAND_H / 2 + sm * 0.36,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      },
      bandLayer,
    ).textContent = t('label.rounds', 'Rounds');
    const bandCells: BandCell[] = [];
    let bandLen = 0;
    const bandStep = (n: number): number => Math.min(BAND_CELL, (W - BAND_X - 24) / Math.max(n, 1));

    const makeBandCell = (): BandCell => {
      const g = el('g', {}, bandLayer);
      g.style.transformBox = 'fill-box';
      g.style.transformOrigin = 'left center';
      const rect = el(
        'rect',
        { x: 0, y: BAND_Y, width: BAND_CELL - 4, height: BAND_H, rx: 3, fill: c.bg, stroke: c.border },
        g,
      );
      const mark = el(
        'text',
        {
          x: (BAND_CELL - 4) / 2,
          y: BAND_Y + BAND_H / 2 + sm * 0.36,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.text,
        },
        g,
      );
      const num = el(
        'text',
        {
          x: (BAND_CELL - 4) / 2,
          y: BAND_Y + BAND_H + xs + 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.textMuted,
        },
        g,
      );
      return { g, rect, mark, num };
    };

    const cellText = (row: RipStageRow): string => {
      if (row.metric === null) return '—';
      if (row.direct) return `${row.metric} · ${t('label.direct', 'direct')}`;
      if (row.path !== null) return `${row.metric} · ${row.path.join(' ')}`;
      return row.nextHop === null ? `${row.metric}` : `${row.metric} · ${row.nextHop}`;
    };

    const paintTable = (table: RipStageRow[], ms: number): void => {
      for (const row of table) {
        const ui = routers.get(row.router);
        if (ui === undefined) throw new Error(`rip-stage: 그리지 않은 라우터 ${row.router}`);
        const txt = cellText(row);
        if (txt !== ui.shown) {
          ui.text.textContent = txt;
          if (ui.shown !== '') glide(ui.text, 'translateY(-10px)', 'translateY(0px)', ms);
          ui.shown = txt;
        }
        ui.box.setAttribute('stroke', row.wrong ? c.danger : c.border);
        ui.box.setAttribute('stroke-dasharray', row.wrong ? '4 3' : '');
        ui.mark.textContent = row.wrong ? '✗' : '✓';
        ui.mark.setAttribute('fill', row.wrong ? c.danger : c.textMuted);
        if (unreachable <= 0) throw new Error('rip-stage: initialData 없이 표를 그릴 수 없다');
        const frac = row.metric === null ? 0 : row.unreachable ? 1 : row.metric / unreachable;
        ui.gauge.setAttribute('fill', row.unreachable ? c.textMuted : c.primary);
        move(ui.gauge, `scaleX(${frac})`, ms);
        const held = new Map((row.lsas ?? []).map((l) => [l.origin, l.seq]));
        for (const s of ui.slots) {
          const seq = held.get(s.origin) ?? 0;
          s.g.setAttribute('opacity', row.lsas === null ? '0' : '1');
          s.text.textContent = seq > 0 ? s.origin : '';
          s.rect.setAttribute('stroke-dasharray', seq > 0 ? '' : '2 2');
          s.rect.setAttribute('stroke', seq > 1 ? c.primary : c.border);
          s.rect.setAttribute('stroke-width', seq > 1 ? '2' : '1');
          s.rect.setAttribute('fill', seq > 0 ? c.bgSubtle : c.bg);
          s.text.setAttribute('fill', seq > 0 ? c.text : c.textMuted);
          if (seq !== s.held && row.lsas !== null && seq > 0) glide(s.g, 'scale(0.3)', 'scale(1)', ms);
          s.held = seq;
        }
      }
    };

    const clearAdverts = (): void => {
      while (advertLayer.firstChild) advertLayer.removeChild(advertLayer.firstChild);
    };

    const geom = (from: string, to: string): { p: Pt; q: Pt; u: Pt; n: Pt } => {
      const a = routers.get(from);
      const b = routers.get(to);
      if (a === undefined || b === undefined) throw new Error(`rip-stage: 모르는 선 ${from}–${to}`);
      const dx = b.at.x - a.at.x;
      const dy = b.at.y - a.at.y;
      const len = Math.hypot(dx, dy);
      const u = { x: dx / len, y: dy / len };
      return { p: a.at, q: b.at, u, n: { x: -u.y, y: u.x } };
    };

    const advertLabel = (a: RipStageAdvert): string => {
      if (a.kind === 'metric') {
        if (a.metric === null) throw new Error('rip-stage: 수 알림에 수가 없다');
        return String(a.metric);
      }
      if (a.kind === 'path') {
        if (a.path === null) throw new Error('rip-stage: 길 알림에 길이 없다');
        return a.path.join(' ');
      }
      if (a.kind === 'withdraw') return '∅';
      if (a.origin === null || a.seq === null) throw new Error('rip-stage: 링크 상태 알림에 만든 이가 없다');
      return `${a.origin}·${a.seq}`;
    };

    const showAdverts = (adverts: RipStageAdvert[], held: { from: string; to: string }[], ms: number): void => {
      clearAdverts();
      const perLink = new Map<string, number>();
      for (const a of adverts) {
        const key = `${a.from}>${a.to}`;
        const k = perLink.get(key) ?? 0;
        perLink.set(key, k + 1);
        const { p, q, u, n } = geom(a.from, a.to);
        const label = advertLabel(a);
        const w = label.length * xs * 0.66 + 12;
        const h = 16;
        const g = el('g', {}, advertLayer);
        const rect = el(
          'rect',
          {
            x: -w / 2,
            y: -h / 2,
            width: w,
            height: h,
            rx: 3,
            fill: c.bg,
            stroke: a.fate === 'taken' ? c.primary : a.fate === 'dropped' ? c.danger : c.border,
            'stroke-width': a.fate === 'taken' ? 1.8 : 1,
          },
          g,
        );
        if (a.fate === 'dropped') rect.setAttribute('stroke-dasharray', '3 2');
        el(
          'text',
          {
            x: 0,
            y: xs * 0.36,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: a.fate === 'taken' ? c.text : c.textMuted,
          },
          g,
        ).textContent = label;
        if (a.fate === 'dropped') {
          el('line', { x1: -w / 2 + 2, y1: 0, x2: w / 2 - 2, y2: 0, stroke: c.danger, 'stroke-width': 1.2 }, g);
          el(
            'text',
            {
              x: w / 2 + 3,
              y: xs * 0.36,
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: c.danger,
            },
            g,
          ).textContent = '✗';
        } else if (a.fate === 'taken') {
          // 받아들인 칩 — 테두리 굵기만으로 가르지 않게 글자 표지를 단다
          el(
            'text',
            {
              x: w / 2 + 3,
              y: xs * 0.36,
              'font-family': fonts.body,
              'font-size': fontSizes.xs,
              fill: c.primary,
            },
            g,
          ).textContent = '✓';
        }
        const off = 10;
        const s = { x: p.x + u.x * (R + w / 2) + n.x * off, y: p.y + u.y * (R + w / 2) + n.y * off };
        const back = R + 6 + w / 2 + k * (h + 4) * 1.4;
        const e = { x: q.x - u.x * back + n.x * off, y: q.y - u.y * back + n.y * off };
        glide(g, `translate(${s.x}px, ${s.y}px)`, `translate(${e.x}px, ${e.y}px)`, ms);
      }
      for (const hb of held) {
        const { p, u, n } = geom(hb.from, hb.to);
        const g = el('g', {}, advertLayer);
        el('circle', { cx: 0, cy: 0, r: 7, fill: c.bg, stroke: c.textMuted }, g);
        el(
          'text',
          {
            x: 0,
            y: xs * 0.36,
            'text-anchor': 'middle',
            'font-family': fonts.body,
            'font-size': fontSizes.xs,
            fill: c.textMuted,
          },
          g,
        ).textContent = '⊘';
        const off = 10;
        const s = { x: p.x + u.x * (R + 4) + n.x * off, y: p.y + u.y * (R + 4) + n.y * off };
        const e = { x: p.x + u.x * (R + 20) + n.x * off, y: p.y + u.y * (R + 20) + n.y * off };
        glide(g, `translate(${s.x}px, ${s.y}px)`, `translate(${e.x}px, ${e.y}px)`, ms);
      }
    };

    const setCuts = (cut: [string, string][], ms: number): void => {
      const gone = new Set(cut.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)));
      for (const l of links) {
        const key = l.a < l.b ? `${l.a}|${l.b}` : `${l.b}|${l.a}`;
        const isCut = gone.has(key);
        const { u } = geom(l.a, l.b);
        const dx = u.x * CUT_GAP;
        const dy = u.y * CUT_GAP;
        move(l.halfA, isCut ? `translate(${-dx}px, ${-dy}px)` : 'translate(0px, 0px)', ms);
        move(l.halfB, isCut ? `translate(${dx}px, ${dy}px)` : 'translate(0px, 0px)', ms);
        l.snip.setAttribute('opacity', isCut ? '1' : '0');
        l.cut = isCut;
      }
    };

    const layoutBand = (n: number, ms: number): void => {
      const from = bandLen;
      const stepOld = bandStep(from);
      const stepNew = bandStep(n);
      while (bandCells.length < Math.max(n, from)) {
        const cell = makeBandCell();
        const i = bandCells.length;
        // 새 칸은 앞 판 띠의 끝에서 자라 나온다
        cell.g.style.transform = `translate(${BAND_X + Math.max(from, 0) * stepOld}px, 0px) scaleX(0)`;
        bandCells.push(cell);
        void i;
      }
      bandCells.forEach((cell, i) => {
        cell.rect.setAttribute('width', String(Math.max(stepNew - 4, 6)));
        cell.mark.setAttribute('x', String(Math.max(stepNew - 4, 6) / 2));
        cell.num.setAttribute('x', String(Math.max(stepNew - 4, 6) / 2));
        cell.mark.textContent = '';
        cell.rect.setAttribute('fill', c.bg);
        cell.rect.setAttribute('stroke', c.border);
        cell.rect.setAttribute('stroke-dasharray', '3 3');
        cell.num.textContent = i < n ? String(i + 1) : '';
        if (i < n) {
          void cell.g.getBoundingClientRect();
          move(cell.g, `translate(${BAND_X + i * stepNew}px, 0px) scaleX(1)`, ms);
        } else {
          // 줄어든 판 — 넘친 칸은 새 띠의 끝으로 접혀 들어간다
          move(cell.g, `translate(${BAND_X + n * stepNew}px, 0px) scaleX(0)`, ms);
        }
      });
      bandLen = n;
    };

    const fillBand = (round: number, wrong: boolean): void => {
      const cell = bandCells[round - 1];
      if (cell === undefined || round > bandLen) throw new Error(`rip-stage: 띠에 라운드 ${round} 칸이 없다`);
      cell.rect.setAttribute('stroke-dasharray', '');
      cell.rect.setAttribute('fill', wrong ? c.bg : c.bgSubtle);
      cell.rect.setAttribute('stroke', wrong ? c.danger : c.primary);
      cell.mark.textContent = wrong ? '✗' : '✓';
      cell.mark.setAttribute('fill', wrong ? c.danger : c.text);
    };

    const stage: RipStage = {
      showStart(p, ms) {
        clearAdverts();
        setCuts(p.cutLinks, ms);
        paintTable(p.table, ms);
        layoutBand(p.totalRounds, ms);
      },
      showRound(p, ms) {
        showAdverts(p.adverts, p.heldBack, ms);
        paintTable(p.table, ms);
        fillBand(p.round, p.wrong);
      },
      setCaption(lines) {
        captions.forEach((node, i) => {
          node.textContent = lines[i] ?? '';
        });
      },
      clear() {
        clearAdverts();
        stage.setCaption([]);
      },
    };

    return {
      ...stage,
      destroy() {
        root.remove();
      },
    };
  },
};
