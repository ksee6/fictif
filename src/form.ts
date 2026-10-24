// src/form.ts
import { ref, reactive, computed, watch, type Ref } from "vue";
import { useAPI, type APIRequestConfig } from "./api.js";

export type FormFields = Record<string, any>;

export interface FormInstance<T extends FormFields = FormFields> {
  [key: string]: any;

  readonly dirty: boolean;
  readonly isDirty: Ref<boolean>;
  readonly processing: boolean;
  readonly errors: Record<keyof T | string, string>;
  readonly hasErrors: boolean;

  data(): T;
  reset(...fields: (keyof T)[]): void;
  clear(): void;
  setError(field: keyof T | string, message: string): void;
  clearErrors(...fields: (keyof T)[]): void;

  submit<R = any>(method: string, url: string, config?: APIRequestConfig): Promise<R>;
  post<R = any>(url: string, config?: APIRequestConfig): Promise<R>;
  get<R = any>(url: string, config?: APIRequestConfig): Promise<R>;
  put<R = any>(url: string, config?: APIRequestConfig): Promise<R>;
  patch<R = any>(url: string, config?: APIRequestConfig): Promise<R>;
  delete<R = any>(url: string, config?: APIRequestConfig): Promise<R>;
}

function deepClone<T>(val: T): T {
  if (val === null || typeof val !== "object") return val;
  if (val instanceof Date) return new Date(val.getTime()) as any;
  if (val instanceof RegExp) return new RegExp(val.source, val.flags) as any;
  if (Array.isArray(val)) return val.map(deepClone) as any;
  const copy: any = {};
  for (const k of Object.keys(val)) {
    copy[k] = deepClone((val as any)[k]);
  }
  return copy;
}

function isEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (!keysB.includes(k) || !isEqual(a[k], b[k])) return false;
  }
  return true;
}

/**
 * Creates a reactive form instance with dirty tracking, validation state,
 * reset capabilities, and integrated API/router HTTP dispatch methods.
 */
export function useForm<T extends FormFields = FormFields>(
  initialValues: T = {} as T,
): FormInstance<T> {
  // Allow constructable call: new useForm(...)
  if (new.target) {
    return useForm(initialValues);
  }

  const initialBaseline = deepClone(initialValues);
  const fieldsState = reactive<T>(deepClone(initialValues));
  const errors = reactive<Record<string, string>>({});
  const processing = ref(false);

  // Dirty detection: checks if current field values diverge from baseline
  const isDirty = computed<boolean>(() => {
    return !isEqual(fieldsState, initialBaseline);
  });

  const hasErrors = computed<boolean>(() => {
    return Object.keys(errors).length > 0;
  });

  function getSnapshot(): T {
    const out: any = {};
    for (const key of Object.keys(fieldsState)) {
      out[key] = (fieldsState as any)[key];
    }
    return out;
  }

  function reset(...specificFields: (keyof T)[]): void {
    if (specificFields.length === 0) {
      for (const key of Object.keys(fieldsState)) {
        delete (fieldsState as any)[key];
      }
      for (const [key, val] of Object.entries(initialBaseline)) {
        (fieldsState as any)[key] = deepClone(val);
      }
    } else {
      for (const key of specificFields) {
        if (key in initialBaseline) {
          (fieldsState as any)[key] = deepClone(initialBaseline[key]);
        }
      }
    }
    clearErrors();
  }

  function clear(): void {
    for (const key of Object.keys(fieldsState)) {
      const val = (fieldsState as any)[key];
      if (typeof val === "string") (fieldsState as any)[key] = "";
      else if (typeof val === "number") (fieldsState as any)[key] = 0;
      else if (typeof val === "boolean") (fieldsState as any)[key] = false;
      else if (Array.isArray(val)) (fieldsState as any)[key] = [];
      else if (val && typeof val === "object") (fieldsState as any)[key] = {};
      else (fieldsState as any)[key] = null;
    }
  }

  function setError(field: keyof T | string, message: string): void {
    errors[field as string] = message;
  }

  function clearErrors(...specificFields: (keyof T)[]): void {
    if (specificFields.length === 0) {
      for (const k of Object.keys(errors)) delete errors[k];
    } else {
      for (const k of specificFields) delete errors[k as string];
    }
  }

  async function submit<R = any>(
    method: string,
    url: string,
    config: APIRequestConfig = {},
  ): Promise<R> {
    processing.value = true;
    clearErrors();

    const api = useAPI();
    const upperMethod = method.toUpperCase() as any;
    const payload = getSnapshot();

    try {
      const reqConfig: APIRequestConfig = {
        ...config,
        method: upperMethod,
      };

      if (upperMethod === "GET") {
        reqConfig.params = { ...config.params, ...payload };
      } else {
        reqConfig.body = config.body !== undefined ? config.body : payload;
      }

      const res = await api.request<R>(url, reqConfig);
      return res;
    } catch (err: any) {
      if (err && err.data && typeof err.data === "object") {
        for (const [k, v] of Object.entries(err.data)) {
          if (typeof v === "string") setError(k, v);
          else if (Array.isArray(v) && typeof v[0] === "string") setError(k, v[0]);
        }
      }
      throw err;
    } finally {
      processing.value = false;
    }
  }

  const helperMethods = {
    data: getSnapshot,
    reset,
    clear,
    setError,
    clearErrors,
    submit,
    post: <R = any>(url: string, config?: APIRequestConfig) => submit<R>("POST", url, config),
    get: <R = any>(url: string, config?: APIRequestConfig) => submit<R>("GET", url, config),
    put: <R = any>(url: string, config?: APIRequestConfig) => submit<R>("PUT", url, config),
    patch: <R = any>(url: string, config?: APIRequestConfig) => submit<R>("PATCH", url, config),
    delete: <R = any>(url: string, config?: APIRequestConfig) => submit<R>("DELETE", url, config),
  };

  const formProxy = new Proxy(fieldsState, {
    get(target, prop, receiver) {
      if (prop === "dirty") {
        return isDirty.value;
      }
      if (prop === "isDirty") {
        return isDirty;
      }
      if (prop === "processing") {
        return processing.value;
      }
      if (prop === "errors") {
        return errors;
      }
      if (prop === "hasErrors") {
        return hasErrors.value;
      }
      if (prop in helperMethods) {
        return (helperMethods as any)[prop];
      }
      return Reflect.get(target, prop, receiver);
    },

    set(target, prop, val, receiver) {
      if (prop === "dirty" || prop === "isDirty" || prop === "processing" || prop === "errors" || prop === "hasErrors") {
        return false;
      }
      if (prop in helperMethods) {
        return false;
      }
      return Reflect.set(target, prop, val, receiver);
    },

    has(target, prop) {
      if (
        prop === "dirty" ||
        prop === "isDirty" ||
        prop === "processing" ||
        prop === "errors" ||
        prop === "hasErrors" ||
        prop in helperMethods
      ) {
        return true;
      }
      return Reflect.has(target, prop);
    },
  });

  return formProxy as FormInstance<T>;
}

export default useForm;
