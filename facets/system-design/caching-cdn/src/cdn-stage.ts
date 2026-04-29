/**
 * cdn-stage View — CDN 시각화 단일 통합 캔버스.
 *
 * 한 SVG 안에 캡션 / 좌측 콘텐츠 트레이 / 단순화된 세계지도 + 엣지 PoP / 지역
 * 캐시 + 오리진 / 클라이언트 + 점선 인근선 / 곡선 호 (베지어) / 오리진 부하 게이지·
 * 펄스 / 시각화 안 텍스트 / 참고 레퍼런스를 모두 담는다.
 *
 * 메서드 (projector → view):
 *   - reset()
 *   - init({ edges, regional, origin, contents })
 *   - setBaseCaption(text)
 *   - setCaption(text, opts?)
 *   - emitRequest(payload, opts?)    — 히트: 짧은 호 1 줄 / 미스: 짧은 호 + 긴 호 캐스케이드 + 채움 + 응답
 *   - emitInvalidate(payload, opts?) — 엣지 캐시 회색 복귀
 *   - signalInvalid(op, raw)
 *   - signalDemoEnd()
 *
 * 모든 운동 메서드는 Promise<void> 반환 — projector 가 await 한다.
 */

import type { View, ViewInstance, ViewMountParams } from '@facet/core/runtime';
import {
  getColors,
  fonts,
  fontSizes,
  categorical,
} from '@facet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 560;

// ── 영역 분할 ──
const CAPTION_BASE_Y = 22;
const CAPTION_EVENT_Y = 44;

// 좌측 콘텐츠 트레이.
const TRAY_LEFT = 12;
const TRAY_RIGHT = 96;
const TRAY_TOP = 64;
const TRAY_BOTTOM = 460;

// 본체 지도 영역.
const MAP_LEFT = 108;
const MAP_RIGHT = W - 12;
const MAP_TOP = 64;
const MAP_BOTTOM = 460;

// 오리진 / 지역 위치 (지도 위 상단 가까이).
const ORIGIN_X = MAP_LEFT + (MAP_RIGHT - MAP_LEFT) * 0.50;
const ORIGIN_Y = MAP_TOP + 36;
const REGIONAL_X = MAP_LEFT + (MAP_RIGHT - MAP_LEFT) * 0.62;
const REGIONAL_Y = MAP_TOP + 88;

// 부하 게이지.
const GAUGE_X = ORIGIN_X + 22;
const GAUGE_Y = ORIGIN_Y - 6;
const GAUGE_W = 60;
const GAUGE_H = 6;

// ── 시간 (ms) ──
const SHORT_ARC_MS = 280;
const LONG_ARC_HOP_MS = 380;
const FILL_HOP_MS = 360;
const PULSE_MS = 420;
const NEIGHBOR_LINE_MS = 250;

// ── 콘텐츠 색 ──
const CONTENT_PALETTE_TONE = 'vivid' as const;

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
}

function raf(cb: (t: number) => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(performance.now()), 16) as unknown as number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, Math.max(0, ms)));
}

type EdgeRec = {
  id: string;
  label: string;
  x: number;
  y: number;
  /** 캐싱된 콘텐츠 색을 위한 점 element. */
  pointEl: SVGCircleElement;
  /** 도시 라벨. */
  labelEl: SVGTextElement;
  /** 둘레 카운터. */
  counterEl: SVGTextElement;
  /** 그 엣지가 처리한 요청 누적 수. */
  count: number;
  /** 엣지에 캐싱된 콘텐츠 id 집합 (시각 표시용). */
  cached: Set<string>;
  /** 엣지에 묶인 클라이언트 점. */
  clientEl: SVGCircleElement;
  clientX: number;
  clientY: number;
  /** 점선 인근선. */
  neighborLine: SVGLineElement;
};

type ContentRec = {
  id: string;
  label: string;
  color: string;
};

