"use client";

import { Check, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { ArxivCategory } from "@/lib/arxiv/categories";
import { cn } from "@/lib/utils";

type CategoryPickerProps = {
  categories: ArxivCategory[];
  selected: string[];
  categoryWeights?: Record<string, number>;
  name?: string;
};

function uniqueCodes(codes: string[]) {
  return Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));
}

export function CategoryPicker({ categories, selected, categoryWeights = {}, name = "categories" }: CategoryPickerProps) {
  const [query, setQuery] = useState("");
  const [selectedCodes, setSelectedCodes] = useState(() => uniqueCodes(selected));

  const categoryByCode = useMemo(() => new Map(categories.map((category) => [category.code, category])), [categories]);
  const selectedSet = useMemo(() => new Set(selectedCodes), [selectedCodes]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredCategories = useMemo(() => {
    if (!normalizedQuery) return categories;

    return categories.filter((category) => {
      const haystack = `${category.code} ${category.name} ${category.group}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [categories, normalizedQuery]);

  const selectedCategories = selectedCodes.map((code) => categoryByCode.get(code) ?? { code, group: "自定义", name: "Advanced category" });

  function addCategory(code: string) {
    setSelectedCodes((current) => (current.includes(code) ? current : [...current, code]));
  }

  function removeCategory(code: string) {
    setSelectedCodes((current) => current.filter((item) => item !== code));
  }

  return (
    <div className="grid gap-2">
      <input type="hidden" name={name} value={selectedCodes.join(", ")} />

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">分类选择</span>
        <span className="shrink-0 text-xs text-muted-foreground">已选 {selectedCodes.length} / {categories.length}</span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          className="neu-input h-10 w-full px-9 text-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索 code、英文名称或学科组，例如 cs.CL / Machine Learning"
          type="search"
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground">已选分类</span>
          {selectedCategories.length ? <span className="text-xs text-muted-foreground">可单独调整权重</span> : null}
        </div>
        <div className="min-h-11 rounded-xl border border-border/70 bg-background/60 p-2">
          {selectedCategories.length ? (
            <div className="grid gap-2">
              {selectedCategories.map((category) => (
                <div
                  className="grid gap-2 rounded-xl border border-border/70 bg-muted/35 p-2 text-xs md:grid-cols-[minmax(0,1fr)_7rem_auto] md:items-center"
                  key={category.code}
                >
                  <div className="min-w-0">
                    <span className="font-medium">{category.code}</span>
                    <span className="ml-2 truncate text-muted-foreground">{category.name}</span>
                  </div>
                  <label className="grid gap-1">
                    <span className="text-muted-foreground">权重</span>
                    <input
                      className="neu-input h-8 px-2 text-xs"
                      defaultValue={categoryWeights[category.code] ?? 1}
                      max={3}
                      min={0.1}
                      name={`categoryWeight:${category.code}`}
                      step={0.1}
                      type="number"
                    />
                  </label>
                  <button
                    aria-label={`移除 ${category.code}`}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
                    onClick={() => removeCategory(category.code)}
                    type="button"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-1 py-1.5 text-xs text-muted-foreground">还没有选择分类。</p>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <span className="text-xs font-medium text-muted-foreground">添加分类</span>
        <div className="max-h-72 overflow-y-auto rounded-xl border border-border/70 bg-background/60">
          {filteredCategories.length ? (
            <div className="divide-y divide-border/70">
              {filteredCategories.map((category) => {
                const isSelected = selectedSet.has(category.code);
                return (
                  <button
                    className={cn(
                      "grid w-full grid-cols-[minmax(5.5rem,auto)_1fr_auto] items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/15",
                      isSelected && "bg-muted/45"
                    )}
                    disabled={isSelected}
                    key={category.code}
                    onClick={() => addCategory(category.code)}
                    type="button"
                  >
                    <span className="font-mono text-xs font-semibold text-foreground">{category.code}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-foreground">{category.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{category.group}</span>
                    </span>
                    {isSelected ? (
                      <Check className="size-4 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <Plus className="size-4 text-muted-foreground" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配的分类。</p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">分类来自 arXiv 官方 taxonomy，保存时仍会按 code 校验。</p>
    </div>
  );
}
