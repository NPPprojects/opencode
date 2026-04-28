import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import type { CliRenderer } from "@opentui/core"
import { Filesystem } from "@/util/filesystem"
import { readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openFile } from "./editor"

type ManualApplyChange = {
  path: string
  diff: string
  kind?: string
}

function record(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object") return
  return input as Record<string, unknown>
}

function changes(request: PermissionRequest): ManualApplyChange[] {
  const metadata = request.metadata ?? {}
  if (Array.isArray(metadata.files)) {
    return metadata.files.flatMap((input) => {
      const file = record(input)
      if (!file) return []
      const target = typeof file.movePath === "string" ? file.movePath : file.filePath
      const diff = typeof file.patch === "string" ? file.patch : file.diff
      if (typeof target !== "string" || typeof diff !== "string") return []
      return [{ path: target, diff, ...(typeof file.type === "string" ? { kind: file.type } : {}) }]
    })
  }

  if (typeof metadata.filepath !== "string" || typeof metadata.diff !== "string") return []
  return [{ path: metadata.filepath, diff: metadata.diff }]
}

function resultPath(payloadPath: string) {
  return payloadPath.replace(/\.json$/, ".result.json")
}

async function completed(payloadPath: string, approvalID: string) {
  const result = JSON.parse(await readFile(resultPath(payloadPath), "utf8")) as Record<string, unknown>
  return (
    result.schema_version === 2 &&
    result.kind === "manual_patch_apply_result" &&
    result.approval_id === approvalID &&
    result.status === "completed"
  )
}

export function canOpenManualApply(request: PermissionRequest) {
  return changes(request).length > 0
}

export async function openManualApply(request: PermissionRequest, renderer: CliRenderer) {
  const payloadChanges = changes(request)
  if (payloadChanges.length === 0) throw new Error("No manual-apply diff payload found")

  const id = request.id.replace(/[^A-Za-z0-9_-]/g, "_")
  for (let index = 0; index < payloadChanges.length; index++) {
    const change = payloadChanges[index]
    if (!change) continue
    const payloadPath = join(tmpdir(), `xcodex-manual-apply-${id}-${index + 1}-of-${payloadChanges.length}.json`)
    const outputPath = resultPath(payloadPath)
    await using _ = {
      async [Symbol.asyncDispose]() {
        await rm(payloadPath, { force: true })
        await rm(outputPath, { force: true })
      },
    }

    await Filesystem.write(
      payloadPath,
      JSON.stringify(
        {
          schema_version: 1,
          kind: "manual_patch_apply_request",
          approval_id: request.id,
          changes: [change],
        },
        null,
        2,
      ) + "\n",
    )

    if ((await openFile({ filepath: payloadPath, renderer, fallback: "nvim" })) !== 0) return false
    if (!(await completed(payloadPath, request.id).catch(() => false))) return false
  }
  return true
}
