import { defer } from "@/util/defer"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CliRenderer } from "@opentui/core"
import { Filesystem } from "@/util/filesystem"
import { Process } from "@/util/process"

export async function openFile(opts: { filepath: string; renderer: CliRenderer; fallback?: string }): Promise<number | undefined> {
  const editor = process.env["VISUAL"] || process.env["EDITOR"] || opts.fallback
  if (!editor) return

  opts.renderer.suspend()
  opts.renderer.currentRenderBuffer.clear()
  try {
    const parts = editor.split(" ")
    const proc = Process.spawn([...parts, opts.filepath], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
      shell: process.platform === "win32",
    })
    return await proc.exited
  } finally {
    opts.renderer.currentRenderBuffer.clear()
    opts.renderer.resume()
    opts.renderer.requestRender()
  }
}

export async function open(opts: { value: string; renderer: CliRenderer }): Promise<string | undefined> {
  const filepath = join(tmpdir(), `${Date.now()}.md`)
  await using _ = defer(async () => rm(filepath, { force: true }))

  await Filesystem.write(filepath, opts.value)
  const code = await openFile({ filepath, renderer: opts.renderer })
  if (code === undefined) return
  const content = await Filesystem.readText(filepath)
  return content || undefined
}

export * as Editor from "./editor"
