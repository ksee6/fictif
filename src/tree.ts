// src/tree.ts
/**
 * Radix Trie tree data structure supporting Path indexing, pattern matching, and typed values.
 * Directly mirrors Ksee::Tree<T> from standard.
 */

import { Path } from "./path.js";

// Helper: check if prefix is a sub-path prefix of full
function isPrefixOf(prefix: Path, full: Path): boolean {
  if (prefix.length > full.length) return false;
  for (let i = 0; i < prefix.length; ++i) {
    if (prefix[i] !== full[i]) return false;
  }
  return true;
}

function slicePath(p: Path, start: number): Path {
  const out = new Path();
  for (let i = start; i < p.length; ++i) {
    out.push(p[i]);
  }
  return out;
}

// Binary VarLong helpers (mirrors standard VarLong)
function encodeVarLong(buf: number[], v: bigint | number): void {
  let val = BigInt(v);
  if (val < 0n) val = 0n;
  do {
    let t = Number(val & 0x7fn);
    val >>= 7n;
    if (val > 0n) t |= 0x80;
    buf.push(t);
  } while (val > 0n);
}

function decodeVarLong(data: Uint8Array, ptr: { offset: number }): bigint | null {
  let r = 0n;
  let s = 0n;
  let ok = false;
  while (ptr.offset < data.length) {
    const b = data[ptr.offset++];
    r |= BigInt(b & 0x7f) << s;
    s += 7n;
    if (!(b & 0x80)) {
      ok = true;
      break;
    }
    if (s >= 70n) return null;
  }
  return ok ? r : null;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class Tree<T = any> {
  public children: Tree<any>[] = [];
  public parent: Tree<any> | null = null;
  public path: Path = new Path();
  public value: T | undefined = undefined;
  protected _hasValue: boolean = false;

  constructor(path?: Path | string, val?: T) {
    if (path !== undefined) {
      this.path = path instanceof Path ? path : new Path(path);
    }
    if (val !== undefined) {
      this.value = val;
      this._hasValue = true;
    }
  }

  public isNull(): boolean {
    return this.children.length === 0 && !this._hasValue;
  }

  public hasValue(): boolean {
    return this._hasValue;
  }

  public get size(): number {
    return this.children.length;
  }

  public valueType(): number {
    if (!this._hasValue) return 0;
    if (typeof this.value === "string") return 3;
    if (typeof this.value === "boolean") return 4;
    if (typeof this.value === "number" || typeof this.value === "bigint") return 2;
    return 1;
  }

  public asString(): string {
    if (!this._hasValue || this.value === undefined || this.value === null) return "";
    return String(this.value);
  }

  public asBool(): boolean {
    if (!this._hasValue) return false;
    if (typeof this.value === "boolean") return this.value;
    if (typeof this.value === "number") return this.value !== 0;
    if (typeof this.value === "string") return this.value === "true" || this.value === "1";
    return Boolean(this.value);
  }

  public asNumber(): number {
    if (!this._hasValue) return 0;
    if (typeof this.value === "number") return this.value;
    if (typeof this.value === "boolean") return this.value ? 1 : 0;
    if (typeof this.value === "string") return parseFloat(this.value) || 0;
    return Number(this.value) || 0;
  }

  public as<ValT = T>(): ValT {
    return this.value as unknown as ValT;
  }

  public clear(): void {
    for (const child of this.children) {
      child.parent = null;
    }
    this.children = [];
    this.value = undefined;
    this._hasValue = false;
  }

  public addChild<ValT = any>(c: Tree<ValT>): Tree<ValT> {
    if (c) {
      c.parent = this;
      this.children.push(c);
    }
    return c;
  }

  public get(target: Path | string): Tree<any> | null {
    const p = target instanceof Path ? target : new Path(target);
    if (p.length === 0) return this;

    for (let i = 0; i < this.children.length; ++i) {
      const child = this.children[i];
      if (child.path.equals(p)) {
        return child;
      }
      if (child.path.length > 0 && isPrefixOf(child.path, p)) {
        const remaining = slicePath(p, child.path.length);
        const res = child.get(remaining);
        if (res) return res;
      }
    }
    return null;
  }

  public first(target: Path | string): Tree<any> | null {
    return this.get(target);
  }

  public has(target: Path | string): boolean {
    return this.get(target) !== null;
  }

  public deleteKey(target: Path | string): boolean {
    const p = target instanceof Path ? target : new Path(target);
    if (p.length === 0) return false;

    let deleted = false;
    for (let i = this.children.length - 1; i >= 0; --i) {
      const child = this.children[i];
      if (child.path.equals(p)) {
        child.parent = null;
        this.children.splice(i, 1);
        deleted = true;
      } else if (child.path.length > 0 && isPrefixOf(child.path, p)) {
        const remaining = slicePath(p, child.path.length);
        if (child.deleteKey(remaining)) {
          deleted = true;
          if (child.isNull()) {
            child.parent = null;
            this.children.splice(i, 1);
          }
        }
      }
    }
    return deleted;
  }

  public push<ValT = any>(target: Path | string, val?: ValT): Tree<ValT> {
    const p = target instanceof Path ? target : new Path(target);
    this.deleteKey(p);
    const node = new Tree<ValT>(p, val);
    node.parent = this;
    this.children.push(node);
    return node;
  }

  public queryAll(target: Path | string, strict: boolean = true): Tree<any>[] {
    const p = target instanceof Path ? target : new Path(target);
    const out: Tree<any>[] = [];

    const collect = (node: Tree<any>) => {
      for (const child of node.children) {
        if (p.common(child.path) || (!strict && isPrefixOf(child.path, p))) {
          out.push(child);
        }
        collect(child);
      }
    };

    collect(this);
    return out;
  }

  public query(target: Path | string, strict: boolean = true): Tree<any> | null {
    const res = this.queryAll(target, strict);
    if (res.length === 0) return null;

    const p = target instanceof Path ? target : new Path(target);
    for (const node of res) {
      if (node.path.equals(p)) return node;
    }

    let bestIdx = 0;
    let bestScore = -1;
    for (let i = 0; i < res.length; ++i) {
      let score = 0;
      for (let k = 0; k < res[i].path.length; ++k) {
        const pt = res[i].path[k];
        if (pt !== "*" && pt !== "**" && pt.length > 0) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    return res[bestIdx];
  }

  public clone(): Tree<T> {
    const n = new Tree<T>(this.path, this.value);
    n._hasValue = this._hasValue;
    for (const child of this.children) {
      const c = child.clone();
      c.parent = n;
      n.children.push(c);
    }
    return n;
  }

  // --- Binary Serialization (matches Ksee::Tree binary protocol) ---

  public toBinary(): Uint8Array {
    const buf: number[] = [0x54, 0x01]; // 'T', version 1
    this.serializeNode(this, buf);
    return new Uint8Array(buf);
  }

  protected serializeNode(node: Tree<any>, buf: number[]): void {
    // 1. Path
    const pStr = node.path.toString();
    const pBytes = textEncoder.encode(pStr);
    encodeVarLong(buf, pBytes.length);
    for (let i = 0; i < pBytes.length; ++i) buf.push(pBytes[i]);

    // 2. Value type and value
    if (typeof node.value === "string") {
      buf.push(1); // String
      const valBytes = textEncoder.encode(node.value);
      encodeVarLong(buf, valBytes.length);
      for (let i = 0; i < valBytes.length; ++i) buf.push(valBytes[i]);
    } else if (typeof node.value === "boolean") {
      buf.push(2); // Bool
      buf.push(node.value ? 1 : 0);
    } else if (typeof node.value === "number") {
      if (Number.isInteger(node.value)) {
        buf.push(3); // Int64 (ZigZag)
        const v = BigInt(node.value);
        const zz = v >= 0n ? (v << 1n) : ((~v << 1n) | 1n);
        encodeVarLong(buf, zz);
      } else {
        buf.push(4); // Float64
        const view = new DataView(new ArrayBuffer(8));
        view.setFloat64(0, node.value, true); // Little endian
        for (let i = 0; i < 8; ++i) buf.push(view.getUint8(i));
      }
    } else if (typeof node.value === "bigint") {
      buf.push(3); // Int64
      const v = node.value;
      const zz = v >= 0n ? (v << 1n) : ((~v << 1n) | 1n);
      encodeVarLong(buf, zz);
    } else {
      buf.push(0); // Void
    }

    // 3. Children (sorted deterministically)
    const sorted = [...node.children].sort((a, b) => {
      const pa = a.path.toString();
      const pb = b.path.toString();
      if (pa !== pb) return pa.localeCompare(pb);
      return a.asString().localeCompare(b.asString());
    });

    encodeVarLong(buf, sorted.length);
    for (const child of sorted) {
      this.serializeNode(child, buf);
    }
  }

  public readFromBinary(data: Uint8Array, bytesOffset: number = 0): { success: boolean; bytesRead: number } {
    if (!data || data.length - bytesOffset < 2) return { success: false, bytesRead: 0 };
    if (data[bytesOffset] !== 0x54 || data[bytesOffset + 1] !== 0x01) {
      return { success: false, bytesRead: 0 };
    }

    const ptr = { offset: bytesOffset + 2 };
    const decodedRoot = this.deserializeNode(data, ptr);
    if (!decodedRoot) return { success: false, bytesRead: 0 };

    this.clear();
    this.path = decodedRoot.path;
    this.value = decodedRoot.value;
    this._hasValue = decodedRoot._hasValue;
    for (const ch of decodedRoot.children) {
      ch.parent = this;
      this.children.push(ch);
    }

    return { success: true, bytesRead: ptr.offset - bytesOffset };
  }

  protected deserializeNode(data: Uint8Array, ptr: { offset: number }): Tree<any> | null {
    // 1. Path
    const pathLenBig = decodeVarLong(data, ptr);
    if (pathLenBig === null) return null;
    const pathLen = Number(pathLenBig);
    if (ptr.offset + pathLen > data.length) return null;
    const pStr = textDecoder.decode(data.subarray(ptr.offset, ptr.offset + pathLen));
    ptr.offset += pathLen;
    const nodePath = new Path(pStr);

    // 2. Value type and value
    if (ptr.offset >= data.length) return null;
    const tag = data[ptr.offset++];
    let node: Tree<any>;

    if (tag === 1) {
      const strLenBig = decodeVarLong(data, ptr);
      if (strLenBig === null) return null;
      const strLen = Number(strLenBig);
      if (ptr.offset + strLen > data.length) return null;
      const val = textDecoder.decode(data.subarray(ptr.offset, ptr.offset + strLen));
      ptr.offset += strLen;
      node = new Tree(nodePath, val);
    } else if (tag === 2) {
      if (ptr.offset >= data.length) return null;
      const b = data[ptr.offset++] !== 0;
      node = new Tree(nodePath, b);
    } else if (tag === 3) {
      const zz = decodeVarLong(data, ptr);
      if (zz === null) return null;
      const v = (zz & 1n) ? ~(zz >> 1n) : (zz >> 1n);
      node = new Tree(nodePath, Number(v));
    } else if (tag === 4) {
      if (ptr.offset + 8 > data.length) return null;
      const view = new DataView(data.buffer, data.byteOffset + ptr.offset, 8);
      const f = view.getFloat64(0, true);
      ptr.offset += 8;
      node = new Tree(nodePath, f);
    } else {
      node = new Tree(nodePath);
    }

    // 3. Children
    const childCountBig = decodeVarLong(data, ptr);
    if (childCountBig === null) return null;
    const childCount = Number(childCountBig);
    for (let i = 0; i < childCount; ++i) {
      const child = this.deserializeNode(data, ptr);
      if (!child) return null;
      child.parent = node;
      node.children.push(child);
    }

    return node;
  }

  public toString(): string {
    const payload = this.toBinary();
    const lenBuf: number[] = [];
    encodeVarLong(lenBuf, payload.length);
    const combined = new Uint8Array(lenBuf.length + payload.length);
    combined.set(new Uint8Array(lenBuf), 0);
    combined.set(payload, lenBuf.length);

    // Return binary string representation compatible with standard Tree::toString
    let str = "";
    for (let i = 0; i < combined.length; ++i) {
      str += String.fromCharCode(combined[i]);
    }
    return str;
  }

  public static parse(data: Uint8Array | string): Tree<any> {
    const bytes = typeof data === "string"
      ? new Uint8Array(Array.from(data, (c) => c.charCodeAt(0)))
      : data;

    const t = new Tree();
    if (!bytes || bytes.length === 0) return t;

    const ptr = { offset: 0 };
    const payloadLenBig = decodeVarLong(bytes, ptr);
    if (payloadLenBig === null) return t;

    t.readFromBinary(bytes, ptr.offset);
    return t;
  }

  public static parseMany(data: Uint8Array | string): Tree<any>[] {
    const bytes = typeof data === "string"
      ? new Uint8Array(Array.from(data, (c) => c.charCodeAt(0)))
      : data;

    const list: Tree<any>[] = [];
    let offset = 0;
    while (offset < bytes.length) {
      const ptr = { offset };
      const payloadLenBig = decodeVarLong(bytes, ptr);
      if (payloadLenBig === null) break;
      const payloadLen = Number(payloadLenBig);
      const nextOffset = ptr.offset + payloadLen;
      if (nextOffset > bytes.length) break;

      const t = new Tree();
      const res = t.readFromBinary(bytes, ptr.offset);
      if (res.success) {
        list.push(t);
      } else {
        break;
      }
      offset = nextOffset;
    }
    return list;
  }
}
