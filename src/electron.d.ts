interface Window {
  electronAPI?: {
    platform?: string;
    sqlite?: {
      all: (profileId: string, table: string) => Promise<any[]>;
      get: (profileId: string, table: string, id: number) => Promise<any | undefined>;
      put: (profileId: string, table: string, row: any) => Promise<void>;
      remove: (profileId: string, table: string, id: number) => Promise<void>;
      addPending: (profileId: string, change: any) => Promise<void>;
      getPending: (profileId: string) => Promise<any[]>;
      clearPending: (profileId: string, id: number) => Promise<void>;
      getMeta: (profileId: string, key: string) => Promise<string | null>;
      setMeta: (profileId: string, key: string, value: string) => Promise<void>;
      replaceAll: (profileId: string, table: string, rows: any[]) => Promise<void>;
      updatePending: (profileId: string, pendingChange: any) => Promise<void>;
    };
  };
}
