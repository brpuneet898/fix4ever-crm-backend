export interface PaginationQuery {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginationOptions {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: 1 | -1;
}

export function parsePagination(query: PaginationQuery): PaginationOptions {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    sortBy: query.sortBy || "createdAt",
    sortOrder: query.sortOrder === "asc" ? 1 : -1,
  };
}
