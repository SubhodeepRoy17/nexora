import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, getProducts } from './api'


describe('merchant inventory pagination', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads every owner-scoped product page instead of stopping at 25', async () => {
    const products = Array.from({ length: 205 }, (_, index) => ({ id: index + 1 }))
    vi.spyOn(api, 'get').mockImplementation((_url, options) => {
      const page = options.params.page
      const pageSize = options.params.page_size
      const start = (page - 1) * pageSize
      return Promise.resolve({
        data: {
          count: products.length,
          next: start + pageSize < products.length ? `page-${page + 1}` : null,
          previous: page > 1 ? `page-${page - 1}` : null,
          results: products.slice(start, start + pageSize),
        },
      })
    })

    const response = await getProducts(new AbortController().signal)

    expect(api.get).toHaveBeenCalledTimes(3)
    expect(response.data.count).toBe(205)
    expect(response.data.results).toHaveLength(205)
    expect(response.data.results.at(-1).id).toBe(205)
  })
})
