import { reactive, type VNode } from "vue";

export interface PersistEntry {
  id: string;
  props: Record<string, any>;
  state: Record<string, any>;
  vnodes?: VNode[];
  domContainer?: HTMLElement;
}

export const persistCache = new Map<string, PersistEntry>();

export function getPersistEntry(id: string = "default"): PersistEntry {
  let entry = persistCache.get(id);
  if (!entry) {
    entry = {
      id,
      props: reactive({}),
      state: reactive({}),
    };
    persistCache.set(id, entry);
  }
  return entry;
}

export function usePersistState<T extends Record<string, any>>(id: string, initial: T): T {
  const entry = getPersistEntry(id);
  for (const [k, v] of Object.entries(initial)) {
    if (entry.state[k] === undefined) {
      entry.state[k] = v;
    }
  }
  return entry.state as T;
}
