/**
 * paging-stage — 참조 열 · 번역 길 표지 · 주소의 갈라짐 · TLB 칸 · 페이지 표 · 실제 주소.
 *
 * 운동
 *   - 참조마다 번역 길 표지가 하나 있다 (TLB 길 · 표 길). 판을 새로 돌면 앞 판의 표지는 속이 빈 채
 *     제자리에 남고, 그 참조의 차례가 오면 새 길로 옮겨 붙는다 — 지우고 다시 찍지 않는다
 *   - TLB 칸은 사다리 끝(4)의 자리를 처음부터 잡고, 판이 시작할 때 칸 수만큼 열리고 나머지는 닫힌다
 *   - 걸음 안에서 주소가 페이지 | 오프셋으로 갈라지고, 페이지 쪽 조각이 TLB 로 가서 프레임을 들고
 *     돌아오거나, TLB 를 지나 표의 제 줄까지 내려갔다가 프레임을 들고 TLB 칸에 적힌 뒤(내보낸 줄은
 *     밀려 나간다) 오프셋과 다시 붙어 실제 주소가 된다
 *
 * TLB 칸은 자리 차례라 화면 · 캡션에서 1 부터 보인다 (데이터 · 이벤트의 slot 은 0 부터).
 * 운동 길이는 projector 가 걸음마다 속도를 읽어 넘긴다. 코드 글자는 두지 않는다 (코드 패널이 번역기다).
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 800;
const H = 404;

// 참조 띠
const X0 = 100;
const COL = 43;
const CHIP_W = 42;
const CHIP_TOP = 22;
const CHIP_H = 20;
const LANE_HIT_Y = 64;
const LANE_WALK_Y = 90;
const MARK_R = 6;
const DIVIDER_Y = 124;

// 본 그림
const HEAD_Y = 142;
const CELL_HEAD_Y = 158;
const ROW_TOP = 166;
const VA_X = 24;
const VA_W = 200;
const VA_TOP = ROW_TOP;
const VA_H = 34;
const SPLIT_TOP = 220;
const SPLIT_H = 30;
const PAGE_BOX = { x: 24, w: 60 };
const OFF_BOX = { x: 104, w: 120 };
const PA_HEAD_Y = 294;
const PA_TOP = 302;
const PA_H = 34;

const SLOT_LABEL_X = 316;
const SLOT_X = 360;
const SLOT_W = 140;
const SLOT_PAGE_CX = 392;
const SLOT_FRAME_CX = 460;
const SLOT_DIV_X = 424;
const SLOT_PITCH = 46;
const SLOT_H = 38;
const SLOT_SHUT_H = 6;

const PT_X = 590;
const PT_PAGE_CX = 620;
const PT_FRAME_CX = 680;
const PT_DIV_X = 650;
const PT_W = 120;
const PT_PITCH = 34;
const PT_H = 28;

const CAPTION_Y1 = 368;
const CAPTION_Y2 = 390;

const TOKEN = 22;

export type PagingStep = {
  index: number;
  address: number;
  page: number;
  offset: number;
  route: 'hit' | 'walk';
  slot: number;
  frame: number;
  evicted: number;
  physical: number;
  hitRate: number;
};

export type PagingSetup = {
  addresses: number[];
  pageTable: number[];
  pageBytes: number;
  maxSlots: number;
};

/** projector 가 부르는 stage 의 표면. */
export type PagingStage = {
  setup(data: PagingSetup): void;
  startRun(slots: number, ms: number): Promise<void>;
  translate(step: PagingStep, ms: number): Promise<void>;
  clear(): void;
  destroy(): void;
};

type Pt = { x: number; y: number };

const hex = (value: number, digits: number): string => value.toString(16).toUpperCase().padStart(digits, '0');
const ease = (u: number): number => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  parent.appendChild(node);
  return node;
}

function text(
  parent: Element,
  x: number,
  y: number,
  content: string,
  attrs: Record<string, string | number>,
): SVGTextElement {
  const node = el(parent, 'text', { x, y, 'dominant-baseline': 'central', ...attrs });
  node.textContent = content;
  return node;
}

