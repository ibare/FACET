/**
 * one-door-many-rooms 무대 — 왼쪽 클라이언트의 요청 줄, 가운데 문 하나 달린 게이트웨이(경로표),
 * 오른쪽 서비스 방 셋. 요청 알약은 늘 같은 문으로 들어가 경로표의 제 줄을 지나 방으로 간다.
 * 흩어 모으기에서는 알약이 셋으로 갈라져 나가고, 돌아온 것이 게이트웨이의 칸에 하나씩 모였다가
 * 한 알약으로 합쳐 문을 나간다.
 */
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { OneDoorManyRoomsScene } from './scene.js';

const H = 300;
const SVG_NS = 'http://www.w3.org/2000/svg';

const PILL_H = 17;
const ROUND_MS = 300;
const SCATTER_IN_MS = 280;
const SCATTER_OUT_MS = 320;
const GATHER_MS = 450;
const MERGE_MS = 250;
const BUNDLE_OUT_MS = 330;
const SCAN_MS = 330;
const BOUNCE_MS = 270;

type Pt = { x: number; y: number };

/** 무대의 자리 — 폭에서 역산한다. */
function geometry(scene: OneDoorManyRoomsScene) {
  const W = PIECE_CANVAS_W;
  const top = 36;
  const bottom = 256;
  const client = { x0: 10, x1: Math.round(W * 0.25) };
  const gate = { x0: Math.round(W * 0.3), x1: Math.round(W * 0.68) };
  const room = { x0: Math.round(W * 0.73), x1: W - 10 };
  const reqY = (i: number): number => top + 46 + i * 26;
  const routeY = (r: number): number => top + 46 + r * 21;
  const lastRoute = scene.routes.length - 1;
  const doorY = (routeY(0) + routeY(lastRoute)) / 2;
  const gc = (gate.x0 + gate.x1) / 2;
  const gatheredY = top + 144;
  const slotY = (k: number): number => gatheredY + 18 + k * 21;
  const n = scene.services.length;
  const gap = 10;
  const roomH = (bottom - top - gap * (n - 1)) / n;
  const roomTop = (j: number): number => top + j * (roomH + gap);
  const roomY = (j: number): number => roomTop(j) + roomH / 2;
  return {
    W,
    top,
    bottom,
    client,
    gate,
    room,
    reqY,
    routeY,
    doorY,
    gc,
    gatheredY,
    slotY,
    roomH,
    roomTop,
    roomY,
    rowEnd: (i: number): Pt => ({ x: client.x1, y: reqY(i) }),
    door: { x: gate.x0, y: doorY } as Pt,
    lane: (r: number): Pt => ({ x: gate.x0 + 12, y: routeY(r) }),
    exit: (r: number): Pt => ({ x: gate.x1, y: routeY(r) }),
    roomDoor: (j: number): Pt => ({ x: room.x0, y: roomY(j) }),
    captionY: 286,
  };
}

type Geo = ReturnType<typeof geometry>;

