/**
 * arp-stage — 링크 셋 위로 퍼졌다 돌아오는 물음과 쌓이는 ARP 표.
 *
 * 장치 다섯 · 링크 셋 · 표 다섯은 두 목적지 모두 같은 자리에 있다. 같은 망이면 쓰지 않는
 * 링크 쪽이 흐려질 뿐 자리를 옮기지 않는다. 캔버스 세로는 마운트 때 정해 두고 바꾸지 않는다.
 *
 * 운동
 *   - 첫 물음의 화살 끝이 판마다 묻는 IP 의 주인 쪽으로 옮겨 간다 (C ↔ R1)
 *   - 방송: 요청 점이 그 링크의 들은 곳마다 퍼지고, 주인의 답 점이 묻는 이에게만 돌아온다
 *   - 표에서: 표의 줄이 떠올라 프레임 칸의 받는 이 MAC 자리로 옮겨 간다
 *   - 데이터 프레임이 링크를 건너고, 프레임 칸의 MAC 쌍 줄은 링크마다 떼어지고 새로 붙는다 (IP 줄은 그대로)
 *   - 캐시가 켜지면 물음 하나로 두 표에 줄이 하나씩 내려앉는다
 *
 * 걸음이 끝난 화면에 남는 것 — 방송을 들은 곳의 표지 · 답한 주인의 표지 · 링크마다 쓰인 MAC 쌍 · 표의 줄.
 * 이 stage 는 셈하지 않는다 — 받은 값만 그린다.
 */
import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 860;
const HEIGHT = 420;

const STRIP_TOP = 8;
const BOX_TOP = 96;
const BOX_H = 32;
const BUS_Y = 168;
const TABLE_TOP = 254;
const TABLE_W = 150;
const ROW_H = 18;
const TABLE_ROWS = 2;
const CAPTION_Y = [344, 364, 384, 404];
const ROUTER_STUB = 40;
const CELL_W = 40;
const CELL_GAP = 6;
const CELL_X = 110;

type Iface = { link: string; mac: string; ip: string };
type Node = { id: string; symbol: string; ifaces: Iface[] };

export type ArpRoundView = {
  cache: boolean;
  srcIp: string;
  dstIp: string;
  usedLinks: string[];
  usedNodes: string[];
};

export type ArpPickView = {
  srcIp: string;
  dstIp: string;
  octets: number;
  same: boolean;
  askIp: string;
  owner: string;
};

export type ArpHopView = {
  kind: 'broadcast' | 'table';
  from: string;
  to: string;
  link: string;
  heard: string[];
  srcMac: string;
  dstMac: string;
  srcIp: string;
  dstIp: string;
  row: number;
  adds: { node: string; sym: string; ip: string; mac: string }[];
  updates: { node: string; sym: string; row: number; ip: string; mac: string }[];
  newPair: boolean;
};

export type ArpStageApi = {
  startRound(p: ArpRoundView, ms: number): Promise<void>;
  pick(p: ArpPickView, ms: number): Promise<void>;
  hop(p: ArpHopView, ms: number): Promise<void>;
  setCaption(lines: string[]): void;
  clear(): void;
};

function readNodes(initial: Record<string, unknown> | undefined): { nodes: Node[]; sender: string } {
  if (!initial) return { nodes: [], sender: '' };
  const raw = initial['nodes'];
  const sender = typeof initial['sender'] === 'string' ? initial['sender'] : '';
  if (!Array.isArray(raw)) return { nodes: [], sender };
  const nodes: Node[] = raw.map((x) => {
    if (!x || typeof x !== 'object') throw new Error('[arp-stage] 장치 자료가 아니다');
    const o = x as Record<string, unknown>;
    const ifs = o['ifaces'];
    if (typeof o['id'] !== 'string' || typeof o['symbol'] !== 'string' || !Array.isArray(ifs)) {
      throw new Error('[arp-stage] 장치 자료가 아니다');
    }
    return {
      id: o['id'],
      symbol: o['symbol'],
      ifaces: ifs.map((f) => {
        const q = f as Record<string, unknown>;
        if (typeof q['link'] !== 'string' || typeof q['mac'] !== 'string' || typeof q['ip'] !== 'string') {
          throw new Error('[arp-stage] 인터페이스 자료가 아니다');
        }
        return { link: q['link'], mac: q['mac'], ip: q['ip'] };
      }),
    };
  });
  return { nodes, sender };
}

