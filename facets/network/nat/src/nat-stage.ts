/**
 * nat-stage — 안쪽 기기 · NAT 경계 · 서버와 낯선 이, 그리고 아래에 NAT 표.
 *
 * 패킷은 칸 둘(주소 · 포트)짜리 카드다. 나가는 카드는 보낸 이 칸을, 들어오는 카드는 받는 이 칸을 보인다.
 * 경계에 닿으면 칸이 뒤집히며 갈아 끼워진다. 막힌 카드는 경계 앞에 멈춰 남고, 버려진 카드는 경계 밖에 남는다.
 *
 * 판이 바뀌면(손잡이) 앞 판의 카드는 흐린 채 제자리에 남았다가, 새 판의 같은 패킷 걸음에서 **제자리에서 새 자리로**
 * 옮겨 간다 — 막혀 경계 앞에 서 있던 카드가 경계를 넘어가는 것이 그 운동이다. 판 끝에 짝이 없는 흐린 카드는 치운다.
 * 머리의 바꾸는 칸 창과 표의 열쇠 테두리는 손잡이 값에 따라 넓어지고 좁아진다.
 *
 * 세로는 기기 셋 · 줄 셋이 들어갈 자리로 처음부터 잡는다.
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

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 780;
const H = 470;

const DEV_X = 10;
const DEV_W = 160;
const LANE_Y0 = 72;
const LANE_H = 64;
const STRANGER_LANE = 3;
const CARD_H = 24;
const ADDR_W = 86;
const PORT_W = 40;
const CARD_W = ADDR_W + PORT_W;
const BND_X = 380;
const BND_W = 16;
const SRV_X = 610;
const SRV_W = 160;

const OUT_SPAWN_X = DEV_X + DEV_W + 6;
const OUT_FRONT_X = BND_X - 4 - CARD_W;
const FAR_X = SRV_X - 4 - CARD_W;
const IN_FRONT_X = BND_X + BND_W + 4;
const IN_REST_X = OUT_SPAWN_X;
const OFF_X = -220;

const TPL_X = BND_X + BND_W / 2 - CARD_W / 2;
const TPL_Y = 28;

const TABLE_X = 230;
const COL_W = [90, 130, 130];
const TABLE_Y = 330;
const ROW_H = 22;

/** 움직임을 나누는 몫 — 경계까지 · 칸 뒤집기 · 경계 너머 */
const LEG_A = 0.4;
const LEG_FLIP = 0.2;
const LEG_B = 0.3;

type Endpoint = { addr: string; port: number };
type Model = {
  publicAddr: string;
  firstPort: number;
  devices: Endpoint[];
  remotes: Endpoint[];
};

export type NatRoundArgs = { rewrite: number; key: number; devices: number };
export type NatOutArgs = { device: number; pub: number; outcome: 'write' | 'block'; row: number; nextPort: number };
export type NatInArgs = { kind: 'reply' | 'stray'; remote: number; port: number; found: number; device: number };

/** projector 가 부르는 표면 */
export type NatStage = {
  round(args: NatRoundArgs, ms: number): Promise<void>;
  out(args: NatOutArgs, ms: number): Promise<void>;
  inbound(args: NatInArgs, ms: number): Promise<void>;
  settle(ms: number): Promise<void>;
  setCaption(text: string): void;
  reset(): void;
};

function endpointOf(v: unknown): Endpoint | null {
  if (typeof v !== 'object' || v === null) return null;
  const addr = (v as Record<string, unknown>).addr;
  const port = (v as Record<string, unknown>).port;
  return typeof addr === 'string' && typeof port === 'number' ? { addr, port } : null;
}

function modelOf(data: Record<string, unknown> | undefined): Model | null {
  if (!data) return null;
  const { publicAddr, firstPort, devices, server, stranger } = data;
  if (typeof publicAddr !== 'string' || typeof firstPort !== 'number' || !Array.isArray(devices)) return null;
  const devs: Endpoint[] = [];
  for (const d of devices) {
    const e = endpointOf(d);
    if (!e) return null;
    devs.push(e);
  }
  const s = endpointOf(server);
  const x = endpointOf(stranger);
  if (!s || !x) return null;
  return { publicAddr, firstPort, devices: devs, remotes: [s, x] };
}

type Cell = { g: SVGGElement; rect: SVGRectElement; text: SVGTextElement };
type Card = {
  g: SVGGElement;
  frame: SVGRectElement;
  cells: [Cell, Cell];
  badge: SVGTextElement;
  ghost: boolean;
  device: number;
  x: number;
  y: number;
};
type Row = { g: SVGGElement; frame: SVGRectElement };
type Key = { at: number; run: (instant: boolean) => void };