function round(v: number): number {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

/** 꺾은선 위 p (0..1) 자리 — 길이에 비례해 나눈다. */
function along(points: readonly Pt[], p: number): Pt {
  const first = points[0];
  if (first === undefined) throw new Error('one-door-many-rooms-stage: 빈 꺾은선');
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(len);
    total += len;
  }
  if (total === 0) return first;
  let d = p * total;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    const len = lens[i - 1] as number;
    if (d <= len || i === points.length - 1) {
      const f = len === 0 ? 1 : Math.min(1, d / len);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    d -= len;
  }
  return first;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const oneDoorManyRoomsStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const t = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);
    const charW = parseFloat(fontSizes.xs) * 0.6;

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(round(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function label(
      parent: Element,
      x: number,
      y: number,
      s: string,
      opt: { size?: string; mono?: boolean; fill?: string; anchor?: string; weight?: string } = {},
    ): SVGTextElement {
      const node = el(
        'text',
        {
          x,
          y,
          'font-family': opt.mono === true ? fonts.mono : fonts.body,
          'font-size': opt.size ?? fontSizes.xs,
          fill: opt.fill ?? colors.text,
          'text-anchor': opt.anchor ?? 'start',
          'dominant-baseline': 'middle',
        },
        parent,
      );
      if (opt.weight !== undefined) node.setAttribute('font-weight', opt.weight);
      node.textContent = s;
      return node;
    }

    function pillWidth(s: string): number {
      return s.length * charW + 12;
    }

    /** 알약 하나 — 가운데 (0,0) 에 그리고 transform 으로 옮긴다. */
    function pill(parent: Element, at: Pt, s: string, fill: string, ink: string, stroke?: string): SVGGElement {
      const g = el('g', { transform: `translate(${round(at.x)},${round(at.y)})` }, parent);
      const w = pillWidth(s);
      el(
        'rect',
        {
          x: -w / 2,
          y: -PILL_H / 2,
          width: w,
          height: PILL_H,
          rx: PILL_H / 2,
          fill,
          stroke: stroke ?? 'none',
          'stroke-width': stroke === undefined ? 0 : 1.2,
        },
        g,
      );
      label(g, 0, 0.5, s, { mono: true, fill: ink, anchor: 'middle' });
      return g;
    }

    function place(g: SVGGElement, at: Pt): void {
      g.setAttribute('transform', `translate(${round(at.x)},${round(at.y)})`);
    }

    function serviceName(id: string): string {
      switch (id) {
        case 'users':
          return t('label.users', 'Users');
        case 'orders':
          return t('label.orders', 'Orders');
        case 'catalog':
          return t('label.catalog', 'Products');
        default:
          throw new Error(`one-door-many-rooms-stage: 서비스 ${id} 의 표시 이름 키가 없다`);
      }
    }

    function serviceIndex(scene: OneDoorManyRoomsScene, id: string): number {
      const j = scene.services.findIndex((s) => s.id === id);
      if (j < 0) throw new Error(`one-door-many-rooms-stage: 서비스 ${id} 가 없다`);
      return j;
    }

    function routeIndex(scene: OneDoorManyRoomsScene, prefix: string): number {
      const r = scene.routes.findIndex((x) => x.prefix === prefix);
      if (r < 0) throw new Error(`one-door-many-rooms-stage: 경로 ${prefix} 가 경로표에 없다`);
      return r;
    }

    function serviceColor(scene: OneDoorManyRoomsScene, j: number): string {
      const c = categorical(scene.services.length, 'vivid')[j];
      if (c === undefined) throw new Error(`one-door-many-rooms-stage: 색 ${j} 가 없다`);
      return c;
    }

    function roomPillAt(g: Geo, j: number, s: string): Pt {
      return { x: g.room.x1 - 8 - pillWidth(s) / 2, y: g.roomTop(j) + 16 };
    }

    function slotText(scene: OneDoorManyRoomsScene, id: string): string {
      const s = scene.services[serviceIndex(scene, id)];
      if (s === undefined) throw new Error(`one-door-many-rooms-stage: 서비스 ${id} 가 없다`);
      return `${id} · ${s.ms} ms`;
    }

    function statusStyle(status: number): { fill: string; ink: string; stroke: string | undefined } {
      return status >= 400
        ? { fill: colors.danger, ink: colors.textInverse, stroke: undefined }
        : { fill: colors.bg, ink: colors.text, stroke: colors.text };
    }

    /** 이번 걸음이 가리키는 경로 줄과 방. */
    function activeOf(scene: OneDoorManyRoomsScene): { route: number | null; rooms: string[] } {
      const step = scene.step;
      if (step === null) return { route: null, rooms: [] };
      switch (step.kind) {
        case 'route':
          return { route: routeIndex(scene, step.prefix), rooms: [step.service] };
        case 'scatter':
          return { route: routeIndex(scene, step.prefix), rooms: step.services };
        case 'gather':
          return { route: routeIndex(scene, step.prefix), rooms: [step.service] };
        case 'bundle':
          return { route: routeIndex(scene, step.prefix), rooms: [] };
        case 'notFound':
          return { route: null, rooms: [] };
      }
    }

    /** 장면의 화면 전체. moving 이면 운동이 도착시킬 것(상태 · 알약)을 아직 두지 않는다. */
    function drawStatic(scene: OneDoorManyRoomsScene, moving: boolean): void {
      svg.textContent = '';
      const g = geometry(scene);
      const step = scene.step;
      const active = activeOf(scene);
      const curReq = step === null ? null : step.req;

      // ── 선: 요청 줄 → 문, 경로 줄 → 방
      const wires = el('g', {}, svg);
      scene.requests.forEach((_, i) => {
        const a = g.rowEnd(i);
        el(
          'line',
          {
            x1: a.x,
            y1: a.y,
            x2: g.door.x,
            y2: g.door.y,
            stroke: i === curReq ? colors.text : colors.border,
            'stroke-width': i === curReq ? 1.6 : 1,
          },
          wires,
        );
      });
      scene.routes.forEach((route, r) => {
        const a = g.exit(r);
        for (const id of route.targets) {
          const j = serviceIndex(scene, id);
          const b = g.roomDoor(j);
          const on = active.route === r && active.rooms.includes(id);
          el(
            'line',
            {
              x1: a.x,
              y1: a.y,
              x2: b.x,
              y2: b.y,
              stroke: on ? colors.text : colors.border,
              'stroke-width': on ? 2 : 1,
            },
            wires,
          );
        }
      });

      // ── 클라이언트
      const cl = el('g', {}, svg);
      el(
        'rect',
        {
          x: g.client.x0,
          y: g.top,
          width: g.client.x1 - g.client.x0,
          height: g.bottom - g.top,
          rx: 6,
          fill: colors.bgSubtle,
          stroke: colors.border,
        },
        cl,
      );
      label(cl, g.client.x0 + 8, g.top + 16, t('label.client', 'Client'), {
        size: fontSizes.sm,
        weight: '600',
      });
      scene.requests.forEach((q, i) => {
        const y = g.reqY(i);
        const cur = i === curReq;
        if (cur) {
          el(
            'rect',
            {
              x: g.client.x0 + 4,
              y: y - 10,
              width: g.client.x1 - g.client.x0 - 8,
              height: 20,
              rx: 3,
              fill: colors.accent,
            },
            cl,
          );
        }
        label(cl, g.client.x0 + 8, y, `${q.method} ${q.path}`, {
          mono: true,
          fill: cur ? colors.stateInk : colors.text,
        });
        const status = scene.results[i];
        if (status === undefined) throw new Error(`one-door-many-rooms-stage: results[${i}] 가 없다`);
        const hide = moving && cur && step !== null && step.kind !== 'scatter' && step.kind !== 'gather';
        if (status !== null && !hide) {
          label(cl, g.client.x1 - 8, y, String(status), {
            mono: true,
            anchor: 'end',
            weight: '700',
            fill: status >= 400 ? colors.danger : cur ? colors.stateInk : colors.text,
          });
        }
      });

      // ── 게이트웨이 (문 하나)
      const gw = el('g', {}, svg);
      el(
        'rect',
        {
          x: g.gate.x0,
          y: g.top,
          width: g.gate.x1 - g.gate.x0,
          height: g.bottom - g.top,
          rx: 6,
          fill: colors.bgSubtle,
          stroke: 'none',
        },
        gw,
      );
      const gap = 11;
      const edge = { stroke: colors.text, 'stroke-width': 1.5, fill: 'none' };
      el(
        'path',
        {
          d: `M ${g.gate.x0} ${round(g.doorY - gap)} V ${g.top} H ${g.gate.x1} V ${g.bottom} H ${g.gate.x0} V ${round(g.doorY + gap)}`,
          ...edge,
        },
        gw,
      );
      // 문설주
      el('line', { x1: g.gate.x0 - 4, y1: g.doorY - gap, x2: g.gate.x0 + 4, y2: g.doorY - gap, ...edge }, gw);
      el('line', { x1: g.gate.x0 - 4, y1: g.doorY + gap, x2: g.gate.x0 + 4, y2: g.doorY + gap, ...edge }, gw);
      label(gw, g.gate.x0 + 12, g.top + 16, t('label.gateway', 'Gateway'), {
        size: fontSizes.sm,
        weight: '600',
      });
      const prefixCol = Math.max(...scene.routes.map((r) => r.prefix.length)) * charW;
      scene.routes.forEach((route, r) => {
        const y = g.routeY(r);
        const on = active.route === r;
        if (on) {
          el(
            'rect',
            {
              x: g.gate.x0 + 6,
              y: y - 9,
              width: g.gate.x1 - g.gate.x0 - 12,
              height: 18,
              rx: 3,
              fill: colors.accent,
            },
            gw,
          );
        }
        const ink = on ? colors.stateInk : colors.text;
        const x = g.gate.x0 + 20;
        label(gw, x, y, route.prefix, { mono: true, fill: ink });
        label(gw, x + prefixCol + 6, y, '→', { mono: true, fill: on ? colors.stateInk : colors.textMuted });
        label(gw, x + prefixCol + 6 + charW * 2, y, route.targets.join('·'), { mono: true, fill: ink });
      });

      // 모이는 칸 — 흩어 보낸 요청이 열려 있을 때만
      const fan = scene.fan;
      if (fan !== null) {
        label(
          gw,
          g.gc,
          g.gatheredY,
          t('label.gathered', 'Gathered: {got}/{of}', { got: fan.back.length, of: fan.services.length }),
          { anchor: 'middle', fill: colors.text, weight: '600' },
        );
        const slotW = Math.min(170, g.gate.x1 - g.gate.x0 - 40);
        fan.services.forEach((_, k) => {
          el(
            'rect',
            {
              x: g.gc - slotW / 2,
              y: g.slotY(k) - PILL_H / 2 - 1,
              width: slotW,
              height: PILL_H + 2,
              rx: (PILL_H + 2) / 2,
              fill: 'none',
              stroke: colors.border,
              'stroke-dasharray': '3 3',
            },
            gw,
          );
        });
        const arriving = moving && step !== null && step.kind === 'gather' ? step.service : null;
        fan.back.forEach((id, k) => {
          if (id === arriving) return;
          const s = slotText(scene, id);
          pill(gw, { x: g.gc, y: g.slotY(k) }, s, serviceColor(scene, serviceIndex(scene, id)), colors.stateInk);
        });
      }

      // ── 방
      const rooms = el('g', {}, svg);
      const calls = scene.calls;
      scene.services.forEach((s, j) => {
        const y0 = g.roomTop(j);
        const on = active.rooms.includes(s.id);
        el(
          'rect',
          {
            x: g.room.x0,
            y: y0,
            width: g.room.x1 - g.room.x0,
            height: g.roomH,
            rx: 6,
            fill: colors.bgSubtle,
            stroke: on ? colors.text : colors.border,
            'stroke-width': on ? 2 : 1,
          },
          rooms,
        );
        el('rect', { x: g.room.x0, y: y0, width: 6, height: g.roomH, fill: serviceColor(scene, j) }, rooms);
        label(rooms, g.room.x0 + 14, y0 + 16, serviceName(s.id), { size: fontSizes.sm, weight: '600' });
        label(rooms, g.room.x0 + 14, y0 + 33, `${s.id} · ${s.ms} ms`, { mono: true, fill: colors.textMuted });
        if (calls !== null) {
          const c = calls[j];
          if (c === undefined) throw new Error(`one-door-many-rooms-stage: calls[${j}] 가 없다`);
          label(rooms, g.room.x0 + 14, y0 + 50, t('label.calls', 'Calls: {n}', { n: c }), { fill: colors.text });
        }
        // 아직 돌아오지 않은 흩어 보낸 요청
        if (fan !== null && fan.services.includes(s.id) && !fan.back.includes(s.id)) {
          const skip = moving && step !== null && step.kind === 'scatter';
          if (!skip) {
            const req = scene.requests[fan.req];
            if (req === undefined) throw new Error(`one-door-many-rooms-stage: requests[${fan.req}] 가 없다`);
            pill(rooms, roomPillAt(g, j, req.path), req.path, colors.primary, colors.textInverse);
          }
        }
      });

      // ── 캡션
      label(svg, g.W / 2, g.captionY, caption(scene), { size: fontSizes.md, anchor: 'middle' });
    }

    function caption(scene: OneDoorManyRoomsScene): string {
      const step = scene.step;
      if (step === null) return t('caption.start', 'The client knows one address: the gateway. Requests: {n}', { n: scene.requests.length });
      switch (step.kind) {
        case 'route':
          return t('caption.route', 'First segment {prefix} → {name}. Answer: {status} · {ms} ms', {
            prefix: step.prefix,
            name: serviceName(step.service),
            status: step.status,
            ms: step.ms,
          });
        case 'scatter':
          return t('caption.scatter', 'First segment {prefix} → sent at once to: {names}', {
            prefix: step.prefix,
            names: step.services.map((id) => serviceName(id)).join(' · '),
          });
        case 'gather':
          return t('caption.gather', 'Back at {ms} ms: {name}. Gathered: {got}/{of}', {
            ms: step.ms,
            name: serviceName(step.service),
            got: step.got,
            of: step.of,
          });
        case 'bundle':
          return t('caption.bundle', 'Bundled into one answer: {status} · {ms} ms', { status: step.status, ms: step.ms });
        case 'notFound':
          return t('caption.notFound', 'First segment {prefix}: not in the route table. Gateway answers {status}. Service calls: {n}', {
            prefix: step.prefix,
            status: step.status,
            n: step.serviceCalls,
          });
      }
    }

    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        const start = performance.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish();
            return;
          }
          const p = Math.min(1, (performance.now() - start) / ms);
          draw(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    function live(mine: number): boolean {
      return mine === gen && !destroyed;
    }

    /** 이번 걸음의 운동. 정적 그리기(moving)가 이미 선 위에 알약만 흘린다. */
    async function motion(scene: OneDoorManyRoomsScene, mine: number): Promise<void> {
      const step = scene.step;
      if (step === null) throw new Error('one-door-many-rooms-stage: 운동할 걸음이 없다');
      const g = geometry(scene);
      const layer = el('g', {}, svg);
      const req = scene.requests[step.req];
      if (req === undefined) throw new Error(`one-door-many-rooms-stage: requests[${step.req}] 가 없다`);
      const out = { fill: colors.primary, ink: colors.textInverse };

      switch (step.kind) {
        case 'route': {
          const r = routeIndex(scene, step.prefix);
          const j = serviceIndex(scene, step.service);
          const path = [
            g.rowEnd(step.req),
            g.door,
            g.lane(r),
            g.exit(r),
            g.roomDoor(j),
            roomPillAt(g, j, req.path),
          ];
          const go = pill(layer, path[0] as Pt, req.path, out.fill, out.ink);
          await tween(ROUND_MS, mine, (p) => place(go, along(path, p)));
          if (!live(mine)) return;
          go.remove();
          const st = statusStyle(step.status);
          const back = pill(layer, path[path.length - 1] as Pt, String(step.status), st.fill, st.ink, st.stroke);
          const rev = [...path].reverse();
          await tween(ROUND_MS, mine, (p) => place(back, along(rev, p)));
          return;
        }
        case 'scatter': {
          const r = routeIndex(scene, step.prefix);
          const inPath = [g.rowEnd(step.req), g.door, g.lane(r), g.exit(r)];
          const one = pill(layer, inPath[0] as Pt, req.path, out.fill, out.ink);
          await tween(SCATTER_IN_MS, mine, (p) => place(one, along(inPath, p)));
          if (!live(mine)) return;
          one.remove();
          const copies = step.services.map((id) => {
            const j = serviceIndex(scene, id);
            const path = [g.exit(r), g.roomDoor(j), roomPillAt(g, j, req.path)];
            return { node: pill(layer, path[0] as Pt, req.path, out.fill, out.ink), path };
          });
          await tween(SCATTER_OUT_MS, mine, (p) => {
            for (const c of copies) place(c.node, along(c.path, p));
          });
          return;
        }
        case 'gather': {
          const r = routeIndex(scene, step.prefix);
          const j = serviceIndex(scene, step.service);
          const k = step.got - 1;
          const s = slotText(scene, step.service);
          const path = [roomPillAt(g, j, req.path), g.roomDoor(j), g.exit(r), { x: g.gc, y: g.slotY(k) }];
          const node = pill(layer, path[0] as Pt, s, serviceColor(scene, j), colors.stateInk);
          await tween(GATHER_MS, mine, (p) => place(node, along(path, p)));
          return;
        }
        case 'bundle': {
          const parts = step.parts.map((id, k) => {
            const j = serviceIndex(scene, id);
            const from: Pt = { x: g.gc, y: g.slotY(k) };
            const path = [from, { x: g.gate.x0 + 12, y: from.y }, g.door];
            return {
              node: pill(layer, from, slotText(scene, id), serviceColor(scene, j), colors.stateInk),
              path,
            };
          });
          await tween(MERGE_MS, mine, (p) => {
            for (const c of parts) place(c.node, along(c.path, p));
          });
          if (!live(mine)) return;
          for (const c of parts) c.node.remove();
          const st = statusStyle(step.status);
          const path = [g.door, g.rowEnd(step.req)];
          const node = pill(layer, g.door, String(step.status), st.fill, st.ink, st.stroke);
          await tween(BUNDLE_OUT_MS, mine, (p) => place(node, along(path, p)));
          return;
        }
        case 'notFound': {
          const last = scene.routes.length - 1;
          const scan = [g.rowEnd(step.req), g.door, g.lane(0), g.lane(last)];
          const node = pill(layer, scan[0] as Pt, req.path, out.fill, out.ink);
          await tween(SCAN_MS, mine, (p) => place(node, along(scan, p)));
          if (!live(mine)) return;
          node.remove();
          const st = statusStyle(step.status);
          const back = [g.lane(last), g.door, g.rowEnd(step.req)];
          const ret = pill(layer, back[0] as Pt, String(step.status), st.fill, st.ink, st.stroke);
          await tween(BOUNCE_MS, mine, (p) => place(ret, along(back, p)));
          return;
        }
      }
    }

    return {
      async render(
        next: OneDoorManyRoomsScene,
        prev: OneDoorManyRoomsScene | null,
        opts: { animate: boolean },
      ): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const moves = opts.animate && prev !== null && next.step !== null && next.step !== prev.step;
        if (!moves) {
          drawStatic(next, false);
          return;
        }
        drawStatic(next, true);
        await motion(next, mine);
        if (!live(mine)) return;
        drawStatic(next, false);
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
