/**
 * one-door-many-rooms 장면 — 이벤트를 잇기만 한다. 경로 고르기 · 돌아오는 차례 · 부름 수는
 * 알고리즘이 셈해 싣는다. 장면은 그것이 바탕 · 앞 장면과 맞는지 보고 어긋나면 던진다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  findRoute,
  readOneDoorManyRoomsData,
  type GatewayRequest,
  type GatewayRoute,
  type GatewayService,
} from './algorithm.js';

export type GatewayStep =
  | { kind: 'route'; req: number; prefix: string; service: string; ms: number; status: number }
  | { kind: 'scatter'; req: number; prefix: string; services: string[] }
  | { kind: 'gather'; req: number; prefix: string; service: string; ms: number; got: number; of: number }
  | { kind: 'bundle'; req: number; prefix: string; status: number; ms: number; parts: string[] }
  | { kind: 'notFound'; req: number; prefix: string; status: number; serviceCalls: number };

export type GatewayFan = { req: number; prefix: string; services: string[]; back: string[] };

export type OneDoorManyRoomsScene = {
  // 바탕
  services: GatewayService[];
  routes: GatewayRoute[];
  requests: GatewayRequest[];
  // 자취
  /** 서비스별 받은 부름 수 (services 차례). init 전에는 null. */
  calls: number[] | null;
  /** 요청별 게이트웨이가 돌려준 상태. 아직이면 null. */
  results: (number | null)[];
  /** 흩어 보낸 요청의 모임. 없으면 null. */
  fan: GatewayFan | null;
  // 이번 걸음
  step: GatewayStep | null;
};

