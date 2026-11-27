/** Saves text as a file on the device. */
export function downloadText(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before dropping the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
