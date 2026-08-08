import { createContext, ReactNode, useContext, useMemo, useState } from "react";

export type Draft = {
  path: string;
  content: string;
  originalSha: string;
};

type DraftContextValue = {
  drafts: Record<string, Draft>;
  saveDraft: (repoKey: string, draft: Draft) => void;
  removeDraft: (repoKey: string, path: string) => void;
  clearDrafts: (repoKey: string) => void;
};

const DraftContext = createContext<DraftContextValue | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const value = useMemo<DraftContextValue>(() => ({
    drafts,
    saveDraft: (repoKey, draft) => setDrafts((current) => ({ ...current, [`${repoKey}:${draft.path}`]: draft })),
    removeDraft: (repoKey, path) => setDrafts((current) => {
      const next = { ...current };
      delete next[`${repoKey}:${path}`];
      return next;
    }),
    clearDrafts: (repoKey) => setDrafts((current) => {
      const next = { ...current };
      Object.keys(next).filter((key) => key.startsWith(`${repoKey}:`)).forEach((key) => delete next[key]);
      return next;
    }),
  }), [drafts]);

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

export function useDrafts() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("useDrafts must be used inside DraftProvider");
  return value;
}

export function repoKey(owner: string, name: string) {
  return `${owner}/${name}`;
}