export const natStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const model = modelOf(params.initialData);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (
      parent: Element,
      x: number,
      y: number,
      s: string,
      opts: { mono?: boolean; size?: string; anchor?: string; fill?: string; weight?: number } = {},
    ): SVGTextElement => {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opts.mono ? fonts.mono : fonts.body,
          'font-size': opts.size ?? fontSizes.xs,
          'text-anchor': opts.anchor ?? 'start',
          fill: opts.fill ?? c.text,
          'font-weight': opts.weight ?? 400,
        },
        parent,
      );
      node.textContent = s;
      return node;
    };
    /** 자리 옮기기 — ms 가 0 이면 곧바로 */
    const place = (g: SVGGElement, x: number, y: number, ms: number): void => {
      g.style.transition = ms > 0 ? `transform ${ms}ms ease-in-out, opacity ${ms}ms ease-in-out` : 'none';
      g.style.transform = `translate(${x}px, ${y}px)`;
    };
    const fade = (g: SVGGElement, opacity: number, ms: number): void => {
      g.style.transition = ms > 0 ? `transform ${ms}ms ease-in-out, opacity ${ms}ms ease-in-out` : 'none';
      g.style.opacity = String(opacity);
    };
    const flip = (cell: Cell, scale: number, ms: number): void => {
      cell.g.style.transition = ms > 0 ? `transform ${ms}ms ease-in-out` : 'none';
      cell.g.style.transform = `scaleY(${scale})`;
    };
    const widen = (rect: SVGRectElement, width: number, ms: number): void => {
      rect.style.transition = ms > 0 ? `width ${ms}ms ease-in-out` : 'none';
      rect.setAttribute('width', String(width));
      rect.style.width = `${width}px`;
    };

    // ── 재생 — 열쇠 시각마다 한 조각씩. 되짚기면 전부 곧바로
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const flushers = new Set<() => void>();
    const play = (keys: Key[], total: number): Promise<void> => {
      if (isInstant() || total <= 0) {
        for (const k of keys) k.run(true);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        let left = keys.filter((k) => k.at > 0);
        for (const k of keys) if (k.at <= 0) k.run(false);
        const finish = (): void => {
          const rest = left;
          left = [];
          for (const k of rest) k.run(true);
          flushers.delete(finish);
          resolve();
        };
        for (const k of left) {
          const id = setTimeout(() => {
            timers.delete(id);
            left = left.filter((x) => x !== k);
            k.run(false);
          }, k.at);
          timers.add(id);
        }
        const end = setTimeout(() => {
          timers.delete(end);
          finish();
        }, total);
        timers.add(end);
        flushers.add(finish);
      });
    };
    const doomed = new Set<Element>();
    const removeLater = (node: Element, ms: number): void => {
      if (ms <= 0) {
        node.remove();
        return;
      }
      doomed.add(node);
      const id = setTimeout(() => {
        timers.delete(id);
        doomed.delete(node);
        node.remove();
      }, ms);
      timers.add(id);
    };
    const flushAll = (): void => {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const f of [...flushers]) f();
      flushers.clear();
      for (const node of doomed) node.remove();
      doomed.clear();
    };
    /** 새로 만든 요소에 transition 이 걸리도록 지금 스타일을 확정한다 */
    const settleStyle = (node: Element): void => {
      void node.getBoundingClientRect();
    };
    params.onScrubStart?.(flushAll);

    // ── 바탕
    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
    const layerBase = el('g', {}, svg);
    const layerRows = el('g', {}, svg);
    const layerCards = el('g', {}, svg);
    const layerTop = el('g', {}, svg);

    // 경계
    el('rect', { x: BND_X, y: 60, width: BND_W, height: 258, rx: 3, fill: c.bgSubtle, stroke: c.border }, layerBase);
    text(layerBase, BND_X + BND_W / 2, 18, `${t('label.nat', 'NAT device')} · ${model?.publicAddr ?? ''}`, {
      anchor: 'middle',
      size: fontSizes.sm,
      weight: 600,
    });
    // 바꾸는 칸 창 — 공인 주소 칸과 포트 칸, 창이 주소에서 포트까지 번진다
    text(layerBase, TPL_X - 8, TPL_Y + 16, t('label.rewrites', 'Rewrites'), { anchor: 'end', fill: c.textMuted });
    el('rect', { x: TPL_X, y: TPL_Y, width: ADDR_W, height: CARD_H, fill: c.bg, stroke: c.border }, layerBase);
    el('rect', { x: TPL_X + ADDR_W, y: TPL_Y, width: PORT_W, height: CARD_H, fill: c.bg, stroke: c.border }, layerBase);
    text(layerBase, TPL_X + ADDR_W / 2, TPL_Y + 16, model?.publicAddr ?? '', { mono: true, anchor: 'middle' });
    const tplPort = text(layerBase, TPL_X + ADDR_W + PORT_W / 2, TPL_Y + 16, '—', {
      mono: true,
      anchor: 'middle',
      fill: c.textMuted,
    });
    const tplWindow = el(
      'rect',
      { x: TPL_X - 2, y: TPL_Y - 2, width: ADDR_W + 4, height: CARD_H + 4, rx: 4, fill: 'none', stroke: c.accent, 'stroke-width': 2.5 },
      layerTop,
    );

    // 안쪽 기기
    const laneTop = (lane: number): number => LANE_Y0 + lane * LANE_H;
    const devGroups: SVGGElement[] = [];
    const gotTexts: SVGTextElement[] = [];
    const gotCount: number[] = [];
    (model?.devices ?? []).forEach((d, i) => {
      const g = el('g', {}, layerBase);
      const y = laneTop(i) + 4;
      el('rect', { x: DEV_X, y, width: DEV_W, height: LANE_H - 10, rx: 6, fill: c.bgSubtle, stroke: c.border }, g);
      text(g, DEV_X + 8, y + 14, t('label.device', 'Inside device {n}', { n: i + 1 }), { fill: c.textMuted });
      text(g, DEV_X + 8, y + 30, `${d.addr}:${d.port}`, { mono: true });
      gotTexts.push(text(g, DEV_X + 8, y + 46, t('label.got', 'Got: {n}', { n: 0 }), { weight: 600 }));
      gotCount.push(0);
      place(g, 0, 0, 0);
      devGroups.push(g);
    });

    // 서버 · 낯선 이
    if (model) {
      const [server, stranger] = model.remotes;
      const sTop = LANE_Y0 + 4;
      const sH = STRANGER_LANE * LANE_H - 10;
      el('rect', { x: SRV_X, y: sTop, width: SRV_W, height: sH, rx: 6, fill: c.bgSubtle, stroke: c.border }, layerBase);
      text(layerBase, SRV_X + SRV_W / 2, sTop + sH / 2 - 4, t('label.server', 'Server'), { anchor: 'middle', fill: c.textMuted });
      text(layerBase, SRV_X + SRV_W / 2, sTop + sH / 2 + 12, `${server?.addr}:${server?.port}`, { mono: true, anchor: 'middle' });
      const xTop = laneTop(STRANGER_LANE) + 4;
      el('rect', { x: SRV_X, y: xTop, width: SRV_W, height: 44, rx: 6, fill: c.bgSubtle, stroke: c.border, 'stroke-dasharray': '4 3' }, layerBase);
      text(layerBase, SRV_X + SRV_W / 2, xTop + 17, t('label.stranger', 'Stranger'), { anchor: 'middle', fill: c.textMuted });
      text(layerBase, SRV_X + SRV_W / 2, xTop + 34, `${stranger?.addr}:${stranger?.port}`, { mono: true, anchor: 'middle' });
    }

    // 표 머리 · 열쇠 테두리
    const heads = [t('label.colPub', 'Public port'), t('label.colRemote', 'Remote'), t('label.colInside', 'Inside')];
    let hx = TABLE_X;
    heads.forEach((h, i) => {
      const w = COL_W[i] ?? 0;
      el('rect', { x: hx, y: TABLE_Y, width: w, height: ROW_H, fill: c.bgSubtle, stroke: c.border }, layerBase);
      text(layerBase, hx + w / 2, TABLE_Y + 15, h, { anchor: 'middle', fill: c.textMuted });
      hx += w;
    });
    for (let r = 0; r < 3; r++) {
      let x = TABLE_X;
      for (const w of COL_W) {
        el('rect', { x, y: TABLE_Y + (r + 1) * ROW_H, width: w, height: ROW_H, fill: 'none', stroke: c.border, 'stroke-dasharray': '2 3' }, layerBase);
        x += w;
      }
    }
    const keyW = (key: number): number => (key === 1 ? (COL_W[0] ?? 0) + (COL_W[1] ?? 0) : (COL_W[0] ?? 0)) + 6;
    text(layerTop, TABLE_X - 8, TABLE_Y + 15, t('label.key', 'Key'), { anchor: 'end', fill: c.accent, weight: 700 });
    const keyFrame = el(
      'rect',
      { x: TABLE_X - 3, y: TABLE_Y - 3, width: keyW(0), height: ROW_H * 4 + 6, rx: 5, fill: 'none', stroke: c.accent, 'stroke-width': 2.5 },
      layerTop,
    );

    const caption = text(layerTop, 12, H - 14, '', { size: fontSizes.sm });

    // ── 움직이는 것들
    const cards = new Map<string, Card>();
    const rows: Row[] = [];
    let rewrite = 0;
    let lookup: Row | null = null;

    const need = (): Model => {
      if (!model) throw new Error('nat-stage: initialData 가 없어 그릴 수 없다');
      return model;
    };
    const deviceOf = (i: number): Endpoint => {
      const d = need().devices[i];
      if (!d) throw new Error(`nat-stage: 안쪽 기기 ${i} 가 없다`);
      return d;
    };

    const makeCard = (id: string, device: number, x: number, y: number): Card => {
      const g = el('g', {}, layerCards);
      const frame = el('rect', { x: -1, y: -1, width: CARD_W + 2, height: CARD_H + 2, rx: 4, fill: 'none', stroke: c.text, 'stroke-width': 1.5 }, g);
      const cell = (cx: number, w: number): Cell => {
        const cg = el('g', {}, g);
        cg.style.setProperty('transform-box', 'fill-box');
        cg.style.setProperty('transform-origin', 'center');
        const rect = el('rect', { x: cx, y: 0, width: w, height: CARD_H, fill: c.bg, stroke: c.border }, cg);
        const tx = text(cg, cx + w / 2, 16, '', { mono: true, anchor: 'middle' });
        return { g: cg, rect, text: tx };
      };
      const cells: [Cell, Cell] = [cell(0, ADDR_W), cell(ADDR_W, PORT_W)];
      const badge = text(g, -6, 16, '', { anchor: 'end', fill: c.danger, weight: 700 });
      place(g, x, y, 0);
      fade(g, 0, 0);
      settleStyle(g);
      const card: Card = { g, frame, cells, badge, ghost: false, device, x, y };
      cards.set(id, card);
      return card;
    };
    const moveCard = (card: Card, x: number, y: number, ms: number): void => {
      card.x = x;
      card.y = y;
      place(card.g, x, y, ms);
    };
    const setCell = (cell: Cell, s: string, changed: boolean): void => {
      cell.text.textContent = s;
      cell.rect.setAttribute('fill', changed ? c.accent : c.bg);
      cell.text.setAttribute('fill', changed ? c.stateInk : c.text);
      cell.text.setAttribute('font-weight', changed ? '700' : '400');
    };
    const clearMarks = (card: Card): void => {
      card.badge.textContent = '';
      card.badge.setAttribute('text-anchor', 'end');
      card.badge.setAttribute('x', '-6');
      card.frame.setAttribute('stroke', c.text);
      card.frame.removeAttribute('stroke-dasharray');
      card.ghost = false;
    };
    const setLookup = (row: Row | null, tone: 'find' | 'clash'): void => {
      if (lookup) {
        lookup.frame.setAttribute('stroke', c.border);
        lookup.frame.setAttribute('stroke-width', '1');
        lookup.frame.removeAttribute('stroke-dasharray');
        lookup.frame.setAttribute('fill', c.bg);
      }
      lookup = row;
      if (row) {
        row.frame.setAttribute('stroke', tone === 'find' ? c.primary : c.danger);
        row.frame.setAttribute('stroke-width', '2.5');
        if (tone === 'clash') row.frame.setAttribute('stroke-dasharray', '5 3');
        row.frame.setAttribute('fill', c.bgSubtle);
      }
    };
    const rowAt = (i: number): Row => {
      const r = rows[i];
      if (!r) throw new Error(`nat-stage: 표에 줄 #${i + 1} 이 없다`);
      return r;
    };
    const addRow = (pub: number, remote: Endpoint, inside: Endpoint, ms: number): void => {
      const i = rows.length;
      const g = el('g', {}, layerRows);
      const y = TABLE_Y + (i + 1) * ROW_H;
      const frame = el('rect', { x: TABLE_X, y, width: COL_W.reduce((a, b) => a + b, 0), height: ROW_H, fill: c.bg, stroke: c.border }, g);
      const vals = [String(pub), `${remote.addr}:${remote.port}`, `${inside.addr}:${inside.port}`];
      let x = TABLE_X;
      vals.forEach((s, k) => {
        const w = COL_W[k] ?? 0;
        text(g, x + w / 2, y + 15, s, { mono: true, anchor: 'middle', weight: k === 0 ? 700 : 400 });
        x += w;
      });
      // 경계 밑에서 표 자리로 내려앉는다
      place(g, BND_X - TABLE_X - 60, -60, 0);
      fade(g, 0, 0);
      rows.push({ g, frame });
      settleStyle(g);
      place(g, 0, 0, ms);
      fade(g, 1, ms);
    };

    const outY = (lane: number): number => laneTop(lane) + 4;
    const inY = (lane: number): number => laneTop(lane) + (lane === STRANGER_LANE ? 14 : 32);

    const api: NatStage = {
      round(args, ms) {
        need();
        rewrite = args.rewrite;
        const keys: Key[] = [
          {
            at: 0,
            run: (instant) => {
              const d = instant ? 0 : ms;
              widen(tplWindow, (args.rewrite === 1 ? CARD_W : ADDR_W) + 4, d);
              tplPort.textContent = '—';
              tplPort.setAttribute('fill', c.textMuted);
              widen(keyFrame, keyW(args.key), d);
              devGroups.forEach((g, i) => {
                const on = i < args.devices;
                place(g, on ? 0 : OFF_X, 0, d);
                fade(g, on ? 1 : 0, d);
                gotCount[i] = 0;
                const gt = gotTexts[i];
                if (gt) gt.textContent = t('label.got', 'Got: {n}', { n: 0 });
              });
              setLookup(null, 'find');
              for (const r of rows) {
                place(r.g, 0, -ROW_H, d);
                fade(r.g, 0, d);
              }
              for (const [id, card] of cards) {
                if (card.device >= args.devices) {
                  place(card.g, OFF_X, card.y, d);
                  fade(card.g, 0, d);
                  cards.delete(id);
                  removeLater(card.g, d);
                  continue;
                }
                clearMarks(card);
                card.ghost = true;
                card.frame.setAttribute('stroke-dasharray', '4 3');
                card.frame.setAttribute('stroke', c.textMuted);
                fade(card.g, 0.35, d);
              }
            },
          },
          {
            at: ms,
            run: () => {
              for (const r of rows) r.g.remove();
              rows.length = 0;
            },
          },
        ];
        return play(keys, ms);
      },

      out(args, ms) {
        const m = need();
        const dev = deviceOf(args.device);
        const id = `out-${args.device}`;
        const card = cards.get(id) ?? makeCard(id, args.device, OUT_SPAWN_X, outY(args.device));
        const tA = ms * LEG_A;
        const tF = ms * LEG_FLIP;
        const keys: Key[] = [
          {
            at: 0,
            run: (instant) => {
              clearMarks(card);
              setCell(card.cells[0], dev.addr, false);
              setCell(card.cells[1], String(dev.port), false);
              fade(card.g, 1, instant ? 0 : tA);
              moveCard(card, OUT_FRONT_X, outY(args.device), instant ? 0 : tA);
              setLookup(null, 'find');
            },
          },
          {
            at: tA,
            run: (instant) => {
              flip(card.cells[0], 0, instant ? 0 : tF / 2);
              if (rewrite === 1) flip(card.cells[1], 0, instant ? 0 : tF / 2);
            },
          },
          {
            at: tA + tF / 2,
            run: (instant) => {
              setCell(card.cells[0], m.publicAddr, true);
              flip(card.cells[0], 1, instant ? 0 : tF / 2);
              if (rewrite === 1) {
                // 머리의 포트 칸 — 방금 붙인 새 포트
                tplPort.textContent = String(args.pub);
                tplPort.setAttribute('fill', c.text);
                setCell(card.cells[1], String(args.pub), true);
                flip(card.cells[1], 1, instant ? 0 : tF / 2);
              }
            },
          },
          {
            at: tA + tF,
            run: (instant) => {
              const d = instant ? 0 : ms * LEG_B;
              if (args.outcome === 'write') {
                moveCard(card, FAR_X, outY(args.device), d);
                const server = m.remotes[0];
                if (!server) throw new Error('nat-stage: 서버가 없다');
                addRow(args.pub, server, dev, d);

              } else {
                card.frame.setAttribute('stroke', c.danger);
                card.frame.setAttribute('stroke-dasharray', '5 3');
                card.badge.textContent = t('label.blocked', '✗ blocked');
                setLookup(rowAt(args.row), 'clash');
              }
            },
          },
        ];
        return play(keys, ms);
      },

      inbound(args, ms) {
        const m = need();
        const lane = args.kind === 'reply' ? args.device : STRANGER_LANE;
        if (args.kind === 'reply' && args.found < 0) throw new Error('nat-stage: 제 답이 줄을 못 찾았다');
        const id = args.kind === 'reply' ? `in-${args.device}` : 'stray';
        const card = cards.get(id) ?? makeCard(id, args.kind === 'reply' ? args.device : -1, FAR_X, inY(lane));
        const tA = ms * LEG_A;
        const tF = ms * LEG_FLIP;
        const keys: Key[] = [
          {
            at: 0,
            run: (instant) => {
              clearMarks(card);
              setCell(card.cells[0], m.publicAddr, false);
              setCell(card.cells[1], String(args.port), false);
              fade(card.g, 1, instant ? 0 : tA);
              moveCard(card, IN_FRONT_X, inY(lane), instant ? 0 : tA);
              setLookup(null, 'find');
            },
          },
        ];
        if (args.found >= 0) {
          const dev = deviceOf(args.device);
          keys.push(
            {
              at: tA,
              run: (instant) => {
                setLookup(rowAt(args.found), 'find');
                flip(card.cells[0], 0, instant ? 0 : tF / 2);
                flip(card.cells[1], 0, instant ? 0 : tF / 2);
              },
            },
            {
              at: tA + tF / 2,
              run: (instant) => {
                setCell(card.cells[0], dev.addr, true);
                setCell(card.cells[1], String(dev.port), true);
                flip(card.cells[0], 1, instant ? 0 : tF / 2);
                flip(card.cells[1], 1, instant ? 0 : tF / 2);
              },
            },
            {
              at: tA + tF,
              run: (instant) => {
                // 들어온 낯선 것은 받은 기기의 줄로 간다 — 제 답과 같은 기기에 닿는다.
                // 그 기기는 줄을 적고 나갔으므로 나감 자리(안쪽)가 비어 있다
                const restY = args.kind === 'reply' ? inY(lane) : outY(args.device);
                moveCard(card, IN_REST_X, restY, instant ? 0 : ms * LEG_B);
              },
            },
            {
              at: tA + tF + ms * LEG_B,
              run: () => {
                const n = (gotCount[args.device] ?? 0) + 1;
                gotCount[args.device] = n;
                const gt = gotTexts[args.device];
                if (!gt) throw new Error(`nat-stage: 안쪽 기기 ${args.device} 의 자리가 없다`);
                gt.textContent = t('label.got', 'Got: {n}', { n });
              },
            },
          );
        } else {
          keys.push({
            at: tA,
            run: () => {
              card.frame.setAttribute('stroke', c.danger);
              card.frame.setAttribute('stroke-dasharray', '5 3');
              card.badge.setAttribute('text-anchor', 'start');
              card.badge.setAttribute('x', String(CARD_W + 6));
              card.badge.textContent = t('label.dropped', '✗ dropped');
            },
          });
        }
        return play(keys, ms);
      },

      settle(ms) {
        const keys: Key[] = [
          {
            at: 0,
            run: (instant) => {
              for (const [id, card] of cards) {
                if (!card.ghost) continue;
                cards.delete(id);
                place(card.g, card.x, card.y + 8, instant ? 0 : ms);
                fade(card.g, 0, instant ? 0 : ms);
                removeLater(card.g, instant ? 0 : ms);
              }
            },
          },
        ];
        return play(keys, ms);
      },

      setCaption(s) {
        caption.textContent = s;
      },

      reset() {
        flushAll();
        for (const card of cards.values()) card.g.remove();
        cards.clear();
        for (const r of rows) r.g.remove();
        rows.length = 0;
        lookup = null;
        caption.textContent = '';
        widen(tplWindow, ADDR_W + 4, 0);
        widen(keyFrame, keyW(0), 0);
        tplPort.textContent = '—';
        devGroups.forEach((g, i) => {
          place(g, 0, 0, 0);
          fade(g, 1, 0);
          gotCount[i] = 0;
          const gt = gotTexts[i];
          if (gt) gt.textContent = t('label.got', 'Got: {n}', { n: 0 });
        });
      },
    };
    return {
      ...api,
      destroy() {
        flushAll();
        svg.replaceChildren();
      },
    };
  },
};