/** 경로 위의 한 점 — 꼭짓점 사이를 같은 몫으로 나눈다. */
function along(points: Pt[], u: number): Pt {
  const first = points[0];
  if (!first) throw new Error('paging-stage: 빈 경로');
  if (points.length === 1) return first;
  const legs = points.length - 1;
  const pos = Math.min(u, 1) * legs;
  const k = Math.min(legs - 1, Math.floor(pos));
  const a = points[k]!;
  const b = points[k + 1]!;
  const e = ease(pos - k);
  return { x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e) };
}

export const pagingStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(container, params) {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const mono = fonts.mono;
    const xs = parseFloat(fontSizes.xs);
    const sm = parseFloat(fontSizes.sm);
    const lg = parseFloat(fontSizes.lg);
    const charW = lg * 0.6;
    void container;

    const root = el(svg, 'g', { 'font-family': fonts.body });

    // ── 애니메이션 — 걸린 것을 들고 있다가 destroy · clear 에서 끝낸다
    const pending = new Set<{ id: number | null; done: () => void }>();
    const tween = (ms: number, draw: (u: number) => void): Promise<void> => {
      if (!(ms > 0) || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const job: { id: number | null; done: () => void } = {
          id: null,
          done: () => {
            pending.delete(job);
            resolve();
          },
        };
        pending.add(job);
        let start = -1;
        const tick = (now: number): void => {
          if (start < 0) start = now;
          const u = Math.min(1, (now - start) / ms);
          draw(u);
          if (u < 1) job.id = requestAnimationFrame(tick);
          else job.done();
        };
        job.id = requestAnimationFrame(tick);
      });
    };
    const stopAll = (): void => {
      for (const job of [...pending]) {
        if (job.id !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(job.id);
        job.done();
      }
    };

    // ── 판 사이에 이어지는 상태
    let addresses: number[] = [];
    let pageTable: number[] = [];
    let maxSlots = 4;
    let openSlots = 0;
    /** 참조마다 지금 놓인 길 — null 이면 아직 한 번도 번역되지 않았다 */
    let lane: ('hit' | 'walk' | null)[] = [];

    // ── 그릴 층
    let strip = el(root, 'g', {});
    let slotsLayer = el(root, 'g', {});
    let tableLayer = el(root, 'g', {});
    const fixed = el(root, 'g', {});
    const moving = el(root, 'g', {});

    type Chip = { box: SVGRectElement; label: SVGTextElement; mark: SVGCircleElement };
    let chips: Chip[] = [];
    type Slot = {
      box: SVGRectElement;
      div: SVGLineElement;
      label: SVGTextElement;
      page: SVGTextElement;
      frame: SVGTextElement;
      used: SVGTextElement;
      cy: number;
    };
    let slotEls: Slot[] = [];
    type Row = { box: SVGRectElement; cy: number };
    let rows: Row[] = [];

    // 머리말 · 고정 틀
    text(fixed, 8, LANE_HIT_Y, t('label.tlb', 'TLB'), { 'font-size': xs, fill: c.textMuted });
    text(fixed, 8, LANE_WALK_Y, t('label.pageTable', 'Page table'), { 'font-size': xs, fill: c.textMuted });
    for (const y of [LANE_HIT_Y, LANE_WALK_Y]) {
      el(fixed, 'line', { x1: X0, x2: X0 + 16 * COL - 1, y1: y, y2: y, stroke: c.border, 'stroke-width': 1 });
    }
    const hitRateText = text(fixed, W - 12, 110, '', { 'font-size': sm, fill: c.text, 'text-anchor': 'end' });
    el(fixed, 'line', { x1: 8, x2: W - 8, y1: DIVIDER_Y, y2: DIVIDER_Y, stroke: c.border, 'stroke-width': 1 });

    const head = { 'font-size': sm, fill: c.text, 'font-weight': 600 };
    const cellHead = { 'font-size': xs, fill: c.textMuted, 'text-anchor': 'middle' };
    text(fixed, VA_X, HEAD_Y, t('label.virtual', 'Virtual address'), head);
    text(fixed, SLOT_LABEL_X, HEAD_Y, t('label.tlb', 'TLB'), head);
    text(fixed, PT_X, HEAD_Y, t('label.pageTable', 'Page table'), head);
    text(fixed, SLOT_PAGE_CX, CELL_HEAD_Y, t('label.page', 'Page'), cellHead);
    text(fixed, SLOT_FRAME_CX, CELL_HEAD_Y, t('label.frame', 'Frame'), cellHead);
    text(fixed, PT_PAGE_CX, CELL_HEAD_Y, t('label.page', 'Page'), cellHead);
    text(fixed, PT_FRAME_CX, CELL_HEAD_Y, t('label.frame', 'Frame'), cellHead);

    // 가상 주소 · 갈라진 조각 · 실제 주소
    const boxAttrs = { fill: c.bg, stroke: c.border, 'stroke-width': 1, rx: 4 };
    el(fixed, 'rect', { x: VA_X, y: VA_TOP, width: VA_W, height: VA_H, ...boxAttrs });
    el(fixed, 'rect', { x: PAGE_BOX.x, y: SPLIT_TOP, width: PAGE_BOX.w, height: SPLIT_H, ...boxAttrs });
    el(fixed, 'rect', { x: OFF_BOX.x, y: SPLIT_TOP, width: OFF_BOX.w, height: SPLIT_H, ...boxAttrs });
    text(fixed, PAGE_BOX.x + PAGE_BOX.w / 2, SPLIT_TOP + SPLIT_H + 12, t('label.page', 'Page'), cellHead);
    text(fixed, OFF_BOX.x + OFF_BOX.w / 2, SPLIT_TOP + SPLIT_H + 12, t('label.offset', 'Offset'), cellHead);
    text(fixed, VA_X, PA_HEAD_Y, t('label.physical', 'Physical address'), head);
    el(fixed, 'rect', { x: VA_X, y: PA_TOP, width: VA_W, height: PA_H, ...boxAttrs });

    // 주소 글자 자리: "0x" + 페이지 한 자리 + 오프셋 세 자리, 상자 가운데에
    const addrStart = VA_X + VA_W / 2 - 3 * charW;
    const pageCharX = addrStart + 2 * charW;
    const offCharX = addrStart + 3 * charW;
    const addrFont = { 'font-size': lg, 'font-family': mono, fill: c.text };
    const vaPrefix = text(fixed, addrStart, VA_TOP + VA_H / 2, '', addrFont);
    const vaPage = text(fixed, pageCharX, VA_TOP + VA_H / 2, '', addrFont);
    const vaOff = text(fixed, offCharX, VA_TOP + VA_H / 2, '', addrFont);
    const paPrefix = text(fixed, addrStart, PA_TOP + PA_H / 2, '', addrFont);
    const paFrame = text(fixed, pageCharX, PA_TOP + PA_H / 2, '', addrFont);
    const paOff = text(fixed, offCharX, PA_TOP + PA_H / 2, '', addrFont);
    const splitFont = { 'font-size': lg, 'font-family': mono, fill: c.text, 'text-anchor': 'middle' };
    const splitPage = text(fixed, PAGE_BOX.x + PAGE_BOX.w / 2, SPLIT_TOP + SPLIT_H / 2, '', splitFont);
    const splitOff = text(fixed, OFF_BOX.x + OFF_BOX.w / 2, SPLIT_TOP + SPLIT_H / 2, '', splitFont);

    const caption1 = text(fixed, 12, CAPTION_Y1, '', { 'font-size': sm, fill: c.text });
    const caption2 = text(fixed, 12, CAPTION_Y2, '', { 'font-size': sm, fill: c.text });

    // 움직이는 조각 둘 — 페이지 쪽(프레임을 들고 돌아온다)과 오프셋 쪽
    const pageTok = el(moving, 'g', { visibility: 'hidden' });
    el(pageTok, 'rect', { x: -TOKEN / 2, y: -TOKEN / 2, width: TOKEN, height: TOKEN, rx: 4, fill: c.primary });
    const pageTokText = text(pageTok, 0, 0, '', {
      'font-size': sm,
      'font-family': mono,
      fill: c.textInverse,
      'text-anchor': 'middle',
    });
    const offTok = el(moving, 'g', { visibility: 'hidden' });
    el(offTok, 'rect', { x: -TOKEN * 1.2, y: -TOKEN / 2, width: TOKEN * 2.4, height: TOKEN, rx: 4, fill: c.bgSubtle, stroke: c.textMuted });
    const offTokText = text(offTok, 0, 0, '', { 'font-size': sm, 'font-family': mono, fill: c.text, 'text-anchor': 'middle' });
    const place = (g: SVGGElement, p: Pt): void => g.setAttribute('transform', `translate(${p.x} ${p.y})`);

    const markY = (route: 'hit' | 'walk'): number => (route === 'hit' ? LANE_HIT_Y : LANE_WALK_Y);
    const markFresh = (m: SVGCircleElement, route: 'hit' | 'walk'): void => {
      m.setAttribute('fill', route === 'hit' ? c.accent : c.itemActive);
      m.setAttribute('stroke', route === 'hit' ? c.accent : c.itemActive);
      m.removeAttribute('stroke-dasharray');
    };
    const markStale = (m: SVGCircleElement): void => {
      m.setAttribute('fill', c.bg);
      m.setAttribute('stroke', c.textMuted);
      m.setAttribute('stroke-dasharray', '2 2');
    };

    const slotHeight = (open: boolean): number => (open ? SLOT_H : SLOT_SHUT_H);
    const sizeSlot = (s: Slot, h: number, openness: number): void => {
      s.box.setAttribute('y', String(s.cy - h / 2));
      s.box.setAttribute('height', String(h));
      s.div.setAttribute('y1', String(s.cy - h / 2));
      s.div.setAttribute('y2', String(s.cy + h / 2));
      s.div.setAttribute('opacity', String(openness));
    };
    const styleSlot = (s: Slot, open: boolean): void => {
      s.box.setAttribute('fill', open ? c.bg : c.bgSubtle);
      s.box.setAttribute('stroke', open ? c.text : c.border);
      if (open) s.box.removeAttribute('stroke-dasharray');
      else s.box.setAttribute('stroke-dasharray', '3 3');
      s.label.setAttribute('fill', open ? c.text : c.textMuted);
    };
    const emptySlot = (s: Slot): void => {
      s.page.textContent = '';
      s.frame.textContent = '';
      s.used.textContent = '';
    };

    const clearCurrent = (): void => {
      for (const ch of chips) {
        ch.box.setAttribute('stroke', c.border);
        ch.box.setAttribute('stroke-width', '1');
      }
      for (const r of rows) r.box.setAttribute('stroke', c.border);
      for (const s of slotEls.slice(0, openSlots)) s.box.setAttribute('stroke', c.text);
    };

    const build = (): void => {
      stopAll();
      strip.remove();
      slotsLayer.remove();
      tableLayer.remove();
      strip = el(root, 'g', {});
      slotsLayer = el(root, 'g', {});
      tableLayer = el(root, 'g', {});
      root.insertBefore(strip, fixed);
      root.insertBefore(slotsLayer, fixed);
      root.insertBefore(tableLayer, fixed);

      chips = addresses.map((address, i) => {
        const x = X0 + i * COL;
        text(strip, x + CHIP_W / 2, CHIP_TOP - 10, String(i + 1), {
          'font-size': xs,
          fill: c.textMuted,
          'text-anchor': 'middle',
        });
        const box = el(strip, 'rect', {
          x,
          y: CHIP_TOP,
          width: CHIP_W,
          height: CHIP_H,
          rx: 3,
          fill: c.bg,
          stroke: c.border,
          'stroke-width': 1,
        });
        const label = text(strip, x + CHIP_W / 2, CHIP_TOP + CHIP_H / 2, `0x${hex(address, 4)}`, {
          'font-size': xs,
          'font-family': mono,
          fill: c.textMuted,
          'text-anchor': 'middle',
        });
        const route = lane[i] ?? null;
        const mark = el(strip, 'circle', {
          cx: x + CHIP_W / 2,
          cy: route ? markY(route) : CHIP_TOP + CHIP_H,
          r: MARK_R,
          'stroke-width': 1.5,
          visibility: route ? 'visible' : 'hidden',
        });
        if (route) markStale(mark);
        return { box, label, mark };
      });

      slotEls = [];
      for (let k = 0; k < maxSlots; k++) {
        const cy = ROW_TOP + k * SLOT_PITCH + SLOT_H / 2;
        const open = k < openSlots;
        const label = text(slotsLayer, SLOT_LABEL_X, cy, t('label.slot', 'slot {slot}', { slot: k + 1 }), {
          'font-size': xs,
        });
        const box = el(slotsLayer, 'rect', { x: SLOT_X, width: SLOT_W, rx: 4, 'stroke-width': 1 });
        const div = el(slotsLayer, 'line', { x1: SLOT_DIV_X, x2: SLOT_DIV_X, stroke: c.border });
        const cellFont = { 'font-size': lg, 'font-family': mono, fill: c.text, 'text-anchor': 'middle' };
        const page = text(slotsLayer, SLOT_PAGE_CX, cy, '', cellFont);
        const frame = text(slotsLayer, SLOT_FRAME_CX, cy, '', cellFont);
        const used = text(slotsLayer, SLOT_X + SLOT_W + 6, cy, '', { 'font-size': xs, fill: c.textMuted });
        const s: Slot = { box, div, label, page, frame, used, cy };
        styleSlot(s, open);
        sizeSlot(s, slotHeight(open), open ? 1 : 0);
        slotEls.push(s);
      }

      rows = pageTable.map((frame, p) => {
        const top = ROW_TOP + p * PT_PITCH;
        const cy = top + PT_H / 2;
        const box = el(tableLayer, 'rect', {
          x: PT_X,
          y: top,
          width: PT_W,
          height: PT_H,
          rx: 3,
          fill: c.bg,
          stroke: c.border,
          'stroke-width': 1,
        });
        el(tableLayer, 'line', { x1: PT_DIV_X, x2: PT_DIV_X, y1: top, y2: top + PT_H, stroke: c.border });
        const cellFont = { 'font-size': sm, 'font-family': mono, fill: c.text, 'text-anchor': 'middle' };
        text(tableLayer, PT_PAGE_CX, cy, hex(p, 1), cellFont);
        text(tableLayer, PT_FRAME_CX, cy, hex(frame, 1), cellFont);
        return { box, cy };
      });

      for (const node of [vaPrefix, vaPage, vaOff, paPrefix, paFrame, paOff, splitPage, splitOff]) node.textContent = '';
      caption1.textContent = '';
      caption2.textContent = '';
      hitRateText.textContent = '';
      pageTok.setAttribute('visibility', 'hidden');
      offTok.setAttribute('visibility', 'hidden');
    };

    const stage: PagingStage = {
      setup(data) {
        if (data.pageBytes !== 4096) {
          // 주소 16진 네 자리를 한 자리 | 세 자리로 가르는 그림은 4 KiB 페이지에 기댄다.
          throw new Error(`paging-stage: 페이지 크기 ${data.pageBytes} 는 그릴 수 없다 (4096 이어야 한다)`);
        }
        addresses = [...data.addresses];
        pageTable = [...data.pageTable];
        maxSlots = data.maxSlots;
        openSlots = 0;
        lane = addresses.map(() => null);
        build();
      },

      async startRun(slots, ms) {
        if (slots < 0 || slots > maxSlots) throw new Error(`paging-stage: 칸 수 ${slots} 가 자리(${maxSlots})를 넘는다`);
        stopAll();
        const before = openSlots;
        openSlots = slots;
        clearCurrent();
        for (const ch of chips) ch.label.setAttribute('fill', c.textMuted);
        chips.forEach((ch, i) => {
          if (lane[i]) markStale(ch.mark);
        });
        for (const s of slotEls) emptySlot(s);
        for (const node of [vaPrefix, vaPage, vaOff, paPrefix, paFrame, paOff, splitPage, splitOff]) node.textContent = '';
        pageTok.setAttribute('visibility', 'hidden');
        offTok.setAttribute('visibility', 'hidden');
        hitRateText.textContent = '';
        caption1.textContent = t('caption.start', 'TLB slots: {n}', { n: slots });
        caption2.textContent = '';
        slotEls.forEach((s, k) => styleSlot(s, k < slots));
        await tween(ms, (u) => {
          const e = ease(u);
          slotEls.forEach((s, k) => {
            const was = k < before ? 1 : 0;
            const now = k < slots ? 1 : 0;
            const o = lerp(was, now, e);
            sizeSlot(s, lerp(SLOT_SHUT_H, SLOT_H, o), o);
          });
        });
      },

      async translate(step, ms) {
        const chip = chips[step.index];
        if (!chip) throw new Error(`paging-stage: 참조 #${step.index + 1} 의 자리가 없다`);
        const row = rows[step.page];
        if (!row) throw new Error(`paging-stage: 페이지 표에 페이지 ${step.page} 줄이 없다`);
        const slot = step.slot >= 0 ? slotEls[step.slot] : undefined;
        if (step.slot >= 0 && !slot) throw new Error(`paging-stage: TLB 칸 ${step.slot} 이 없다`);
        if (step.route === 'hit' && !slot) throw new Error('paging-stage: 적중인데 칸이 없다');
        stopAll();
        clearCurrent();

        // 지금 참조
        chip.box.setAttribute('stroke', c.accent);
        chip.box.setAttribute('stroke-width', '2');
        chip.label.setAttribute('fill', c.text);
        const pageDigit = hex(step.page, 1);
        const offDigits = hex(step.offset, 3);
        const frameDigit = hex(step.frame, 1);
        vaPrefix.textContent = '0x';
        vaPage.textContent = pageDigit;
        vaOff.textContent = offDigits;
        for (const node of [paPrefix, paFrame, paOff, splitPage, splitOff]) node.textContent = '';

        const caption = t('caption.split', 'Page: {page} · Offset: {offset} · Physical: {addr}', {
          page: pageDigit,
          offset: `0x${offDigits}`,
          addr: `0x${hex(step.physical, 4)}`,
        });
        const parts: string[] = [];
        if (step.route === 'hit') {
          parts.push(t('caption.hit', 'TLB hit: slot {slot}', { slot: step.slot + 1 }));
        } else {
          parts.push(t('caption.walk', 'Table walk: page {page} → frame {frame}', { page: pageDigit, frame: frameDigit }));
          if (step.slot >= 0) parts.push(t('caption.written', 'Written to slot {slot}', { slot: step.slot + 1 }));
          if (step.evicted >= 0) parts.push(t('caption.evicted', 'Evicted from TLB: page {page}', { page: hex(step.evicted, 1) }));
        }
        caption1.textContent = caption;
        caption2.textContent = parts.join(' · ');
        hitRateText.textContent = t('label.hitRate', 'Hit rate: {p}%', { p: step.hitRate });

        // 경로
        const midY = VA_TOP + VA_H / 2;
        const splitY = SPLIT_TOP + SPLIT_H / 2;
        const paY = PA_TOP + PA_H / 2;
        const pageFrom: Pt = { x: pageCharX + charW / 2, y: midY };
        const pageSplit: Pt = { x: PAGE_BOX.x + PAGE_BOX.w / 2, y: splitY };
        const offFrom: Pt = { x: offCharX + 1.5 * charW, y: midY };
        const offSplit: Pt = { x: OFF_BOX.x + OFF_BOX.w / 2, y: splitY };
        const frameTo: Pt = { x: pageCharX + charW / 2, y: paY };
        const offTo: Pt = { x: offCharX + 1.5 * charW, y: paY };
        const tableCell: Pt = { x: PT_PAGE_CX, y: row.cy };
        const tlbTop: Pt = { x: SLOT_PAGE_CX, y: CELL_HEAD_Y };
        /** 페이지 번호를 들고 가는 구간과 프레임 번호를 들고 오는 구간 */
        let outbound: Pt[];
        let inbound: Pt[];
        if (step.route === 'hit' && slot) {
          outbound = [pageSplit, { x: SLOT_PAGE_CX, y: slot.cy }];
          inbound = [{ x: SLOT_FRAME_CX, y: slot.cy }, frameTo];
        } else if (slot) {
          outbound = [pageSplit, tlbTop, { x: SLOT_X + SLOT_W + 40, y: CELL_HEAD_Y }, tableCell];
          inbound = [{ x: PT_FRAME_CX, y: row.cy }, { x: SLOT_FRAME_CX, y: slot.cy }, frameTo];
        } else {
          outbound = [pageSplit, tlbTop, { x: SLOT_X + SLOT_W + 40, y: CELL_HEAD_Y }, tableCell];
          inbound = [{ x: PT_FRAME_CX, y: row.cy }, frameTo];
        }

        // 내보낼 줄 — 적힐 때 오른쪽으로 밀려 나간다
        let pushed: SVGTextElement | null = null;
        if (step.route === 'walk' && slot && step.evicted >= 0) {
          pushed = text(moving, SLOT_X + SLOT_W / 2, slot.cy, `${slot.page.textContent ?? ''}   ${slot.frame.textContent ?? ''}`, {
            'font-size': lg,
            'font-family': mono,
            fill: c.textMuted,
            'text-anchor': 'middle',
            'text-decoration': 'line-through',
          });
          emptySlot(slot);
        }

        const mark = chip.mark;
        const markFrom = lane[step.index] ? markY(lane[step.index]!) : CHIP_TOP + CHIP_H;
        const markTo = markY(step.route);
        mark.setAttribute('visibility', 'visible');
        markFresh(mark, step.route);
        lane[step.index] = step.route;

        const SPLIT_END = 0.2;
        const TURN = step.route === 'hit' ? 0.5 : 0.62;
        pageTokText.textContent = pageDigit;
        offTokText.textContent = offDigits;
        place(pageTok, pageFrom);
        place(offTok, offFrom);
        pageTok.setAttribute('visibility', 'visible');
        offTok.setAttribute('visibility', 'visible');
        vaPage.setAttribute('opacity', '0.3');
        vaOff.setAttribute('opacity', '0.3');
        let turned = false;
        let written = false;

        await tween(ms, (u) => {
          // 표지 — 앞 판의 길에서 이번 길로
          mark.setAttribute('cy', String(lerp(markFrom, markTo, ease(u))));
          if (u < SPLIT_END) {
            const e = ease(u / SPLIT_END);
            place(pageTok, { x: lerp(pageFrom.x, pageSplit.x, e), y: lerp(pageFrom.y, pageSplit.y, e) });
            place(offTok, { x: lerp(offFrom.x, offSplit.x, e), y: lerp(offFrom.y, offSplit.y, e) });
            return;
          }
          splitPage.textContent = pageDigit;
          splitOff.textContent = offDigits;
          if (u < TURN) {
            place(offTok, offSplit);
            place(pageTok, along(outbound, (u - SPLIT_END) / (TURN - SPLIT_END)));
            if (step.route === 'walk' && u > SPLIT_END + (TURN - SPLIT_END) * 0.66) row.box.setAttribute('stroke', c.itemActive);
            if (step.route === 'hit' && slot && u > SPLIT_END + (TURN - SPLIT_END) * 0.8) slot.box.setAttribute('stroke', c.accent);
            return;
          }
          if (!turned) {
            turned = true;
            pageTokText.textContent = frameDigit;
          }
          const v = (u - TURN) / (1 - TURN);
          place(pageTok, along(inbound, v));
          place(offTok, along([offSplit, offTo], v));
          if (pushed) {
            pushed.setAttribute('transform', `translate(${ease(Math.min(1, v * 2)) * 70} 0)`);
            pushed.setAttribute('opacity', String(1 - Math.min(1, v * 2)));
          }
          if (step.route === 'walk' && slot && !written && v >= 0.5) {
            written = true;
            slot.page.textContent = pageDigit;
            slot.frame.textContent = frameDigit;
            slot.box.setAttribute('stroke', c.itemActive);
          }
        });

        pushed?.remove();
        pageTok.setAttribute('visibility', 'hidden');
        offTok.setAttribute('visibility', 'hidden');
        mark.setAttribute('cy', String(markTo));
        vaPage.removeAttribute('opacity');
        vaOff.removeAttribute('opacity');
        splitPage.textContent = pageDigit;
        splitOff.textContent = offDigits;
        if (slot) {
          slot.page.textContent = pageDigit;
          slot.frame.textContent = frameDigit;
          slot.used.textContent = `#${step.index + 1}`;
        }
        paPrefix.textContent = '0x';
        paFrame.textContent = frameDigit;
        paOff.textContent = offDigits;
      },

      clear() {
        stopAll();
        lane = lane.map(() => null);
        openSlots = 0;
        build();
      },

      destroy() {
        stopAll();
        root.remove();
      },
    };

    // 러너 밖(검사)에서 initialData 없이 마운트해도 던지지 않는다 — 틀만 그린다.
    build();
    return stage as unknown as ReturnType<CanvasView['mount']>;
  },
};
