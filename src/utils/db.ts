/**
 * 模型缓存管理
 *
 * 使用 Cache API 代替 IndexedDB 存储模型文件。
 * Cache API 天然适合存储大型二进制数据（如 ONNX 模型），不需要创建 store 或管理数据库版本，
 * 避免了 IndexedDB 在 open/close 过程中可能出现的多数据库连接问题。
 */

const CACHE_NAME = 'vanish360-model-cache'

/**
 * 将 key 映射为一个虚拟 URL（Cache API 以 Request/Response 为单位）
 */
function keyToUrl(key: string): string {
  return `/__cache__/${key}`
}

/**
 * 从缓存中读取指定 key 的数据
 */
export async function getItem<T = ArrayBuffer>(key: string): Promise<T | null> {
  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(keyToUrl(key))
    if (!response) return null
    return (await response.arrayBuffer()) as T
  } catch {
    return null
  }
}

/**
 * 向缓存中写入指定 key 的数据
 */
export async function setItem(key: string, value: ArrayBuffer): Promise<void> {
  const cache = await caches.open(CACHE_NAME)
  const response = new Response(value, {
    headers: { 'Content-Type': 'application/octet-stream' },
  })
  await cache.put(keyToUrl(key), response)
}

/**
 * 检查缓存中指定 key 是否存在
 */
export async function hasItem(key: string): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(keyToUrl(key))
    return response !== undefined
  } catch {
    return false
  }
}

/**
 * 删除缓存中指定 key 的数据
 */
export async function removeItem(key: string): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME)
    return await cache.delete(keyToUrl(key))
  } catch {
    return false
  }
}
