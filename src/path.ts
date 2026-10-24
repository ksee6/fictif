// src/path.ts

// ---------------------------------------------------------------------------
// IPv4 and IPv6 Data Structures
// ---------------------------------------------------------------------------

export class IPv4 {
  public octets: Uint8Array = new Uint8Array(4);

  constructor(a: number = 0, b: number = 0, c: number = 0, d: number = 0) {
    this.octets[0] = a & 0xff;
    this.octets[1] = b & 0xff;
    this.octets[2] = c & 0xff;
    this.octets[3] = d & 0xff;
  }

  get [0](): number { return this.octets[0]; }
  set [0](v: number) { this.octets[0] = v & 0xff; }
  get [1](): number { return this.octets[1]; }
  set [1](v: number) { this.octets[1] = v & 0xff; }
  get [2](): number { return this.octets[2]; }
  set [2](v: number) { this.octets[2] = v & 0xff; }
  get [3](): number { return this.octets[3]; }
  set [3](v: number) { this.octets[3] = v & 0xff; }
  get a(): number { return this.octets[0]; }
  set a(v: number) { this.octets[0] = v & 0xff; }
  get b(): number { return this.octets[1]; }
  set b(v: number) { this.octets[1] = v & 0xff; }
  get c(): number { return this.octets[2]; }
  set c(v: number) { this.octets[2] = v & 0xff; }
  get d(): number { return this.octets[3]; }
  set d(v: number) { this.octets[3] = v & 0xff; }


  public toString(): string {
    return `${this.octets[0]}.${this.octets[1]}.${this.octets[2]}.${this.octets[3]}`;
  }

  public equals(other: IPv4): boolean {
    return (
      this.octets[0] === other.octets[0] &&
      this.octets[1] === other.octets[1] &&
      this.octets[2] === other.octets[2] &&
      this.octets[3] === other.octets[3]
    );
  }
}

export class IPv6 {
  public bytes: Uint8Array = new Uint8Array(16);

  constructor(init?: Uint8Array | number[]) {
    if (init) {
      for (let i = 0; i < 16 && i < init.length; ++i) {
        this.bytes[i] = init[i] & 0xff;
      }
    }
  }

  get [0](): number { return this.bytes[0]; }
  get [1](): number { return this.bytes[1]; }
  get [2](): number { return this.bytes[2]; }
  get [3](): number { return this.bytes[3]; }
  get [4](): number { return this.bytes[4]; }
  get [5](): number { return this.bytes[5]; }
  get [6](): number { return this.bytes[6]; }
  get [7](): number { return this.bytes[7]; }
  get [8](): number { return this.bytes[8]; }
  get [9](): number { return this.bytes[9]; }
  get [10](): number { return this.bytes[10]; }
  get [11](): number { return this.bytes[11]; }
  get [12](): number { return this.bytes[12]; }
  get [13](): number { return this.bytes[13]; }
  get [14](): number { return this.bytes[14]; }
  get [15](): number { return this.bytes[15]; }

  public toString(): string {
    const parts: string[] = [];
    for (let i = 0; i < 16; i += 2) {
      const part = (this.bytes[i] << 8) | this.bytes[i + 1];
      parts.push(part.toString(16));
    }
    return `[${parts.join(":")}]`;
  }

