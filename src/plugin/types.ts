import type { Plugin } from "vite";

export interface ViewAutoScanOptions {
  vendor?: boolean;
  packages?: boolean;
  node_modules?: boolean;
}

export type ViewNamespaceValue = string | string[];

export interface ViewOptions {
  namespaces?: Record<string, ViewNamespaceValue>;
  globNamespaces?: string[] | false;
}

export interface FictifOptions {
  views?: ViewOptions | false;
  /**
   * @deprecated Use `views` instead.
   */
  screens?: ViewOptions | false;
}

// Internal, fully resolved options
export type ResolvedFictifOptions = {
  root: string;
  views:
  | false
  | {
    namespaces: Record<string, ViewNamespaceValue>;
    globNamespaces: string[] | false;
  };
};

export interface StoredViewDigest {
  title: Record<string, number>;
  link: Record<string, number>;
  content: Record<string, number>;
}

export interface ViewDefinition {
  absolutePath: string;
  realAbsolutePath?: string;
  logicalName: string;
  obfuscatedId: string;
  namespace: string;
  head?: Record<string, any>;
  digest?: StoredViewDigest;
  isSymlink?: boolean;
  symlinkTarget?: string;
}

export type ViewManifest = Map<string, ViewDefinition>;

export type FictifPlugin = Plugin & {
  api: {
    getManifest: () => ViewManifest;
  };
};