/** 좁은 자리용 — 뒤 두 묶음만 */
function shortMac(mac: string): string {
  const parts = mac.split(':');
  if (parts.length !== 6) throw new Error(`[arp-stage] MAC 이 아니다: ${mac}`);
  return `…:${parts[4]}:${parts[5]}`;
}

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

export const arpStageView: CanvasView = {
  canvas: { width: WIDTH, height: HEIGHT },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const { nodes, sender } = readNodes(params.initialData);
    const monoPx = parseFloat(fontSizes.xs);

    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) e.setAttribute(k, String(val));
      parent.appendChild(e);
      return e;
    };
    const text = (
      parent: Element,
      x: number,
      y: number,
      body: string,
      opts: { size?: string; mono?: boolean; fill?: string; anchor?: string; weight?: string } = {},
    ): SVGTextElement => {
      const e = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.xs,
          fill: opts.fill ?? c.text,
          'text-anchor': opts.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opts.weight) e.setAttribute('font-weight', opts.weight);
      e.textContent = body;
      return e;
    };

    /** 진행률 k(0→1)를 ms 동안 그린다. 되짚는 중이면 끝 상태로 건너뛴다 */
    const tween = (ms: number, draw: (k: number) => void): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed || isInstant() || ms <= 0 || typeof requestAnimationFrame !== 'function') {
          draw(1);
          resolve();
          return;
        }
        const start = performance.now();
        const done = (): void => {
          waiters.delete(done);
          resolve();
        };
        waiters.add(done);
        const tick = (now: number): void => {
          if (destroyed || isInstant()) {
            draw(1);
            done();
            return;
          }
          const k = Math.min(1, (now - start) / ms);
          draw(ease(k));
          if (k >= 1) {
            done();
            return;
          }
          const id = requestAnimationFrame((n) => {
            frames.delete(id);
            tick(n);
          });
          frames.add(id);
        };
        const id = requestAnimationFrame((n) => {
          frames.delete(id);
          tick(n);
        });
        frames.add(id);
      });

    params.onScrubStart?.(() => {
      for (const id of frames) cancelAnimationFrame(id);
      frames.clear();
      for (const w of [...waiters]) w();
      waiters.clear();
    });

    // ── 자리 — 장치 차례대로 칸을 나눈다 (두 목적지 모두 같은 자리)
    const slot = nodes.length > 0 ? WIDTH / nodes.length : WIDTH;
    const nodeX = new Map<string, number>();
    nodes.forEach((nd, i) => nodeX.set(nd.id, slot * (i + 0.5)));
    const links: string[] = [];
    for (const nd of nodes) for (const f of nd.ifaces) if (!links.includes(f.link)) links.push(f.link);
    /** 장치가 그 링크에 내린 기둥의 x */
    const stubX = (id: string, link: string): number => {
      const nd = nodes.find((x) => x.id === id);
      const cx = nodeX.get(id);
      if (!nd || cx === undefined) throw new Error(`[arp-stage] 없는 장치: ${id}`);
      const k = nd.ifaces.findIndex((f) => f.link === link);
      if (k < 0) throw new Error(`[arp-stage] ${nd.symbol} 는 ${link} 에 없다`);
      if (nd.ifaces.length === 1) return cx;
      return cx + (k === 0 ? -ROUTER_STUB : ROUTER_STUB);
    };
    const linkSpan = new Map<string, [number, number]>();
    for (const l of links) {
      const xs = nodes.filter((nd) => nd.ifaces.some((f) => f.link === l)).map((nd) => stubX(nd.id, l));
      linkSpan.set(l, [Math.min(...xs) - 16, Math.max(...xs) + 16]);
    }

    const root = el('g', {}, svg);
    el('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, fill: c.bg }, root);

    // ── 윗줄 왼쪽: 옥텟 견줌
    const strip = el('g', {}, root);
    const senderNode = nodes.find((x) => x.id === sender);
    text(strip, 16, STRIP_TOP + 11, senderNode ? senderNode.symbol : '', { size: fontSizes.sm, weight: '600' });
    text(strip, 16, STRIP_TOP + 43, t('label.destination', 'Destination'), { size: fontSizes.sm, fill: c.textMuted });
    const cellsTop: { rect: SVGRectElement; label: SVGTextElement }[] = [];
    const cellsBottom: { rect: SVGRectElement; label: SVGTextElement }[] = [];
    const marks: SVGTextElement[] = [];
    for (let k = 0; k < 4; k++) {
      const x = CELL_X + k * (CELL_W + CELL_GAP);
      for (const [row, list] of [
        [0, cellsTop],
        [1, cellsBottom],
      ] as const) {
        const y = STRIP_TOP + row * 32;
        const rect = el(
          'rect',
          { x, y, width: CELL_W, height: 22, rx: 3, fill: c.bgSubtle, stroke: c.border, 'stroke-width': 1 },
          strip,
        );
        const label = text(strip, x + CELL_W / 2, y + 11, '', { mono: true, anchor: 'middle' });
        list.push({ rect, label });
      }
      marks.push(text(strip, x + CELL_W / 2, STRIP_TOP + 27, '', { size: fontSizes.sm, anchor: 'middle' }));
    }
    const askX = CELL_X + 4 * (CELL_W + CELL_GAP) + 12;
    text(strip, askX, STRIP_TOP + 11, t('label.askFor', 'Ask for'), { fill: c.textMuted });
    const askValue = text(strip, askX, STRIP_TOP + 32, '', { mono: true, size: fontSizes.sm, weight: '600' });

    // ── 윗줄 오른쪽: 데이터 프레임 칸 (MAC 쌍 줄은 링크마다 갈리고 IP 줄은 따라간다)
    const panelX = 460;
    const panel = el('g', {}, root);
    el(
      'rect',
      { x: panelX, y: STRIP_TOP, width: WIDTH - panelX - 12, height: 58, rx: 4, fill: c.bgSubtle, stroke: c.border },
      panel,
    );
    text(panel, panelX + 10, STRIP_TOP + 11, t('label.frame', 'Data frame'), { fill: c.textMuted });
    text(panel, panelX + 10, STRIP_TOP + 29, t('label.mac', 'MAC'), { weight: '600' });
    text(panel, panelX + 10, STRIP_TOP + 47, t('label.ip', 'IP'), { weight: '600' });
    const macSlotX = panelX + 50;
    let macRow = el('g', {}, panel);
    const ipRow = text(panel, macSlotX, STRIP_TOP + 47, '', { mono: true });
    const arrowGap = ' → ';
    /** 받는 이 MAC 이 놓이는 x — 표의 줄이 옮겨 가는 곳 */
    const dstMacX = (src: string): number => macSlotX + (src.length + arrowGap.length) * monoPx * 0.6;
    const fillMacRow = (g: SVGGElement, src: string, dst: string): void => {
      text(g, macSlotX, STRIP_TOP + 29, `${src}${arrowGap}`, { mono: true });
      text(g, dstMacX(src), STRIP_TOP + 29, dst, { mono: true, weight: '600' });
    };

    // ── 링크 · 장치 · 기둥
    const linkLayer = el('g', {}, root);
    const linkGroups = new Map<string, SVGGElement>();
    const chipLayer = new Map<string, SVGGElement>();
    links.forEach((l, i) => {
      const [x0, x1] = linkSpan.get(l)!;
      const g = el('g', { style: 'transition: opacity 400ms' }, linkLayer);
      el('line', { x1: x0, y1: BUS_Y, x2: x1, y2: BUS_Y, stroke: c.textMuted, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
      text(g, (x0 + x1) / 2, 216, t('label.link', 'Link {n}', { n: i + 1 }), { fill: c.textMuted, anchor: 'middle' });
      chipLayer.set(l, el('g', {}, g));
      linkGroups.set(l, g);
    });

    const nodeLayer = el('g', {}, root);
    const nodeGroups = new Map<string, SVGGElement>();
    const heardLayer = el('g', {}, root);
    for (const nd of nodes) {
      const cx = nodeX.get(nd.id)!;
      const g = el('g', { style: 'transition: opacity 400ms' }, nodeLayer);
      const w = nd.ifaces.length > 1 ? ROUTER_STUB * 2 + 24 : 52;
      for (const f of nd.ifaces) {
        const sx = stubX(nd.id, f.link);
        el('line', { x1: sx, y1: BOX_TOP + BOX_H, x2: sx, y2: BUS_Y, stroke: c.textMuted, 'stroke-width': 1.5 }, g);
        el('circle', { cx: sx, cy: BUS_Y, r: 3.5, fill: c.textMuted }, g);
        text(g, sx, BUS_Y + 16, f.ip, { mono: true, anchor: 'middle' });
        text(g, sx, BUS_Y + 29, shortMac(f.mac), { mono: true, anchor: 'middle', fill: c.textMuted });
      }
      el(
        'rect',
        { x: cx - w / 2, y: BOX_TOP, width: w, height: BOX_H, rx: 6, fill: c.bgSubtle, stroke: c.text, 'stroke-width': 1.2 },
        g,
      );
      text(g, cx, BOX_TOP + BOX_H / 2, nd.symbol, { size: fontSizes.md, weight: '600', anchor: 'middle' });
      nodeGroups.set(nd.id, g);
    }

    // ── 첫 물음의 화살 (판마다 끝이 옮겨 간다)
    const arrowLayer = el('g', {}, root);
    const arrowPath = el(
      'path',
      { d: '', fill: 'none', stroke: c.accent, 'stroke-width': 1.6, 'stroke-dasharray': '5 3', opacity: 0 },
      arrowLayer,
    );
    const arrowHead = el('path', { d: '', fill: c.accent, opacity: 0 }, arrowLayer);
    let arrowEnd: number | null = null;
    const drawArrow = (x1: number): void => {
      const x0 = senderNode ? nodeX.get(senderNode.id)! : 0;
      const y = BOX_TOP - 2;
      const mid = (x0 + x1) / 2;
      const top = BOX_TOP - 26;
      arrowPath.setAttribute('d', `M ${x0} ${y} Q ${mid} ${top - 12} ${x1} ${y}`);
      arrowHead.setAttribute('d', `M ${x1} ${y} l -4 -8 l 8 0 z`);
    };

    // ── 표 다섯
    const tableLayer = el('g', {}, root);
    const tableBox = new Map<string, SVGRectElement>();
    const tableEmpty = new Map<string, SVGTextElement>();
    const tableRows = new Map<string, SVGGElement[]>();
    const rowLayer = new Map<string, SVGGElement>();
    const tableGroups = new Map<string, SVGGElement>();
    for (const nd of nodes) {
      const cx = nodeX.get(nd.id)!;
      const g = el('g', { style: 'transition: opacity 400ms' }, tableLayer);
      const box = el(
        'rect',
        {
          x: cx - TABLE_W / 2,
          y: TABLE_TOP,
          width: TABLE_W,
          height: 22 + TABLE_ROWS * ROW_H + 4,
          rx: 4,
          fill: c.bg,
          stroke: c.border,
          'stroke-width': 1,
        },
        g,
      );
      text(g, cx - TABLE_W / 2 + 8, TABLE_TOP + 11, t('label.table', 'ARP table · {node}', { node: nd.symbol }), {
        fill: c.textMuted,
      });
      const empty = text(g, cx, TABLE_TOP + 22 + ROW_H, t('label.noTable', 'no table'), {
        anchor: 'middle',
        fill: c.textMuted,
      });
      tableBox.set(nd.id, box);
      tableEmpty.set(nd.id, empty);
      tableRows.set(nd.id, []);
      rowLayer.set(nd.id, el('g', {}, g));
      tableGroups.set(nd.id, g);
    }

    // ── 움직이는 것들 · 캡션
    const flyLayer = el('g', {}, root);
    const frameGlyph = el('g', { opacity: 0 }, flyLayer);
    el('rect', { x: -18, y: -9, width: 18, height: 18, fill: c.primary, rx: 2 }, frameGlyph);
    el('rect', { x: 0, y: -9, width: 18, height: 18, fill: c.bg, stroke: c.primary, 'stroke-width': 1.5, rx: 2 }, frameGlyph);
    text(frameGlyph, -9, 0, 'M', { size: fontSizes.xs, weight: '700', anchor: 'middle', fill: c.textInverse });
    text(frameGlyph, 9, 0, 'I', { size: fontSizes.xs, weight: '700', anchor: 'middle', fill: c.primary });
    const glyphAt = (x: number, y: number): void => frameGlyph.setAttribute('transform', `translate(${x} ${y})`);

    const captions = CAPTION_Y.map((y, i) =>
      text(root, 16, y, '', { size: i === 0 ? fontSizes.sm : fontSizes.sm, weight: i === 0 ? '600' : '400' }),
    );

    let cacheOn = false;

    const setTableMode = (on: boolean): void => {
      cacheOn = on;
      for (const nd of nodes) {
        const box = tableBox.get(nd.id)!;
        box.setAttribute('stroke-dasharray', on ? '' : '4 3');
        tableEmpty.get(nd.id)!.setAttribute('opacity', on ? '0' : '1');
      }
    };

    const clearMarks = (): void => {
      while (heardLayer.firstChild) heardLayer.removeChild(heardLayer.firstChild);
    };

    const badge = (id: string, glyph: string, color: string, dx: number): void => {
      const cx = nodeX.get(id);
      if (cx === undefined) throw new Error(`[arp-stage] 없는 장치: ${id}`);
      const nd = nodes.find((x) => x.id === id)!;
      const w = nd.ifaces.length > 1 ? ROUTER_STUB * 2 + 24 : 52;
      const g = el('g', {}, heardLayer);
      const x = cx + w / 2 + dx;
      el('circle', { cx: x, cy: BOX_TOP, r: 8, fill: c.bg, stroke: color, 'stroke-width': 1.5 }, g);
      text(g, x, BOX_TOP + 0.5, glyph, { size: fontSizes.xs, weight: '700', anchor: 'middle', fill: color });
    };

  /** 이미 있던 줄을 같은 자리에서 고친다 — 줄을 더 쌓지 않는다 */
    const updateRow = (node: string, row: number, ip: string, mac: string): SVGGElement => {
      const g = tableRows.get(node)?.[row];
      if (!g) throw new Error(`[arp-stage] 고칠 줄이 없다: ${node} ${row}`);
      const [ipText, macText] = Array.from(g.children);
      if (!ipText || !macText) throw new Error(`[arp-stage] 줄 모양이 아니다: ${node} ${row}`);
      ipText.textContent = ip;
      macText.textContent = shortMac(mac);
      return g;
    };

    const addRow = (node: string, ip: string, mac: string): SVGGElement => {
      const rows = tableRows.get(node);
      const layer = rowLayer.get(node);
      const cx = nodeX.get(node);
      if (!rows || !layer || cx === undefined) throw new Error(`[arp-stage] 없는 장치: ${node}`);
      if (rows.length >= TABLE_ROWS) throw new Error(`[arp-stage] 표 줄이 자리를 넘는다: ${node}`);
      const y = TABLE_TOP + 22 + rows.length * ROW_H + ROW_H / 2;
      const g = el('g', {}, layer);
      text(g, cx - TABLE_W / 2 + 8, y, ip, { mono: true });
      text(g, cx + TABLE_W / 2 - 8, y, shortMac(mac), { mono: true, anchor: 'end', weight: '600' });
      g.dataset['y'] = String(y);
      rows.push(g);
      return g;
    };

    const api: ArpStageApi = {
      async startRound(p, ms) {
        setTableMode(p.cache);
        for (const l of links) linkGroups.get(l)!.style.opacity = p.usedLinks.includes(l) ? '1' : '0.28';
        for (const nd of nodes) {
          const used = p.usedNodes.includes(nd.id);
          nodeGroups.get(nd.id)!.style.opacity = used ? '1' : '0.28';
          tableGroups.get(nd.id)!.style.opacity = used ? '1' : '0.28';
        }
        clearMarks();
        ipRow.textContent = `${p.srcIp}${arrowGap}${p.dstIp}`;
        // 앞 판의 표 줄 · MAC 쌍 · 프레임이 흩어진다
        const leaving: SVGGElement[] = [];
        for (const nd of nodes) leaving.push(...tableRows.get(nd.id)!);
        for (const l of links) leaving.push(...(Array.from(chipLayer.get(l)!.children) as SVGGElement[]));
        const oldMac = macRow;
        const x0 = senderNode ? nodeX.get(senderNode.id)! : 0;
        await tween(ms, (k) => {
          for (const g of leaving) {
            g.setAttribute('opacity', String(1 - k));
            g.setAttribute('transform', `translate(0 ${-8 * k})`);
          }
          oldMac.setAttribute('opacity', String(1 - k));
          frameGlyph.setAttribute('opacity', String(1 - k));
        });
        for (const g of leaving) g.remove();
        for (const nd of nodes) tableRows.set(nd.id, []);
        oldMac.remove();
        macRow = el('g', {}, panel);
        glyphAt(x0, BUS_Y - 18);
      },

      async pick(p, ms) {
        const a = p.srcIp.split('.');
        const b = p.dstIp.split('.');
        if (a.length !== 4 || b.length !== 4) throw new Error('[arp-stage] IPv4 가 아니다');
        for (let k = 0; k < 4; k++) {
          const inPrefix = k < p.octets;
          const eq = a[k] === b[k];
          cellsTop[k]!.label.textContent = a[k]!;
          cellsBottom[k]!.label.textContent = b[k]!;
          for (const cell of [cellsTop[k]!, cellsBottom[k]!]) {
            cell.rect.setAttribute('stroke', inPrefix ? (eq ? c.text : c.danger) : c.border);
            cell.rect.setAttribute('stroke-width', inPrefix ? '1.6' : '1');
            cell.label.setAttribute('fill', inPrefix ? c.text : c.textMuted);
          }
          marks[k]!.textContent = inPrefix ? (eq ? '=' : '≠') : '';
          marks[k]!.setAttribute('fill', eq ? c.text : c.danger);
        }
        askValue.textContent = p.askIp;
        const target = nodeX.get(p.owner);
        if (target === undefined) throw new Error(`[arp-stage] 없는 장치: ${p.owner}`);
        const from = arrowEnd ?? target;
        arrowPath.setAttribute('opacity', '1');
        arrowHead.setAttribute('opacity', '1');
        await tween(from === target ? 0 : ms, (k) => drawArrow(from + (target - from) * k));
        arrowEnd = target;
      },

      async hop(p, ms) {
        clearMarks();
        const fromX = stubX(p.from, p.link);
        const toX = stubX(p.to, p.link);
        const cross = p.kind === 'broadcast' ? ms * 0.4 : ms * 0.5;
        const ask = ms - cross;

        const landing: { g: SVGGElement; drop: number }[] = [];
        if (p.kind === 'broadcast') {
          // 요청이 들은 곳마다 퍼진다 → 주인의 답이 묻는 이에게만 돌아온다
          const dots = p.heard.map((id) => {
            const g = el('g', {}, flyLayer);
            el('circle', { cx: 0, cy: 0, r: 8, fill: c.bg, stroke: c.accent, 'stroke-width': 1.6 }, g);
            text(g, 0, 0.5, '?', { size: fontSizes.xs, weight: '700', anchor: 'middle', fill: c.accent });
            return { g, x: stubX(id, p.link) };
          });
          await tween(ask * 0.6, (k) => {
            for (const d of dots) d.g.setAttribute('transform', `translate(${fromX + (d.x - fromX) * k} ${BUS_Y})`);
          });
          for (const d of dots) d.g.remove();
          for (const id of p.heard) badge(id, '?', c.accent, 0);
          const reply = el('g', {}, flyLayer);
          el('circle', { cx: 0, cy: 0, r: 8, fill: c.success }, reply);
          text(reply, 0, 0.5, '!', { size: fontSizes.xs, weight: '700', anchor: 'middle', fill: c.textInverse });
          await tween(ask * 0.4, (k) => reply.setAttribute('transform', `translate(${toX + (fromX - toX) * k} ${BUS_Y})`));
          reply.remove();
          badge(p.to, '!', c.success, 20);
          // 물음 하나로 두 표에 한 줄씩 — 장치에서 표로 내려앉는다 (프레임이 건너는 동안)
          for (const u of p.updates) {
            const g = updateRow(u.node, u.row, u.ip, u.mac);
            g.setAttribute('opacity', '0');
            landing.push({ g, drop: 0 });
          }
          for (const a of p.adds) {
            const g = addRow(a.node, a.ip, a.mac);
            const drop = Number(g.dataset['y']) - (BOX_TOP + BOX_H);
            g.setAttribute('opacity', '0');
            landing.push({ g, drop });
          }
        } else {
          // 표의 줄이 떠올라 프레임 칸의 받는 이 MAC 자리로 옮겨 간다
          const rows = tableRows.get(p.from);
          const src = rows?.[p.row];
          const cx = nodeX.get(p.from);
          if (!src || cx === undefined) throw new Error(`[arp-stage] 표에 없는 줄: ${p.from} ${p.row}`);
          const y0 = Number(src.dataset['y']);
          const chip = el('g', {}, flyLayer);
          el('rect', { x: -34, y: -9, width: 68, height: 18, rx: 3, fill: c.bg, stroke: c.primary, 'stroke-width': 1.5 }, chip);
          text(chip, 0, 0.5, shortMac(p.dstMac), { mono: true, anchor: 'middle', weight: '600', fill: c.primary });
          const x0 = cx + TABLE_W / 2 - 34;
          const x1 = dstMacX(p.srcMac) + 34;
          const y1 = STRIP_TOP + 29;
          src.setAttribute('font-weight', '700');
          await tween(ask, (k) => {
            chip.setAttribute('transform', `translate(${x0 + (x1 - x0) * k} ${y0 + (y1 - y0) * k})`);
          });
          chip.remove();
          badge(p.from, '≡', c.primary, 0);
        }

        // MAC 쌍 줄을 떼고 새로 붙인다 — IP 줄은 그대로
        const oldMac = macRow;
        const fresh = el('g', { opacity: 0 }, panel);
        fillMacRow(fresh, p.srcMac, p.dstMac);
        macRow = fresh;
        ipRow.textContent = `${p.srcIp}${arrowGap}${p.dstIp}`;
        let chip: SVGGElement | null = null;
        if (p.newPair) {
          const [a, b] = linkSpan.get(p.link)!;
          chip = el('g', { opacity: 0 }, chipLayer.get(p.link)!);
          text(chip, (a + b) / 2, 234, `${shortMac(p.srcMac)} → ${shortMac(p.dstMac)}`, {
            mono: true,
            anchor: 'middle',
            fill: c.primary,
          });
        }
        frameGlyph.setAttribute('opacity', '1');
        await tween(cross, (k) => {
          glyphAt(fromX + (toX - fromX) * k, BUS_Y - 18);
          oldMac.setAttribute('opacity', String(1 - k));
          oldMac.setAttribute('transform', `translate(0 ${-10 * k})`);
          fresh.setAttribute('opacity', String(k));
          fresh.setAttribute('transform', `translate(${16 * (1 - k)} 0)`);
          if (chip) chip.setAttribute('opacity', String(k));
          for (const r of landing) {
            r.g.setAttribute('opacity', String(k));
            r.g.setAttribute('transform', `translate(0 ${-r.drop * (1 - k)})`);
          }
        });
        oldMac.remove();
      },

      setCaption(lines) {
        CAPTION_Y.forEach((_, i) => {
          captions[i]!.textContent = lines[i] ?? '';
        });
      },

      clear() {
        clearMarks();
        for (const nd of nodes) {
          for (const g of tableRows.get(nd.id)!) g.remove();
          tableRows.set(nd.id, []);
        }
        for (const l of links) {
          const layer = chipLayer.get(l)!;
          while (layer.firstChild) layer.removeChild(layer.firstChild);
        }
        macRow.remove();
        macRow = el('g', {}, panel);
        ipRow.textContent = '';
        frameGlyph.setAttribute('opacity', '0');
        for (const cap of captions) cap.textContent = '';
        setTableMode(cacheOn);
      },
    };

    setTableMode(false);

    return {
      ...api,
      destroy() {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const w of [...waiters]) w();
        waiters.clear();
        root.remove();
      },
    };
  },
};
