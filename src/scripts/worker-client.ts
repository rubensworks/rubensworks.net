/**
 * The main thread's side of `foaf-worker.ts`: one worker, shared by every feature.
 *
 * Created once and kept for the life of the page. Re-spawning would repay the bundle's
 * parse cost and the engine's 230 ms of wiring every time, which is the wrong trade for an
 * interaction measured in hundreds of milliseconds. An idle timeout would guarantee that
 * cost on the next hover to save memory nobody is short of.
 *
 * Answers are routed by request id. Every request ends with a `done` message, after which
 * its listener is dropped; a `failed` message is a stage that did not answer, not the end.
 */
import type { Request, RequestBody, Response } from './foaf-worker'

export type Listener = (response: Response) => void

const listeners = new Map<number, Listener>()
const onFailure = new Set<() => void>()
let worker: Worker | undefined
let nextId = 0

/** Whether this browser can run the worker at all; without it every feature stays off. */
export function supportsWorker(): boolean {
  return typeof Worker !== 'undefined'
}

export function ensureWorker(): Worker {
  worker ??= (() => {
    const created = new Worker(new URL('./foaf-worker.ts', import.meta.url), { type: 'module' })
    created.addEventListener('message', (event: MessageEvent<Response>) => {
      const response = event.data
      const listener = listeners.get(response.id)
      if (!listener) return
      if ('done' in response) listeners.delete(response.id)
      listener(response)
    })
    // A worker that cannot start must not take the page's author links with it: every
    // feature is told, and each one degrades on its own terms.
    created.addEventListener('error', () => {
      listeners.clear()
      for (const callback of onFailure) callback()
    })
    return created
  })()
  return worker
}

/** Posts a request and routes its answers to the listener until `done`. Returns the id. */
export function send(request: RequestBody, listener: Listener): number {
  const id = ++nextId
  listeners.set(id, listener)
  ensureWorker().postMessage({ ...request, id } as Request)
  return id
}

/** Stops routing answers for a request; the worker finishes it regardless. */
export function forget(id: number): void {
  listeners.delete(id)
}

/** Called once if the worker fails to start or crashes. */
export function whenWorkerFails(callback: () => void): void {
  onFailure.add(callback)
}