function fail(where: string, why: string): never {
  throw new Error(`oneDoorManyRoomsScene: ${where} — ${why}`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) fail(`${event.type}.payload`, '객체가 아니다');
  return p as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${type}.payload.${key}`, '수가 아니다');
  return v;
}

function str(p: Record<string, unknown>, key: string, type: string): string {
  const v = p[key];
  if (typeof v !== 'string') fail(`${type}.payload.${key}`, '문자열이 아니다');
  return v;
}

function strList(p: Record<string, unknown>, key: string, type: string): string[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x): x is string => typeof x === 'string')) {
    fail(`${type}.payload.${key}`, '문자열 배열이 아니다');
  }
  return [...v];
}

function numList(p: Record<string, unknown>, key: string, type: string): number[] {
  const v = p[key];
  if (!Array.isArray(v) || !v.every((x): x is number => typeof x === 'number' && Number.isFinite(x))) {
    fail(`${type}.payload.${key}`, '수 배열이 아니다');
  }
  return [...v];
}

/** 이번 요청이 차례에 맞는 다음 요청인지 — 앞 요청이 다 끝났고 이것은 아직이다. */
function checkTurn(scene: OneDoorManyRoomsScene, req: number, type: string): void {
  if (!Number.isInteger(req) || req < 0 || req >= scene.requests.length) fail(`${type}.payload.req`, `요청 ${req} 이 없다`);
  if (scene.results[req] !== null) fail(`${type}.payload.req`, `요청 ${req} 은 이미 끝났다`);
  for (let i = 0; i < req; i += 1) {
    if (scene.results[i] === null) fail(`${type}.payload.req`, `앞 요청 ${i} 이 아직 끝나지 않았다`);
  }
}

function serviceIndex(scene: OneDoorManyRoomsScene, id: string, where: string): number {
  const i = scene.services.findIndex((s) => s.id === id);
  if (i < 0) fail(where, `서비스 ${id} 가 없다`);
  return i;
}

function callsOf(scene: OneDoorManyRoomsScene, type: string): number[] {
  if (scene.calls === null) fail(type, 'init 앞에 왔다');
  return scene.calls;
}

function withResult(scene: OneDoorManyRoomsScene, req: number, status: number): (number | null)[] {
  return scene.results.map((r, i) => (i === req ? status : r));
}

export const oneDoorManyRoomsScene: ScenePlan<OneDoorManyRoomsScene> = {
  initial(initialData: unknown): OneDoorManyRoomsScene {
    const data = readOneDoorManyRoomsData(initialData);
    return {
      services: data.services.map((s) => ({ ...s })),
      routes: data.routes.map((r) => ({ prefix: r.prefix, targets: [...r.targets] })),
      requests: data.requests.map((q) => ({ ...q })),
      calls: null,
      results: data.requests.map(() => null),
      fan: null,
      step: null,
    };
  },

  reduce(scene: OneDoorManyRoomsScene, event: FacetRuntimeEvent): OneDoorManyRoomsScene {
    const type = event.type;
    switch (type) {
      case 'init': {
        const p = payloadOf(event);
        const calls = numList(p, 'calls', type);
        if (calls.length !== scene.services.length) fail('init.payload.calls', '서비스 수와 길이가 다르다');
        return { ...scene, calls, step: null };
      }

      case 'route': {
        const p = payloadOf(event);
        const req = num(p, 'req', type);
        const prefix = str(p, 'prefix', type);
        const service = str(p, 'service', type);
        const ms = num(p, 'ms', type);
        const status = num(p, 'status', type);
        const count = num(p, 'calls', type);
        checkTurn(scene, req, type);
        if (scene.fan !== null) fail('route', '흩어 보낸 요청이 아직 모이지 않았다');
        const route = findRoute(scene.routes, prefix);
        if (route === null || route.targets.length !== 1 || route.targets[0] !== service) {
          fail('route.payload.service', `경로 ${prefix} 의 서비스가 ${service} 가 아니다`);
        }
        const i = serviceIndex(scene, service, 'route.payload.service');
        const calls = callsOf(scene, type);
        if (count !== (calls[i] as number) + 1) fail('route.payload.calls', `앞 부름 수 ${calls[i]} 에서 하나 는 값이 아니다`);
        return {
          ...scene,
          calls: calls.map((c, k) => (k === i ? count : c)),
          results: withResult(scene, req, status),
          step: { kind: 'route', req, prefix, service, ms, status },
        };
      }

      case 'scatter': {
        const p = payloadOf(event);
        const req = num(p, 'req', type);
        const prefix = str(p, 'prefix', type);
        const services = strList(p, 'services', type);
        const counts = numList(p, 'calls', type);
        checkTurn(scene, req, type);
        if (scene.fan !== null) fail('scatter', '앞 모임이 아직 열려 있다');
        const route = findRoute(scene.routes, prefix);
        if (route === null || route.targets.join('\n') !== services.join('\n')) {
          fail('scatter.payload.services', `경로 ${prefix} 의 목록과 다르다`);
        }
        if (counts.length !== services.length) fail('scatter.payload.calls', '서비스 목록과 길이가 다르다');
        const calls = [...callsOf(scene, type)];
        services.forEach((id, k) => {
          const i = serviceIndex(scene, id, `scatter.payload.services[${k}]`);
          if (counts[k] !== (calls[i] as number) + 1) fail(`scatter.payload.calls[${k}]`, '앞 부름 수에서 하나 는 값이 아니다');
          calls[i] = counts[k] as number;
        });
        return {
          ...scene,
          calls,
          fan: { req, prefix, services, back: [] },
          step: { kind: 'scatter', req, prefix, services },
        };
      }

      case 'gather': {
        const p = payloadOf(event);
        const req = num(p, 'req', type);
        const service = str(p, 'service', type);
        const ms = num(p, 'ms', type);
        const got = num(p, 'got', type);
        const of = num(p, 'of', type);
        const fan = scene.fan;
        if (fan === null || fan.req !== req) fail('gather.payload.req', `요청 ${req} 의 모임이 없다`);
        if (!fan.services.includes(service)) fail('gather.payload.service', `${service} 에 보내지 않았다`);
        if (fan.back.includes(service)) fail('gather.payload.service', `${service} 는 이미 돌아왔다`);
        if (got !== fan.back.length + 1) fail('gather.payload.got', `앞 모인 수 ${fan.back.length} 에서 하나 는 값이 아니다`);
        if (of !== fan.services.length) fail('gather.payload.of', '보낸 수와 다르다');
        const i = serviceIndex(scene, service, 'gather.payload.service');
        if (scene.services[i]?.ms !== ms) fail('gather.payload.ms', `${service} 의 처리 시간과 다르다`);
        return {
          ...scene,
          fan: { ...fan, services: [...fan.services], back: [...fan.back, service] },
          step: { kind: 'gather', req, prefix: fan.prefix, service, ms, got, of },
        };
      }

      case 'bundle': {
        const p = payloadOf(event);
        const req = num(p, 'req', type);
        const status = num(p, 'status', type);
        const ms = num(p, 'ms', type);
        const parts = strList(p, 'parts', type);
        const fan = scene.fan;
        if (fan === null || fan.req !== req) fail('bundle.payload.req', `요청 ${req} 의 모임이 없다`);
        if (fan.back.length !== fan.services.length) fail('bundle', '아직 다 모이지 않았다');
        if (parts.join('\n') !== fan.back.join('\n')) fail('bundle.payload.parts', '모인 차례와 다르다');
        checkTurn(scene, req, type);
        return {
          ...scene,
          fan: null,
          results: withResult(scene, req, status),
          step: { kind: 'bundle', req, prefix: fan.prefix, status, ms, parts },
        };
      }

      case 'notFound': {
        const p = payloadOf(event);
        const req = num(p, 'req', type);
        const prefix = str(p, 'prefix', type);
        const status = num(p, 'status', type);
        const serviceCalls = num(p, 'serviceCalls', type);
        checkTurn(scene, req, type);
        if (scene.fan !== null) fail('notFound', '흩어 보낸 요청이 아직 모이지 않았다');
        if (findRoute(scene.routes, prefix) !== null) fail('notFound.payload.prefix', `${prefix} 는 경로표에 있다`);
        callsOf(scene, type);
        return {
          ...scene,
          results: withResult(scene, req, status),
          step: { kind: 'notFound', req, prefix, status, serviceCalls },
        };
      }

      default:
        return fail(`event.type`, `모르는 이벤트 ${type}`);
    }
  },
};