  public equals(other: IPv6): boolean {
    for (let i = 0; i < 16; ++i) {
      if (this.bytes[i] !== other.bytes[i]) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Numpath (formerly NumericalPath) — Represents network segments as u32 values
// ---------------------------------------------------------------------------

export class Numpath extends Array<number> {
  public static readonly Back: Numpath = new Numpath([0, 1]);

  constructor(input?: string | number[] | Numpath | Path) {
    super();
    if (input === undefined) return;

    if (input instanceof Numpath || Array.isArray(input)) {
      for (const val of input) {
        this.push(typeof val === "number" ? val : parseInt(String(val), 10) || 0);
      }
      return;
    }

    const obj: any = input;
    if (obj instanceof Path) {
      if (obj.isHalt()) {
        this.push(0xffffffff);
        return;
      }
      for (let i = 0; i < obj.length; i++) {
        const n = parseInt(obj[i], 10);
        this.push(isNaN(n) ? 0 : n);
      }
      return;
    }

    this.resolve(String(input));
  }

  private resolve(str: string): void {
    const trimmed = str.trim();
    if (trimmed === "") return;
    if (trimmed === "halt" || trimmed === "4294967295") {
      this.push(0xffffffff);
      return;
    }

    // Comma-separated segments
    if (trimmed.includes(",")) {
      const parts = trimmed.split(",");
      for (const part of parts) {
        this.push(parseInt(part.trim(), 10) || 0);
      }
      return;
    }

    // Bracketed IPv6 notation
    if (trimmed.startsWith("[")) {
      const cb = trimmed.indexOf("]");
      if (cb === -1) return;
      const body = trimmed.substring(1, cb);
      this.push(6); // IPv6 marker
      this._parseIPv6Body(body);
      if (cb + 2 < trimmed.length && trimmed[cb + 1] === ":") {
        this.push(parseInt(trimmed.substring(cb + 2), 10) || 0);
      }
      return;
    }

    const colonCount = (trimmed.match(/:/g) || []).length;

    // IPv6 (2+ colons)
    if (colonCount >= 2) {
      this.push(6); // IPv6 marker
      this._parseIPv6Body(trimmed);
      return;
    }

    // IPv4 with optional port
    let host = trimmed;
    let portStr = "";
    if (colonCount === 1) {
      const ci = trimmed.indexOf(":");
      host = trimmed.substring(0, ci);
      portStr = trimmed.substring(ci + 1);
    }

    const octets = host.split(".");
    if (octets.length === 4) {
      let allNum = true;
      for (const oct of octets) {
        if (!/^\d+$/.test(oct)) allNum = false;
      }
      if (allNum) {
        this.push(4); // IPv4 marker
        for (const oct of octets) {
          this.push(parseInt(oct, 10) || 0);
        }
        if (portStr !== "") {
          this.push(parseInt(portStr, 10) || 0);
        }
        return;
      }
    } else if (octets.length === 5 && (octets[0] === "4" || octets[0] === "14")) {
      let allNum = true;
      for (let i = 1; i < 5; i++) {
        if (!/^\d+$/.test(octets[i])) allNum = false;
      }
      if (allNum) {
        this.push(parseInt(octets[0], 10)); // 4 or 14
        for (let i = 1; i < 5; i++) {
          this.push(parseInt(octets[i], 10) || 0);
        }
        if (portStr !== "") {
          this.push(parseInt(portStr, 10) || 0);
        }
        return;
      }
    }

    // Fallback dotted segments
    for (const part of octets) {
      this.push(parseInt(part, 10) || 0);
    }
    if (portStr !== "") {
      this.push(parseInt(portStr, 10) || 0);
    }
  }

  private _parseIPv6Body(str: string): void {
    const dc = str.indexOf("::");
    if (dc !== -1) {
      const before = str.substring(0, dc);
      const after = str.substring(dc + 2);

      const bSegs: number[] = [];
      const aSegs: number[] = [];

      if (before !== "") {
        const p = before.split(":");
        for (const seg of p) bSegs.push(parseInt(seg, 16) || 0);
      }
      if (after !== "") {
        const p = after.split(":");
        for (const seg of p) aSegs.push(parseInt(seg, 16) || 0);
      }

      const zeros = 8 - bSegs.length - aSegs.length;
      for (const seg of bSegs) this.push(seg);
      for (let i = 0; i < zeros; i++) this.push(0);
      for (const seg of aSegs) this.push(seg);
    } else {
      const p = str.split(":");
      for (const seg of p) {
        this.push(parseInt(seg, 16) || 0);
      }
    }
  }

  public isHalt(): boolean {
    return this.length > 0 && this[0] === 0xffffffff;
  }

  public isIPv4(): boolean {
    return this.length > 0 && (this[0] === 4 || this[0] === 14);
  }

  public isIPv6(): boolean {
    return this.length > 0 && (this[0] === 6 || this[0] === 16);
  }

  public isIpv4(): boolean {
    return this.isIPv4();
  }

  public isIpv6(): boolean {
    return this.isIPv6();
  }

  public isBack(): boolean {
    return this.length >= 2 && this[0] === 0 && this[1] === 1;
  }

  public ipv4(): IPv4 {
    const res = new IPv4();
    if (this.isIpv4() && this.length >= 5) {
      res[0] = this[1];
      res[1] = this[2];
      res[2] = this[3];
      res[3] = this[4];
    }
    return res;
  }

  public ipv6(): IPv6 {
    const res = new IPv6();
    if (this.isIpv6() && this.length >= 9) {
      for (let i = 0; i < 8; ++i) {
        const part = this[1 + i];
        res.bytes[i * 2] = (part >> 8) & 0xff;
        res.bytes[i * 2 + 1] = part & 0xff;
      }
    }
    return res;
  }

  public port(): number {
    if (this.isIpv4()) return this.length >= 6 ? this[5] : 0;
    if (this.isIpv6()) return this.length >= 10 ? this[9] : 0;
    return 0;
  }

  public back(): void {
    this.length = 0;
    this.push(0);
    this.push(1);
  }

  public set(input: string | number[] | Numpath): void {
    this.length = 0;
    const temp = new Numpath(input as any);
    for (const v of temp) this.push(v);
  }

  public common(other: Numpath | Path): Numpath {
    if (other instanceof Path) {
      const p = new Path(this).common(other);
      return new Numpath(p);
    }
    const res = new Numpath();
    const minLen = Math.min(this.length, other.length);
    for (let i = 0; i < minLen; i++) {
      if (this[i] === other[i]) {
        res.push(this[i]);
      } else {
        break;
      }
    }
    return res;
  }

  public equals(other: Numpath): boolean {
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i++) {
      if (this[i] !== other[i]) return false;
    }
    return true;
  }

  public toString(): string {
    if (this.length === 0) return "";
    if (this.isIpv4()) {
      if (this.length < 5) return "";
      let res = `${this[1]}.${this[2]}.${this[3]}.${this[4]}`;
      if (this.length >= 6) res += `:${this[5]}`;
      return res;
    }
    if (this.isIpv6()) {
      if (this.length < 9) return "";
      let res = "[";
      for (let i = 1; i <= 8; i++) {
        if (i > 1) res += ":";
        res += this[i].toString(16);
      }
      res += "]";
      if (this.length >= 10) res += `:${this[9]}`;
      return res;
    }
    return this.join(",");
  }
}

// ---------------------------------------------------------------------------
// Path Pattern Matching Helpers
// ---------------------------------------------------------------------------

function matchSingleSegment(seg: string, pat: string): boolean {
  if (pat === "*") return true;
  if (seg.toLowerCase() === pat.toLowerCase()) return true;
  if (pat.includes("*")) {
    const escaped = pat.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`, "i").test(seg);
  }
  return false;
}

function matchPathSegments(pathSegs: string[], patSegs: string[], pIdx = 0, patIdx = 0): boolean {
  if (patIdx === patSegs.length) {
    return pIdx === pathSegs.length;
  }

  const pat = patSegs[patIdx];

  if (pat === "**") {
    // If ** is at the end of pattern and preceded by segments (e.g. "somewhere/**"),
    // it requires at least 1 segment after ("all levels after somewhere").
    // If ** is the sole pattern (e.g. "**"), it matches all views (minSkip = 0).
    const isTrailingAfterPrefix = patIdx > 0 && patIdx === patSegs.length - 1;
    const minSkip = isTrailingAfterPrefix ? 1 : 0;

    for (let skip = minSkip; pIdx + skip <= pathSegs.length; skip++) {
      if (matchPathSegments(pathSegs, patSegs, pIdx + skip, patIdx + 1)) {
        return true;
      }
    }
    return false;
  }

  if (pIdx === pathSegs.length) {
    return false;
  }

  const seg = pathSegs[pIdx];
  if (matchSingleSegment(seg, pat)) {
    return matchPathSegments(pathSegs, patSegs, pIdx + 1, patIdx + 1);
  }

  return false;
}

// ---------------------------------------------------------------------------
// Path — Unified Route/Address Path Class
// ---------------------------------------------------------------------------

export class Path extends Array<string> {
  public static readonly Back: Path = new Path(["0", "1"]);

  constructor(input?: string | string[] | Path | Numpath) {
    super();
    if (input === undefined) return;

    if (input instanceof Numpath) {
      for (const val of input) {
        this.push(val.toString());
      }
      return;
    }

    if (input instanceof Path || Array.isArray(input)) {
      for (const val of input) this.push(String(val));
      return;
    }

    this.resolve(String(input));
  }

  public isBack(): boolean {
    return this.length >= 2 && this[0] === "0" && this[1] === "1";
  }

  public isIPv4(): boolean {
    return this.length > 0 && (this[0] === "4" || this[0] === "14");
  }

  public isIPv6(): boolean {
    return this.length > 0 && (this[0] === "6" || this[0] === "16");
  }

  public isIpv4(): boolean {
    return this.isIPv4();
  }

  public isIpv6(): boolean {
    return this.isIPv6();
  }

  public isHttp(): boolean {
    return this.length > 0 && (this[0] === "5" || this[0] === "1");
  }

  public isHalt(): boolean {
    return this.length > 0 && (this[0] === "7" && this[1] === "halt" || this[0] === "halt");
  }

  public isNumerical(): boolean {
    if (this.length === 0) return false;
    for (let i = 0; i < this.length; ++i) {
      if (!/^\d+$/.test(this[i])) return false;
    }
    return true;
  }

  public back(): void {
    this.length = 0;
    this.push("0");
    this.push("1");
  }

  public set(input: string | string[] | Path | Numpath): void {
    this.length = 0;
    if (input instanceof Numpath) {
      for (const v of input) this.push(v.toString());
    } else if (input instanceof Path || Array.isArray(input)) {
      for (const v of input) this.push(String(v));
    } else {
      this.resolve(String(input));
    }
  }

  public toNumerical(): Numpath {
    const np = new Numpath();
    for (let i = 0; i < this.length; ++i) {
      np.push(parseInt(this[i], 10) || 0);
    }
    return np;
  }

  public segments(): string[] {
    if (this.isHttp()) {
      return this._getSoftItems();
    }
    return Array.from(this);
  }

  // --- Internal Offset Helpers for HTTP Format (Marker 5) ---
  _hardCountOffset() { return 2; }
  _hardStartOffset() { return 3; }
  _hardCount() { return parseInt(this[this._hardCountOffset()], 10) || 0; }
  _softCountOffset() { return 3 + this._hardCount(); }
  _softStartOffset() { return 3 + this._hardCount() + 1; }
  _softCount() { return parseInt(this[this._softCountOffset()], 10) || 0; }
  _metadataStartOffset() { return 3 + this._hardCount() + 1 + this._softCount(); }
  _hashtagOffset() { return this._metadataStartOffset(); }
  _queryStartOffset() { return this._metadataStartOffset() + 1; }

  public _getHardItems(): string[] {
    const res: string[] = [];
    if (this.length === 0 || this[0] !== "5") return res;
    const hc = this._hardCount();
    const hs = this._hardStartOffset();
    for (let i = 0; i < hc; ++i) res.push(this[hs + i]);
    return res;
  }

  public _getSoftItems(): string[] {
    const res: string[] = [];
    if (this.length === 0 || this[0] !== "5") return res;
    const sc = this._softCount();
    const ss = this._softStartOffset();
    for (let i = 0; i < sc; ++i) res.push(this[ss + i]);
    return res;
  }

  public _getQueryItems(): string[] {
    const res: string[] = [];
    if (this.length === 0 || this[0] !== "5") return res;
    const qs = this._queryStartOffset();
    for (let i = qs; i < this.length; ++i) res.push(this[i]);
    return res;
  }

  private _rebuild(
    newHard: string[],
    newSoft: string[],
    newHash: string,
    newQueries: string[],
  ): void {
    const m = this.method() || "get";
    this.length = 0;
    this.push("5");
    this.push(m);
    this.push(String(newHard.length));
    for (const h of newHard) this.push(h);
    this.push(String(newSoft.length));
    for (const s of newSoft) this.push(s);
    this.push(newHash);
    for (const q of newQueries) this.push(q);
  }

  // --- Protocol / Method ---
  public protocol(): string {
    if (this.length === 0 || this[0] !== "5") return "";
    const m = this.method();
    const p = this.port();
    if ((m === "get" || m === "put" || m === "delete") && p === 80) return "http";
    return "https";
  }

  public method(m?: string): string {
    if (m !== undefined) {
      if (this.length === 0 || this[0] !== "5") {
        const existingSoft = Array.from(this);
        this.length = 0;
        this.push("5");
        this.push(m.toLowerCase());
        this.push("0");
        this.push(String(existingSoft.length));
        for (const s of existingSoft) this.push(s);
        this.push("");
        return m.toLowerCase();
      }
      if (this.length > 1 && this[0] === "5") {
        this[1] = m.toLowerCase();
      }
      return this[1];
    }
    if (this.length > 1 && this[0] === "5") return this[1];
    return "";
  }

  // --- Host / Port ---
  public host(h?: string): string {
    if (h !== undefined) {
      this.hostname(h);
      return h;
    }
    return this.hostname();
  }

  public hasHostname(): boolean {
    if (this.length === 0 || this[0] !== "5") return false;
    return this._hardCount() > 0;
  }

  public hostname(h?: string): string {
    if (h !== undefined) {
      if (this.length === 0 || this[0] !== "5") {
        const existingSoft = Array.from(this);
        this.length = 0;
        this.push("5");
        this.push("get");
        this.push("0");
        this.push(String(existingSoft.length));
        for (const s of existingSoft) this.push(s);
        this.push("");
      }
      let hostName = h;
      let portVal = "";
      if (h.includes(":")) {
        const ci = h.indexOf(":");
        hostName = h.substring(0, ci);
        portVal = h.substring(ci + 1);
      }
      const domainSegs = hostName.split(".");
      const newHard: string[] = [];
      for (let i = domainSegs.length - 1; i >= 0; --i) {
        newHard.push(domainSegs[i]);
      }
      const prt = portVal !== "" ? parseInt(portVal, 10) : this.port();
      if (prt !== 0) newHard.push(String(prt));
      this._rebuild(newHard, this._getSoftItems(), this.hashtag(), this._getQueryItems());
      return h;
    }

    if (this.length === 0) return "";
    if (this[0] === "4") {
      let res = `${this[1]}.${this[2]}.${this[3]}.${this[4]}`;
      if (this.length >= 6) res += `:${this[5]}`;
      return res;
    }
    if (this[0] === "6") {
      let res = "[";
      for (let i = 1; i <= 8; i++) {
        if (i > 1) res += ":";
        res += this[i];
      }
      res += "]";
      if (this.length >= 10) res += `:${this[9]}`;
      return res;
    }
    if (this[0] === "5") {
      const hc = this._hardCount();
      const hs = this._hardStartOffset();
      const domainParts: string[] = [];
      let port = "";
      for (let i = 0; i < hc; ++i) {
        const item = this[hs + i];
        if (item.startsWith("usr:") || item.startsWith("pwd:")) continue;
        if (/^\d+$/.test(item)) {
          port = item;
        } else {
          domainParts.unshift(item);
        }
      }
      let res = domainParts.join(".");
      if (port) res += `:${port}`;
      return res;
    }
    return this[0] || "";
  }

  public hashtag(h?: string): string {
    if (h !== undefined) {
      if (this.length > 0 && this[0] === "5") {
        this[this._hashtagOffset()] = h;
      }
      return h;
    }
    if (this.length === 0 || this[0] !== "5") return "";
    return this[this._hashtagOffset()] || "";
  }

  public port(): number {
    if (this.length === 0) return 0;
    if (this[0] === "4") return this.length >= 6 ? parseInt(this[5], 10) || 0 : 0;
    if (this[0] === "6") return this.length >= 10 ? parseInt(this[9], 10) || 0 : 0;
    if (this[0] === "5") {
      const hc = this._hardCount();
      const hs = this._hardStartOffset();
      if (hc > 0) {
        const last = this[hs + hc - 1];
        if (/^\d+$/.test(last)) return parseInt(last, 10) || 0;
      }
      return this.method() === "https" ? 443 : 80;
    }
    return 0;
  }

  public ipv4(): IPv4 {
    const res = new IPv4();
    if (this.isIpv4() && this.length >= 5) {
      res[0] = parseInt(this[1], 10) || 0;
      res[1] = parseInt(this[2], 10) || 0;
      res[2] = parseInt(this[3], 10) || 0;
      res[3] = parseInt(this[4], 10) || 0;
    }
    return res;
  }

  public ipv6(): IPv6 {
    const res = new IPv6();
    if (this.isIpv6() && this.length >= 9) {
      for (let i = 1; i <= 8; ++i) {
        const part = parseInt(this[i], 16) || 0;
        res.bytes[(i - 1) * 2] = (part >> 8) & 0xff;
        res.bytes[(i - 1) * 2 + 1] = part & 0xff;
      }
    }
    return res;
  }

  // --- Query Parameters ---
  public query(key: string, value?: string): string {
    if (value !== undefined) {
      if (this.length === 0 || this[0] !== "5") {
        const existingSoft = Array.from(this);
        this.length = 0;
        this.push("5");
        this.push("get");
        this.push("0");
        this.push(String(existingSoft.length));
        for (const s of existingSoft) this.push(s);
        this.push("");
      }
      const newQueries = this._getQueryItems();
      let found = false;
      for (let i = 0; i + 1 < newQueries.length; i += 2) {
        if (newQueries[i] === key) {
          newQueries[i + 1] = value;
          found = true;
          break;
        }
      }
      if (!found) {
        newQueries.push(key);
        newQueries.push(value);
      }
      this._rebuild(this._getHardItems(), this._getSoftItems(), this.hashtag(), newQueries);
      return value;
    }

    if (this.length === 0 || this[0] !== "5") return "";
    const qs = this._queryStartOffset();
    for (let i = qs; i + 1 < this.length; i += 2) {
      if (this[i] === key) return this[i + 1];
    }
    return "";
  }

  // --- Common Prefix Matching ---
  public common(other: Path | Numpath): Path {
    const otherPath = other instanceof Path ? other : new Path(other);
    const thisHttp = this.isHttp();
    const otherHttp = otherPath.isHttp();

    if (thisHttp && otherHttp) {
      const h1 = this._getHardItems();
      const h2 = otherPath._getHardItems();
      const commonHard: string[] = [];
      const minH = Math.min(h1.length, h2.length);
      for (let i = 0; i < minH; ++i) {
        if (h1[i] === h2[i]) commonHard.push(h1[i]);
        else break;
      }

      const s1 = this._getSoftItems();
      const s2 = otherPath._getSoftItems();
      const commonSoft: string[] = [];
      const minS = Math.min(s1.length, s2.length);
      for (let i = 0; i < minS; ++i) {
        if (s1[i] === s2[i]) commonSoft.push(s1[i]);
        else break;
      }

      const q1 = this._getQueryItems();
      const q2 = otherPath._getQueryItems();
      const mergedQ = [...q1];
      for (let j = 0; j + 1 < q2.length; j += 2) {
        const k = q2[j];
        const v = q2[j + 1];
        let found = false;
        for (let i = 0; i + 1 < mergedQ.length; i += 2) {
          if (mergedQ[i] === k) {
            found = true;
            break;
          }
        }
        if (!found) {
          mergedQ.push(k);
          mergedQ.push(v);
        }
      }

      const res = new Path();
      res.push("5");
      res.push(this.method() || otherPath.method() || "get");
      res.push(String(commonHard.length));
      for (const h of commonHard) res.push(h);
      res.push(String(commonSoft.length));
      for (const s of commonSoft) res.push(s);
      res.push(this.hashtag() || otherPath.hashtag() || "");
      for (const q of mergedQ) res.push(q);
      return res;
    }

    if (thisHttp && !otherHttp) {
      const s1 = this._getSoftItems();
      const commonSoft: string[] = [];
      const minS = Math.min(s1.length, otherPath.length);
      for (let i = 0; i < minS; ++i) {
        if (s1[i] === otherPath[i]) commonSoft.push(s1[i]);
        else break;
      }
      const res = new Path();
      for (const s of commonSoft) res.push(s);
      return res;
    }

    if (!thisHttp && otherHttp) {
      const s2 = otherPath._getSoftItems();
      const commonSoft: string[] = [];
      const minS = Math.min(this.length, s2.length);
      for (let i = 0; i < minS; ++i) {
        if (this[i] === s2[i]) commonSoft.push(this[i]);
        else break;
      }
      const res = new Path();
      for (const s of commonSoft) res.push(s);
      return res;
    }

    const res = new Path();
    const minLen = Math.min(this.length, otherPath.length);
    for (let i = 0; i < minLen; ++i) {
      if (this[i] === otherPath[i]) res.push(this[i]);
      else break;
    }
    return res;
  }

  public equals(other: Path | string): boolean {
    const o = other instanceof Path ? other : new Path(other);
    if (this.length !== o.length) return false;
    for (let i = 0; i < this.length; ++i) {
      if (this[i] !== o[i]) return false;
    }
    return true;
  }

  /**
   * Tests whether this path matches a given path pattern.
   * Supports `*` (single segment wildcard) and `**` (multi-segment wildcard).
   *
   * Examples:
   *   new Path("foo").matches("*") // true (one level)
   *   new Path("foo/bar").matches("*") // false
   *   new Path("foo/bar").matches("**") // true (all levels)
   *   new Path("somewhere/foo/bar").matches("somewhere/**") // true (levels after somewhere)
   */
  public matches(pattern: Path | string): boolean {
    const patPath = pattern instanceof Path ? pattern : new Path(pattern);
    const pathSegs = this.segments();
    const patSegs = patPath.segments();

    return matchPathSegments(pathSegs, patSegs, 0, 0);
  }

  public match(pattern: Path | string): boolean {
    return this.matches(pattern);
  }

  public static matches(path: Path | string, pattern: Path | string): boolean {
    const p = path instanceof Path ? path : new Path(path);
    return p.matches(pattern);
  }

  public resolve(raw: string): void {
    if (!raw) return;

    const protoIdx = raw.indexOf("://");
    const spaceIdx = raw.indexOf(" ");
    const isProto = protoIdx !== -1;

    if (isProto) {
      this.push("5"); // Protocol marker
      let methodVal = "get";
      let urlPart = raw;

      if (spaceIdx !== -1 && spaceIdx < protoIdx) {
        methodVal = raw.substring(0, spaceIdx).trim().toLowerCase();
        urlPart = raw.substring(spaceIdx + 1).trim();
      }
      this.push(methodVal);

      const curProtoIdx = urlPart.indexOf("://");
      const rest = urlPart.substring(curProtoIdx + 3);
      const qIdx = rest.indexOf("?");
      const hIdx = rest.indexOf("#");

      let hostAndPath = rest;
      let queryPart = "";
      let hashPart = "";

      if (hIdx !== -1) {
        hashPart = rest.substring(hIdx + 1);
        hostAndPath = rest.substring(0, hIdx);
      }
      if (qIdx !== -1) {
        if (!(hIdx !== -1 && qIdx > hIdx)) {
          queryPart = hostAndPath.substring(qIdx + 1);
          hostAndPath = hostAndPath.substring(0, qIdx);
        }
      }

      const slashIdx = hostAndPath.indexOf("/");
      let hostPart = hostAndPath;
      let pathPart = "";
      if (slashIdx !== -1) {
        hostPart = hostAndPath.substring(0, slashIdx);
        pathPart = hostAndPath.substring(slashIdx);
      }

      const atIdx = hostPart.indexOf("@");
      let credsPart = "";
      let realHost = hostPart;
      if (atIdx !== -1) {
        credsPart = hostPart.substring(0, atIdx);
        realHost = hostPart.substring(atIdx + 1);
      }

      const colonIdx = realHost.indexOf(":");
      let hostName = realHost;
      let portVal = "";
      if (colonIdx !== -1) {
        hostName = realHost.substring(0, colonIdx);
        portVal = realHost.substring(colonIdx + 1);
      }

      const hardItems: string[] = [];
      const domainSegs = hostName.split(".");
      for (let i = domainSegs.length - 1; i >= 0; --i) {
        hardItems.push(domainSegs[i]);
      }

      if (credsPart !== "") {
        const cIdx = credsPart.indexOf(":");
        let usr = credsPart;
        let pwd = "";
        if (cIdx !== -1) {
          usr = credsPart.substring(0, cIdx);
          pwd = credsPart.substring(cIdx + 1);
        }
        hardItems.push("usr:" + usr);
        if (cIdx !== -1) {
          hardItems.push("pwd:" + pwd);
        }
      }

      if (portVal !== "") {
        hardItems.push(portVal);
      }

      this.push(String(hardItems.length));
      for (const item of hardItems) this.push(item);

      const softItems: string[] = [];
      if (pathPart !== "") {
        const pathSegs = pathPart.split("/");
        for (const seg of pathSegs) {
          if (seg !== "" && seg !== ".") {
            if (seg === "..") {
              if (softItems.length > 0) softItems.pop();
            } else {
              softItems.push(seg);
            }
          }
        }
      }

      this.push(String(softItems.length));
      for (const item of softItems) this.push(item);

      this.push(hashPart); // hashtag slot

      if (queryPart !== "") {
        const pairs = queryPart.split("&");
        for (const pair of pairs) {
          const eq = pair.indexOf("=");
          if (eq !== -1) {
            this.push(pair.substring(0, eq));
            this.push(pair.substring(eq + 1));
          } else {
            this.push(pair);
            this.push("");
          }
        }
      }
      return;
    }

    // IPv4 dotted numeric
    let dotCount = 0;
    let colonCount = 0;
    let allNumeric = true;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === ".") dotCount++;
      else if (c === ":") colonCount++;
      else if (c < "0" || c > "9") allNumeric = false;
    }

    if ((dotCount === 3 || dotCount === 4) && colonCount <= 1 && allNumeric) {
      let host = raw;
      let portVal = "";
      if (colonCount === 1) {
        const ci = raw.indexOf(":");
        host = raw.substring(0, ci);
        portVal = raw.substring(ci + 1);
      }
      const octets = host.split(".");
      if (dotCount === 3 && octets.length === 4) {
        this.push("4");
        for (const oct of octets) this.push(oct);
        if (portVal !== "") this.push(portVal);
        return;
      } else if (dotCount === 4 && octets.length === 5 && (octets[0] === "4" || octets[0] === "14")) {
        this.push(octets[0]);
        for (let i = 1; i < 5; ++i) this.push(octets[i]);
        if (portVal !== "") this.push(portVal);
        return;
      }
    }

    // IPv6 address
    if (colonCount >= 2 && /^[0-9a-fA-F:\[\]]+$/.test(raw)) {
      this.push("6");
      let body = raw;
      let portStr = "";
      if (raw.startsWith("[")) {
        const cb = raw.indexOf("]");
        if (cb !== -1) {
          body = raw.substring(1, cb);
          if (cb + 2 < raw.length && raw[cb + 1] === ":") {
            portStr = raw.substring(cb + 2);
          }
        }
      }

      const dc = body.indexOf("::");
      if (dc !== -1) {
        const before = body.substring(0, dc);
        const after = body.substring(dc + 2);

        const bSegs = before !== "" ? before.split(":") : [];
        const aSegs = after !== "" ? after.split(":") : [];
        const zeros = 8 - bSegs.length - aSegs.length;

        for (const seg of bSegs) this.push(seg);
        for (let i = 0; i < zeros; i++) this.push("0");
        for (const seg of aSegs) this.push(seg);
      } else {
        const p = body.split(":");
        for (let i = 0; i < p.length && i < 8; i++) this.push(p[i]);
      }
      if (portStr !== "") this.push(portStr);
      return;
    }

    // Control Scheme
    if (raw === "//" || raw === "EMPTY" || raw === "halt") {
      this.push("7");
      this.push(raw);
      return;
    }

    // Route containing slashes
    if (raw.includes("/")) {
      const parts = raw.split("/");
      for (const part of parts) {
        if (part !== "") this.push(part);
      }
      return;
    }

    // Comma-separated general segments
    if (raw.includes(",")) {
      const parts = raw.split(",");
      for (const part of parts) this.push(part);
      return;
    }

    // Reversed dot-notation domain fallback
    if (raw.includes(".")) {
      const parts = raw.split(".");
      for (let i = parts.length - 1; i >= 0; --i) {
        this.push(parts[i]);
      }
      return;
    }

    this.push(raw);
  }

  public toString(): string {
    if (this.length === 0) return "";
    if (this[0] === "5") {
      const m = this.method();
      const hc = this._hardCount();
      const hs = this._hardStartOffset();

      const hostParts: string[] = [];
      let port = "";
      for (let i = 0; i < hc; ++i) {
        const item = this[hs + i];
        if (item.startsWith("usr:") || item.startsWith("pwd:")) continue;
        if (/^\d+$/.test(item)) {
          port = item;
        } else {
          hostParts.unshift(item);
        }
      }

      let res = "";
      if (hostParts.length > 0) {
        res += `${m.toUpperCase()} ://${hostParts.join(".")}`;
        if (port) res += `:${port}`;
      }

      const sc = this._softCount();
      const ss = this._softStartOffset();
      if (sc > 0) {
        const pathSegs: string[] = [];
        for (let i = 0; i < sc; ++i) pathSegs.push(this[ss + i]);
        res += "/" + pathSegs.join("/");
      } else if (!res) {
        res = "/";
      }

      const hash = this.hashtag();
      if (hash) res += `#${hash}`;

      const qs = this._queryStartOffset();
      if (qs < this.length) {
        const queryPairs: string[] = [];
        for (let i = qs; i < this.length; i += 2) {
          if (i + 1 < this.length) {
            queryPairs.push(`${this[i]}=${this[i + 1]}`);
          } else {
            queryPairs.push(this[i]);
          }
        }
        res += (res.includes("?") ? "&" : "?") + queryPairs.join("&");
      }
      return res;
    }
    return "/" + this.join("/");
  }
}

// Backwards compatibility aliases
export { Numpath as NumericalPath };
export { Path as RoutePath };
