"use client";

import { useState } from "react";
import type { ScoredPaper } from "@/lib/reports/scoring";
import { PaperList } from "@/components/read/paper-list";
import { ChatPanel } from "@/components/read/chat-panel";

type Props = {
  papers: ScoredPaper[];
  paperStates: Record<string, { favorited: boolean; read: boolean }>;
  llmConfigured: boolean;
  totalPaperCount: number;
  hasCategories: boolean;
};

export function PaperReader({ papers, paperStates, llmConfigured, totalPaperCount, hasCategories }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    papers.length > 0 ? papers[0].arxivId : null
  );
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const selectedPaper = papers.find((p) => p.arxivId === selectedId) ?? null;

  function handleSelect(id: string) {
    setSelectedId(id);
    setMobileShowChat(true);
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] gap-4">
      <div
        className={`w-full flex-shrink-0 overflow-y-auto lg:w-1/3 ${
          mobileShowChat ? "hidden lg:block" : ""
        }`}
      >
        <PaperList
          papers={papers}
          selectedPaperId={selectedId}
          onSelect={handleSelect}
          paperStates={paperStates}
          totalPaperCount={totalPaperCount}
          hasCategories={hasCategories}
        />
      </div>

      <div
        className={`min-w-0 flex-col lg:flex lg:w-2/3 ${
          mobileShowChat ? "flex" : "hidden lg:flex"
        }`}
      >
        {selectedPaper ? (
          <ChatPanel
            paper={selectedPaper}
            onBack={() => setMobileShowChat(false)}
            llmConfigured={llmConfigured}
          />
        ) : (
          <div className="neu-card flex h-full items-center justify-center">
            <p className="text-muted-foreground">选择一篇论文开始阅读</p>
          </div>
        )}
      </div>
    </div>
  );
}
