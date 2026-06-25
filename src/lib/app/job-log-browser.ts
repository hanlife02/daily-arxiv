export const JOB_LOG_PAGE_SIZE = 12;

export type JobLogBrowserSearchParams = {
  jobStatus?: string;
  jobType?: string;
  jobPage?: string;
};

export type JobLogBrowserFilters = {
  status?: string;
  type?: string;
  page: number;
  offset: number;
  pageSize: number;
};

export type JobLogPagination = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
  previousPage: number;
  nextPage: number;
};

function cleanFilter(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed !== "all" ? trimmed : undefined;
}

function parsePage(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function parseJobLogBrowserFilters(params: JobLogBrowserSearchParams): JobLogBrowserFilters {
  const page = parsePage(params.jobPage);
  return {
    status: cleanFilter(params.jobStatus),
    type: cleanFilter(params.jobType),
    page,
    offset: (page - 1) * JOB_LOG_PAGE_SIZE,
    pageSize: JOB_LOG_PAGE_SIZE
  };
}

export function buildJobLogPagination(total: number, page: number, pageSize = JOB_LOG_PAGE_SIZE): JobLogPagination {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  return {
    page: safePage,
    pageSize,
    total,
    pageCount,
    hasPrevious: safePage > 1,
    hasNext: safePage < pageCount,
    previousPage: Math.max(1, safePage - 1),
    nextPage: Math.min(pageCount, safePage + 1)
  };
}

export function jobLogPageHref(filters: Pick<JobLogBrowserFilters, "status" | "type">, page: number) {
  const params = new URLSearchParams();
  if (filters.status) params.set("jobStatus", filters.status);
  if (filters.type) params.set("jobType", filters.type);
  if (page > 1) params.set("jobPage", String(page));
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}