export const cdnStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);

    const root = document.createElement('div');
    root.className = 'facet-cdn-stage';
    root.style.fontFamily = fonts.body;
    root.style.color = colors.text;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = `${W}px`;
    svg.style.display = 'block';
    svg.style.background = colors.bgSubtle;
    root.appendChild(svg);
    container.appendChild(root);

    // === 캡션 ===
    const baseCaption = document.createElementNS(SVG_NS, 'text');
    setAttrs(baseCaption, {
      x: 12,
      y: CAPTION_BASE_Y,
      fill: colors.textMuted,
      'font-size': fontSizes.sm,
      'font-family': fonts.body,
    });
    svg.appendChild(baseCaption);

    const eventCaption = document.createElementNS(SVG_NS, 'text');
    setAttrs(eventCaption, {
      x: 12,
      y: CAPTION_EVENT_Y,
      fill: colors.text,
      'font-size': fontSizes.md,
      'font-family': fonts.body,
      'font-weight': '600',
    });
    svg.appendChild(eventCaption);

    // === 콘텐츠 트레이 배경 ===
    const trayBg = document.createElementNS(SVG_NS, 'rect');
    setAttrs(trayBg, {
      x: TRAY_LEFT,
      y: TRAY_TOP,
      width: TRAY_RIGHT - TRAY_LEFT,
      height: TRAY_BOTTOM - TRAY_TOP,
      fill: colors.bg,
      stroke: colors.border,
      'stroke-width': '1',
      rx: '4',
    });
    svg.appendChild(trayBg);

    const trayTitle = document.createElementNS(SVG_NS, 'text');
    setAttrs(trayTitle, {
      x: (TRAY_LEFT + TRAY_RIGHT) / 2,
      y: TRAY_TOP + 16,
      'text-anchor': 'middle',
      fill: colors.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
      'font-weight': '700',
    });
    trayTitle.textContent = '콘텐츠';
    svg.appendChild(trayTitle);

    const trayGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(trayGroup);

    // === 지도 배경 + 대륙 윤곽 ===
    const mapBg = document.createElementNS(SVG_NS, 'rect');
    setAttrs(mapBg, {
      x: MAP_LEFT,
      y: MAP_TOP,
      width: MAP_RIGHT - MAP_LEFT,
      height: MAP_BOTTOM - MAP_TOP,
      fill: colors.bg,
      stroke: colors.border,
      'stroke-width': '1',
      rx: '4',
    });
    svg.appendChild(mapBg);

    // 단순화한 대륙 실루엣 (옅은 회색 면). 메르카토르 풍 6 개 큰 덩어리.
    // 좌표는 정규화 (nx, ny) → 픽셀로 환산. 정확도는 상징 수준.
    const continents = document.createElementNS(SVG_NS, 'g');
    continents.setAttribute('opacity', '0.55');
    svg.appendChild(continents);

    function nx2x(nx: number): number {
      return MAP_LEFT + nx * (MAP_RIGHT - MAP_LEFT);
    }
    function ny2y(ny: number): number {
      return MAP_TOP + ny * (MAP_BOTTOM - MAP_TOP);
    }

    function continentPath(d: string): void {
      const p = document.createElementNS(SVG_NS, 'path');
      setAttrs(p, {
        d,
        fill: colors.subtreeShadeLeft,
        stroke: colors.border,
        'stroke-width': '0.6',
      });
      continents.appendChild(p);
    }

    // 단순화한 대륙 (정규화 좌표 기준 폴리곤).
    function poly(points: Array<[number, number]>): string {
      const segs = points.map(
        ([nx, ny], i) => `${i === 0 ? 'M' : 'L'}${nx2x(nx).toFixed(1)},${ny2y(ny).toFixed(1)}`,
      );
      return segs.join(' ') + ' Z';
    }

    // 북미.
    continentPath(
      poly([
        [0.06, 0.18], [0.18, 0.14], [0.30, 0.20], [0.34, 0.34],
        [0.30, 0.46], [0.20, 0.50], [0.08, 0.40],
      ]),
    );
    // 남미.
    continentPath(
      poly([
        [0.27, 0.55], [0.34, 0.58], [0.36, 0.74], [0.31, 0.86],
        [0.27, 0.78], [0.25, 0.66],
      ]),
    );
    // 유럽 + 아프리카 묶음.
    continentPath(
      poly([
        [0.46, 0.20], [0.56, 0.22], [0.58, 0.36], [0.55, 0.52],
        [0.58, 0.70], [0.52, 0.84], [0.46, 0.78], [0.46, 0.56],
        [0.44, 0.40],
      ]),
    );
    // 아시아 본체.
    continentPath(
      poly([
        [0.60, 0.18], [0.78, 0.22], [0.88, 0.32], [0.86, 0.46],
        [0.78, 0.50], [0.70, 0.46], [0.62, 0.38],
      ]),
    );
    // 동남아 / 오세아니아.
    continentPath(
      poly([
        [0.78, 0.62], [0.88, 0.58], [0.92, 0.70], [0.86, 0.78],
        [0.78, 0.74],
      ]),
    );
    // 일본 (작은 섬).
    continentPath(
      poly([
        [0.83, 0.40], [0.86, 0.42], [0.85, 0.48], [0.82, 0.46],
      ]),
    );

    // === 운동 누적 그룹 ===
    const motionGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(motionGroup);

    // === 오리진 + 지역 캐시 + 게이지 (전 영역) ===
    const upperGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(upperGroup);

    // 오리진 펄스 영역 — 운동 그룹과 분리해 누적 펄스가 호 위에 떠 있도록.
    const pulseGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(pulseGroup);

    // 게이지.
    const gaugeBg = document.createElementNS(SVG_NS, 'rect');
    setAttrs(gaugeBg, {
      x: GAUGE_X,
      y: GAUGE_Y,
      width: GAUGE_W,
      height: GAUGE_H,
      fill: colors.bg,
      stroke: colors.border,
      'stroke-width': '0.8',
      rx: '2',
    });
    upperGroup.appendChild(gaugeBg);

    const gaugeFill = document.createElementNS(SVG_NS, 'rect');
    setAttrs(gaugeFill, {
      x: GAUGE_X,
      y: GAUGE_Y,
      width: 0,
      height: GAUGE_H,
      fill: colors.itemActive,
      rx: '2',
    });
    upperGroup.appendChild(gaugeFill);

    const gaugeLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(gaugeLabel, {
      x: GAUGE_X,
      y: GAUGE_Y - 2,
      fill: colors.textMuted,
      'font-size': '8px',
      'font-family': fonts.body,
    });
    gaugeLabel.textContent = '오리진 부하 (최근 30회)';
    upperGroup.appendChild(gaugeLabel);

    // 오리진 박스 (큰 사각형).
    const originRect = document.createElementNS(SVG_NS, 'rect');
    setAttrs(originRect, {
      x: ORIGIN_X - 18,
      y: ORIGIN_Y - 12,
      width: 36,
      height: 22,
      fill: colors.bg,
      stroke: colors.text,
      'stroke-width': '1.5',
      rx: '3',
    });
    upperGroup.appendChild(originRect);

    const originLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(originLabel, {
      x: ORIGIN_X,
      y: ORIGIN_Y + 3,
      'text-anchor': 'middle',
      fill: colors.text,
      'font-size': '10px',
      'font-family': fonts.mono,
      'font-weight': '700',
    });
    originLabel.textContent = '오리진';
    upperGroup.appendChild(originLabel);

    // 지역 캐시 박스 (약간 작은 사각형).
    const regionalRect = document.createElementNS(SVG_NS, 'rect');
    setAttrs(regionalRect, {
      x: REGIONAL_X - 14,
      y: REGIONAL_Y - 10,
      width: 28,
      height: 18,
      fill: colors.bg,
      stroke: colors.textMuted,
      'stroke-width': '1',
      rx: '3',
    });
    upperGroup.appendChild(regionalRect);

    const regionalLabel = document.createElementNS(SVG_NS, 'text');
    setAttrs(regionalLabel, {
      x: REGIONAL_X,
      y: REGIONAL_Y + 3,
      'text-anchor': 'middle',
      fill: colors.textMuted,
      'font-size': '9px',
      'font-family': fonts.mono,
      'font-weight': '700',
    });
    regionalLabel.textContent = '지역';
    upperGroup.appendChild(regionalLabel);

    // === 엣지 PoP 그룹 ===
    const edgeGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(edgeGroup);

    // === 시각화 안 텍스트 (하단 narration) ===
    const narrative = document.createElementNS(SVG_NS, 'text');
    setAttrs(narrative, {
      x: 12,
      y: H - 28,
      fill: colors.text,
      'font-size': '9px',
      'font-family': fonts.body,
    });
    narrative.textContent =
      '히트는 클라이언트→엣지 짧은 호 한 줄 — 미스는 위 계층까지 거슬러 올라가는 긴 여정 뒤 엣지 채움.';
    svg.appendChild(narrative);

    // === 레퍼런스 라벨 ===
    const refText = document.createElementNS(SVG_NS, 'text');
    setAttrs(refText, {
      x: 12,
      y: H - 12,
      fill: colors.textMuted,
      'font-size': '9px',
      'font-family': fonts.body,
    });
    refText.textContent =
      '참고: Cloudflare CDN Reference Architecture · Cloudflare Global Network · ByteByteGo CDN · NAVER Cloud CDN 활용 팁';
    svg.appendChild(refText);

    // ── 모델 상태 ──
    const edges = new Map<string, EdgeRec>();
    const contents = new Map<string, ContentRec>();
    let regionalCached = new Set<string>();
    let originLoadWindow: number[] = [];
    let captionTimer: ReturnType<typeof setTimeout> | null = null;

    function clearCaptionTimer(): void {
      if (captionTimer !== null) clearTimeout(captionTimer);
      captionTimer = null;
    }

    // ── helper ──
    function makeChip(color: string, label: string): SVGGElement {
      const g = document.createElementNS(SVG_NS, 'g');
      const rect = document.createElementNS(SVG_NS, 'rect');
      setAttrs(rect, {
        x: -7,
        y: -6,
        width: 14,
        height: 12,
        fill: color,
        stroke: colors.text,
        'stroke-width': '0.8',
        rx: '2',
      });
      g.appendChild(rect);
      const t = document.createElementNS(SVG_NS, 'text');
      setAttrs(t, {
        x: 0,
        y: 3,
        'text-anchor': 'middle',
        fill: colors.textInverse,
        'font-size': '8px',
        'font-family': fonts.mono,
        'font-weight': '700',
      });
      t.textContent = label;
      g.appendChild(t);
      return g;
    }

    function pulse(parent: SVGGElement, x: number, y: number, color: string, ms: number, max = 14): void {
      const c = document.createElementNS(SVG_NS, 'circle');
      setAttrs(c, {
        cx: x,
        cy: y,
        r: 3,
        fill: 'none',
        stroke: color,
        'stroke-width': '1.5',
        opacity: '1',
      });
      parent.appendChild(c);
      const start = performance.now();
      function tick(now: number): void {
        const t = Math.min(1, (now - start) / Math.max(10, ms));
        const r = 3 + max * t;
        c.setAttribute('r', String(r));
        c.setAttribute('opacity', String(1 - t));
        if (t < 1) raf(tick);
        else c.remove();
      }
      raf(tick);
    }

    function bezierPath(x1: number, y1: number, x2: number, y2: number, bow: number): string {
      // 두 점 사이 quadratic Bezier — bow 는 호의 휘어짐 정도 (부호로 위/아래).
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.max(1, Math.hypot(dx, dy));
      // 수직 방향으로 bow 만큼 띄움.
      const nxv = -dy / len;
      const nyv = dx / len;
      const cx = mx + nxv * bow;
      const cy = my + nyv * bow;
      return `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`;
    }

    function pathLength(d: string): number {
      const tmp = document.createElementNS(SVG_NS, 'path');
      tmp.setAttribute('d', d);
      // 일부 happy-dom 환경은 getTotalLength 가 0 — fallback 으로 직선 거리.
      try {
        const len = (tmp as SVGPathElement).getTotalLength?.() ?? 0;
        if (len > 0) return len;
      } catch {
        /* ignore */
      }
      const m = /M([-\d.]+),([-\d.]+).*?([-\d.]+),([-\d.]+)$/.exec(d);
      if (!m) return 100;
      const x1 = Number(m[1]);
      const y1 = Number(m[2]);
      const x2 = Number(m[3]);
      const y2 = Number(m[4]);
      return Math.hypot(x2 - x1, y2 - y1);
    }

    async function drawArc(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      bow: number,
      color: string,
      width: number,
      ms: number,
      opts?: { dashed?: boolean; keepAfter?: boolean },
    ): Promise<SVGPathElement> {
      const d = bezierPath(x1, y1, x2, y2, bow);
      const path = document.createElementNS(SVG_NS, 'path');
      setAttrs(path, {
        d,
        fill: 'none',
        stroke: color,
        'stroke-width': String(width),
      });
      if (opts?.dashed) path.setAttribute('stroke-dasharray', '4 3');
      const len = pathLength(d);
      path.setAttribute('stroke-dasharray', `${len}`);
      path.setAttribute('stroke-dashoffset', `${len}`);
      motionGroup.appendChild(path);
      return new Promise<SVGPathElement>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, ms));
          const e = easeInOut(t);
          path.setAttribute('stroke-dashoffset', String(len * (1 - e)));
          if (t < 1) raf(tick);
          else {
            if (!opts?.keepAfter) {
              // 잔상 (점선) 으로 변환 후 페이드.
              path.setAttribute('stroke-dasharray', '2 4');
              path.setAttribute('stroke-dashoffset', '0');
              const fadeStart = performance.now();
              function fade(now2: number): void {
                const ft = Math.min(1, (now2 - fadeStart) / 380);
                path.setAttribute('opacity', String(1 - ft));
                if (ft < 1) raf(fade);
                else path.remove();
              }
              raf(fade);
            }
            resolve(path);
          }
        }
        raf(tick);
      });
    }

    async function chipAlongPath(
      d: string,
      color: string,
      label: string,
      ms: number,
    ): Promise<void> {
      const tmp = document.createElementNS(SVG_NS, 'path');
      tmp.setAttribute('d', d);
      const totalLen = pathLength(d);
      const chip = makeChip(color, label);
      motionGroup.appendChild(chip);
      return new Promise<void>((resolve) => {
        const start = performance.now();
        function tick(now: number): void {
          const t = Math.min(1, (now - start) / Math.max(10, ms));
          const e = easeInOut(t);
          let pt: { x: number; y: number };
          try {
            const p = (tmp as SVGPathElement).getPointAtLength?.(totalLen * e);
            if (p) pt = { x: p.x, y: p.y };
            else pt = interpEndpoints(d, e);
          } catch {
            pt = interpEndpoints(d, e);
          }
          chip.setAttribute('transform', `translate(${pt.x},${pt.y})`);
          if (t < 1) raf(tick);
          else {
            chip.remove();
            resolve();
          }
        }
        raf(tick);
      });
    }

    function interpEndpoints(d: string, e: number): { x: number; y: number } {
      const m = /M([-\d.]+),([-\d.]+).*?([-\d.]+),([-\d.]+)$/.exec(d);
      if (!m) return { x: 0, y: 0 };
      const x1 = Number(m[1]);
      const y1 = Number(m[2]);
      const x2 = Number(m[3]);
      const y2 = Number(m[4]);
      return { x: x1 + (x2 - x1) * e, y: y1 + (y2 - y1) * e };
    }

    function setEdgeColor(rec: EdgeRec): void {
      if (rec.cached.size === 0) {
        rec.pointEl.setAttribute('fill', colors.itemDefault);
        rec.pointEl.setAttribute('stroke', colors.textMuted);
      } else if (rec.cached.size === 1) {
        const id = rec.cached.values().next().value as string | undefined;
        const color = id ? contents.get(id)?.color ?? colors.itemActive : colors.itemActive;
        rec.pointEl.setAttribute('fill', color);
        rec.pointEl.setAttribute('stroke', colors.text);
      } else {
        // 여러 콘텐츠 — 점 둘레에 작은 색 띠 (간단히 첫 색을 fill, 나머지는 무지개 stroke).
        const first = rec.cached.values().next().value as string | undefined;
        const color = first ? contents.get(first)?.color ?? colors.itemActive : colors.itemActive;
        rec.pointEl.setAttribute('fill', color);
        rec.pointEl.setAttribute('stroke', colors.itemPivot);
        rec.pointEl.setAttribute('stroke-width', '2');
      }
    }

    function bumpOriginLoad(): void {
      originLoadWindow.push(performance.now());
      const cutoff = performance.now() - 30_000;
      originLoadWindow = originLoadWindow.filter((t) => t > cutoff);
      const ratio = Math.min(1, originLoadWindow.length / 30);
      gaugeFill.setAttribute('width', String(GAUGE_W * ratio));
    }

    function bumpEdgeCounter(rec: EdgeRec): void {
      rec.count += 1;
      rec.counterEl.textContent = String(rec.count);
    }

    function setBaseCaption(text: string): void {
      baseCaption.textContent = text;
    }

    function setCaption(text: string, opts?: { duration?: number }): void {
      clearCaptionTimer();
      eventCaption.textContent = text;
      eventCaption.setAttribute('fill', colors.text);
      const dur = opts?.duration ?? 1800;
      captionTimer = setTimeout(() => {
        eventCaption.textContent = '';
      }, dur);
    }

    function reset(): void {
      clearCaptionTimer();
      while (motionGroup.firstChild) motionGroup.firstChild.remove();
      while (pulseGroup.firstChild) pulseGroup.firstChild.remove();
      while (edgeGroup.firstChild) edgeGroup.firstChild.remove();
      while (trayGroup.firstChild) trayGroup.firstChild.remove();
      edges.clear();
      contents.clear();
      regionalCached = new Set<string>();
      originLoadWindow = [];
      gaugeFill.setAttribute('width', '0');
      eventCaption.textContent = '';
    }

    function init(payload: {
      edges: Array<{ id: string; label: string; nx: number; ny: number }>;
      regional: { id: string } | null;
      origin: { id: string };
      contents: Array<{ id: string; label: string }>;
    }): void {
      reset();

      // 콘텐츠 색.
      const palette = categorical(Math.max(3, payload.contents.length), CONTENT_PALETTE_TONE);
      payload.contents.forEach((c, i) => {
        contents.set(c.id, { id: c.id, label: c.label, color: palette[i % palette.length]! });
      });

      // 콘텐츠 트레이 타일.
      payload.contents.forEach((c, i) => {
        const cy = TRAY_TOP + 36 + i * 44;
        const tile = document.createElementNS(SVG_NS, 'rect');
        setAttrs(tile, {
          x: TRAY_LEFT + 14,
          y: cy - 12,
          width: TRAY_RIGHT - TRAY_LEFT - 28,
          height: 24,
          fill: contents.get(c.id)?.color ?? colors.itemActive,
          stroke: colors.text,
          'stroke-width': '1',
          rx: '3',
        });
        trayGroup.appendChild(tile);
        const t = document.createElementNS(SVG_NS, 'text');
        setAttrs(t, {
          x: (TRAY_LEFT + TRAY_RIGHT) / 2,
          y: cy + 4,
          'text-anchor': 'middle',
          fill: colors.textInverse,
          'font-size': fontSizes.sm,
          'font-family': fonts.mono,
          'font-weight': '700',
        });
        t.textContent = c.label;
        trayGroup.appendChild(t);
      });

      // 엣지 PoP.
      for (const e of payload.edges) {
        const x = nx2x(e.nx);
        const y = ny2y(e.ny);
        const point = document.createElementNS(SVG_NS, 'circle');
        setAttrs(point, {
          cx: x,
          cy: y,
          r: 7,
          fill: colors.itemDefault,
          stroke: colors.textMuted,
          'stroke-width': '1.2',
        });
        edgeGroup.appendChild(point);

        const labelEl = document.createElementNS(SVG_NS, 'text');
        const labelDx = e.nx > 0.7 ? -10 : 10;
        const labelAnchor = e.nx > 0.7 ? 'end' : 'start';
        setAttrs(labelEl, {
          x: x + labelDx,
          y: y - 8,
          'text-anchor': labelAnchor,
          fill: colors.text,
          'font-size': '11px',
          'font-family': fonts.body,
          'font-weight': '600',
        });
        labelEl.textContent = e.label;
        edgeGroup.appendChild(labelEl);

        const counter = document.createElementNS(SVG_NS, 'text');
        setAttrs(counter, {
          x: x + labelDx,
          y: y + 18,
          'text-anchor': labelAnchor,
          fill: colors.textMuted,
          'font-size': '9px',
          'font-family': fonts.mono,
        });
        counter.textContent = '0';
        edgeGroup.appendChild(counter);

        // 클라이언트 — 엣지에서 약간 떨어진 자리.
        const cdx = e.nx > 0.5 ? -16 : 16;
        const cdy = e.ny > 0.5 ? -14 : 14;
        const clientX = x + cdx;
        const clientY = y + cdy;
        const client = document.createElementNS(SVG_NS, 'circle');
        setAttrs(client, {
          cx: clientX,
          cy: clientY,
          r: 3.5,
          fill: colors.text,
          stroke: 'none',
        });
        edgeGroup.appendChild(client);

        // 점선 인근선.
        const nl = document.createElementNS(SVG_NS, 'line');
        setAttrs(nl, {
          x1: clientX,
          y1: clientY,
          x2: x,
          y2: y,
          stroke: colors.textMuted,
          'stroke-width': '0.8',
          'stroke-dasharray': '2 3',
          opacity: '0.7',
        });
        edgeGroup.appendChild(nl);

        edges.set(e.id, {
          id: e.id,
          label: e.label,
          x,
          y,
          pointEl: point,
          labelEl,
          counterEl: counter,
          count: 0,
          cached: new Set<string>(),
          clientEl: client,
          clientX,
          clientY,
          neighborLine: nl,
        });
      }

      setCaption('지도 위 엣지가 모두 회색 — 빈 캐시 상태에서 시작.', { duration: 2400 });
    }

    async function emitRequest(
      payload: {
        traceIndex: number;
        edgeId: string;
        contentId: string;
        clientLabel: string;
        outcome: 'hit' | 'regional-hit' | 'miss';
        fillPath?: Array<'edge' | 'regional' | 'origin'>;
        reachedOrigin: boolean;
      },
    ): Promise<void> {
      const rec = edges.get(payload.edgeId);
      if (!rec) return;
      const content = contents.get(payload.contentId);
      if (!content) return;
      const color = content.color;
      const label = content.label;

      // 1. 클라이언트→엣지 짧은 호 (요청).
      const reqColor = payload.outcome === 'hit' ? colors.itemActive : colors.text;
      const reqWidth = payload.outcome === 'hit' ? 2 : 2;
      const arc1 = bezierPath(rec.clientX, rec.clientY, rec.x, rec.y, 8);
      void drawArc(
        rec.clientX,
        rec.clientY,
        rec.x,
        rec.y,
        8,
        reqColor,
        reqWidth,
        SHORT_ARC_MS,
      );
      await chipAlongPath(arc1, color, label, SHORT_ARC_MS);

      bumpEdgeCounter(rec);

      if (payload.outcome === 'hit') {
        // 히트: 즉시 응답 짧은 호.
        const arc2 = bezierPath(rec.x, rec.y, rec.clientX, rec.clientY, -8);
        void drawArc(
          rec.x,
          rec.y,
          rec.clientX,
          rec.clientY,
          -8,
          colors.itemActive,
          2,
          SHORT_ARC_MS,
        );
        await chipAlongPath(arc2, color, label, SHORT_ARC_MS);
        setCaption(
          `${rec.label} 엣지에서 즉답 — 짧은 왕복으로 끝났다 (${label}).`,
          { duration: 2200 },
        );
        return;
      }

      // 미스 / 지역-적중: 위 계층 캐스케이드.
      // path 를 따라 한 단씩 거슬러 올라간 뒤, 답이 잡힌 노드에서 출발해 거꾸로 채우며 내려온다.
      const goingUp: Array<{ from: { x: number; y: number }; to: { x: number; y: number }; isOrigin?: boolean }> = [];
      // 엣지 → 지역.
      goingUp.push({
        from: { x: rec.x, y: rec.y },
        to: { x: REGIONAL_X, y: REGIONAL_Y },
      });
      if (payload.outcome === 'miss') {
        // 지역 → 오리진.
        goingUp.push({
          from: { x: REGIONAL_X, y: REGIONAL_Y },
          to: { x: ORIGIN_X, y: ORIGIN_Y },
          isOrigin: true,
        });
      }

      // 위로 거슬러 올라가는 긴 호.
      for (const hop of goingUp) {
        const dHop = bezierPath(hop.from.x, hop.from.y, hop.to.x, hop.to.y, -28);
        void drawArc(
          hop.from.x,
          hop.from.y,
          hop.to.x,
          hop.to.y,
          -28,
          colors.danger,
          3,
          LONG_ARC_HOP_MS,
        );
        await chipAlongPath(dHop, colors.bg, '?', LONG_ARC_HOP_MS);
      }

      if (payload.outcome === 'miss') {
        // 오리진 펄스 + 부하 게이지 누적.
        pulse(pulseGroup, ORIGIN_X, ORIGIN_Y, colors.danger, PULSE_MS, 18);
        bumpOriginLoad();
      } else {
        // regional-hit — 지역 노드에서 펄스.
        pulse(pulseGroup, REGIONAL_X, REGIONAL_Y, colors.itemActive, PULSE_MS, 14);
      }

      // 답이 잡힌 자리에서 아래로 채우며 내려옴.
      const goingDown = [...goingUp].reverse().map((h) => ({ from: h.to, to: h.from }));
      // 첫 번째 hop 의 출발 노드가 "답이 잡힌 노드".
      for (const hop of goingDown) {
        const dHop = bezierPath(hop.from.x, hop.from.y, hop.to.x, hop.to.y, 28);
        void drawArc(
          hop.from.x,
          hop.from.y,
          hop.to.x,
          hop.to.y,
          28,
          color,
          2.5,
          FILL_HOP_MS,
        );
        await chipAlongPath(dHop, color, label, FILL_HOP_MS);
      }

      // 엣지 채움 (회색 → 콘텐츠 색).
      rec.cached.add(payload.contentId);
      setEdgeColor(rec);
      pulse(pulseGroup, rec.x, rec.y, color, PULSE_MS, 12);
      if (payload.outcome === 'miss') {
        regionalCached.add(payload.contentId);
      } else if (payload.outcome === 'regional-hit') {
        // 지역에 이미 있던 — set 유지.
      }

      // 응답 짧은 호.
      const arc2 = bezierPath(rec.x, rec.y, rec.clientX, rec.clientY, -8);
      void drawArc(
        rec.x,
        rec.y,
        rec.clientX,
        rec.clientY,
        -8,
        colors.itemActive,
        2,
        SHORT_ARC_MS,
      );
      await chipAlongPath(arc2, color, label, SHORT_ARC_MS);

      if (payload.outcome === 'miss') {
        setCaption(
          `${rec.label} 미스 — 오리진까지 다녀와 엣지에 채워 두었다 (${label}).`,
          { duration: 2400 },
        );
      } else {
        setCaption(
          `${rec.label} 미스 — 지역 캐시에서 잡혔다 (오리진까지 가지 않음, ${label}).`,
          { duration: 2400 },
        );
      }
    }

    async function emitInvalidate(
      payload: { traceIndex: number; edgeId: string; contentId?: string },
    ): Promise<void> {
      const rec = edges.get(payload.edgeId);
      if (!rec) return;
      if (payload.contentId) rec.cached.delete(payload.contentId);
      else rec.cached.clear();
      setEdgeColor(rec);
      pulse(pulseGroup, rec.x, rec.y, colors.danger, 360, 14);
      await sleep(NEIGHBOR_LINE_MS);
      setCaption(
        `${rec.label} 엣지 무효화 — 다음 요청은 다시 위 계층까지 다녀온다.`,
        { duration: 2200 },
      );
    }

    function signalInvalid(op: string, raw: string): void {
      setCaption(`${op}: 입력이 올바르지 않다 — "${raw}"`, { duration: 2000 });
    }

    function signalDemoEnd(): void {
      setCaption(
        '이제 직접 — 콘텐츠와 엣지를 입력하고 요청 / 자동 시연 / 초기화 를 눌러 보세요.',
        { duration: 2800 },
      );
    }

    return {
      destroy() {
        clearCaptionTimer();
        if (root.parentElement) root.remove();
      },
      reset,
      init,
      setBaseCaption,
      setCaption,
      emitRequest,
      emitInvalidate,
      signalInvalid,
      signalDemoEnd,
    };
  },
};
