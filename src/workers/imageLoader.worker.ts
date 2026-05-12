/**
 * 图片加载 Worker
 * 在后台线程中完成 JPEG 解码，避免阻塞主线程
 */

self.onmessage = async (e: MessageEvent<{ file: File }>) => {
  try {
    const { file } = e.data
    const bitmap = await createImageBitmap(file)
    // 通过 transferable 将 ImageBitmap 零拷贝传回主线程
    self.postMessage(
      { type: 'success', bitmap, width: bitmap.width, height: bitmap.height },
      [bitmap] as any
    )
  } catch (err: any) {
    self.postMessage({ type: 'error', message: err.message || '图片解码失败' })
  }
}
