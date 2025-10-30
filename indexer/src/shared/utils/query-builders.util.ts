// Reusable query builders and utilities
import { SQL, sql, eq, and, desc, asc, gte, lte, count, like } from 'drizzle-orm'
import { PgColumn } from 'drizzle-orm/pg-core'

export interface PaginationOptions {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginationResult<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

/**
 * Reusable pagination builder
 */
export class PaginationBuilder {
  static buildPagination(options: PaginationOptions = {}) {
    const page = Math.max(1, options.page || 1)
    const limit = Math.min(100, Math.max(1, options.limit || 20))
    const offset = (page - 1) * limit

    return { page, limit, offset }
  }

  static buildPaginationResult<T>(data: T[], total: number, options: PaginationOptions = {}): PaginationResult<T> {
    const { page, limit } = this.buildPagination(options)
    const totalPages = Math.ceil(total / limit)

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    }
  }
}

/**
 * Reusable filter builder for common patterns
 */
export class FilterBuilder {
  static pubkeyFilter(column: PgColumn, value?: string): SQL | undefined {
    if (!value) return undefined
    return eq(column, value)
  }

  static enumFilter<T extends string>(column: PgColumn, value?: T): SQL | undefined {
    if (!value) return undefined
    return eq(column, value)
  }

  static booleanFilter(column: PgColumn, value?: boolean): SQL | undefined {
    if (value === undefined) return undefined
    return eq(column, value)
  }

  static numberFilter(column: PgColumn, value?: number): SQL | undefined {
    if (value === undefined) return undefined
    return eq(column, value)
  }

  static numberRangeFilter(column: PgColumn, range?: { min?: number; max?: number }): SQL | undefined {
    if (!range) return undefined

    const conditions: SQL[] = []
    if (range.min !== undefined) conditions.push(gte(column, range.min))
    if (range.max !== undefined) conditions.push(lte(column, range.max))

    return conditions.length > 0 ? and(...conditions) : undefined
  }

  static dateRangeFilter(column: PgColumn, range?: { after?: string; before?: string }): SQL | undefined {
    if (!range) return undefined

    const conditions: SQL[] = []
    if (range.after) conditions.push(gte(column, new Date(range.after)))
    if (range.before) conditions.push(lte(column, new Date(range.before)))

    return conditions.length > 0 ? and(...conditions) : undefined
  }

  static arrayContainsFilter(column: PgColumn, value?: string): SQL | undefined {
    if (!value) return undefined
    return sql`${column} @> ${JSON.stringify([value])}`
  }

  static searchFilter(column: PgColumn, searchTerm?: string): SQL | undefined {
    if (!searchTerm) return undefined
    return like(column, `%${searchTerm}%`)
  }
}

/**
 * Reusable sort builder
 */
export class SortBuilder {
  static buildSort(
    columns: Record<string, PgColumn>,
    sortBy?: string,
    sortOrder: 'asc' | 'desc' = 'desc'
  ): SQL | undefined {
    if (!sortBy || !columns[sortBy]) return undefined

    const column = columns[sortBy]
    return sortOrder === 'asc' ? asc(column) : desc(column)
  }
}

/**
 * Combined query builder for consistent API patterns
 */
export class QueryBuilder {
  static combineFilters(filters: (SQL | undefined)[]): SQL | undefined {
    const validFilters = filters.filter(Boolean) as SQL[]
    return validFilters.length > 0 ? and(...validFilters) : undefined
  }

  static buildCountQuery<T extends Record<string, any>>(table: T, whereClause?: SQL) {
    return {
      from: table,
      columns: { count: count() },
      where: whereClause
    }
  }

  static buildSelectQuery<T extends Record<string, any>>(
    table: T,
    whereClause?: SQL,
    orderBy?: SQL,
    limit?: number,
    offset?: number
  ) {
    return {
      from: table,
      where: whereClause,
      orderBy,
      limit,
      offset
    }
  }
}

// Removed ResponseFormatter - now using shared/utils/response-formatter.ts
