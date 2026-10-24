import { reactive, type VNode } from "vue";

export interface PersistEntry {
  id: string;
  props: Record<string, any>;
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
    };
    persistCache.set(id, entry);
  }
  return entry;
}
