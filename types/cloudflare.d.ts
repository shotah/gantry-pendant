declare module "cloudflare:workers" {
  export class DurableObject<E = unknown> {
    readonly ctx: DurableObjectState;
    readonly env: E;
    constructor(ctx: DurableObjectState, env: E);
  }
  export const env: Env;
}

declare module "vinext/server/app-router-entry" {
  const handler: {
    fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
  };
  export default handler;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId, options?: { locationHint?: string }): DurableObjectStub;
}

type DurableObjectId = { readonly __durableObjectId: unique symbol };

interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface DurableObjectState {
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
  getTags(ws: WebSocket): string[];
  setWebSocketAutoResponse(pair?: WebSocketRequestResponsePair | null): void;
  storage: DurableObjectStorage;
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  delete(keys: string[]): Promise<number>;
  list<T>(options?: { prefix?: string; limit?: number }): Promise<Map<string, T>>;
}

declare class WebSocketRequestResponsePair {
  constructor(request: string, response: string);
  readonly request: string;
  readonly response: string;
}

interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

declare const WebSocketPair: {
  new (): WebSocketPair;
};

interface ResponseInit {
  webSocket?: WebSocket;
}
