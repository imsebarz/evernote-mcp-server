import { readFileSync } from "node:fs";

const DEFAULT_MACOS_EVERNOTE_INFO_PLIST =
  "/Applications/Evernote.app/Contents/Info.plist";
const NOTE_STORE_GET_NOTE_MIN_VERSION = "11.13.0";

export type GetNoteBackend = "api-gateway" | "notestore";

function parseVersion(version: string): number[] {
  const match = version.trim().match(/\d+(?:\.\d+)*/);
  if (!match) return [];
  return match[0].split(".").map((part) => parseInt(part, 10));
}

export function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index++) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;

    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

function plistStringValue(plist: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = plist.match(
    new RegExp(`<key>${escapedKey}</key>\\s*<string>([^<]+)</string>`)
  );
  return match?.[1]?.trim();
}

export function getEvernoteVersionFromPlist(plist: string): string | undefined {
  return plistStringValue(plist, "CFBundleShortVersionString");
}

export function getInstalledEvernoteVersion(): string | undefined {
  if (process.env.EVERNOTE_DESKTOP_VERSION) {
    return process.env.EVERNOTE_DESKTOP_VERSION;
  }

  if (process.platform !== "darwin") return undefined;

  const plistPath =
    process.env.EVERNOTE_APP_INFO_PLIST || DEFAULT_MACOS_EVERNOTE_INFO_PLIST;

  try {
    const plist = readFileSync(plistPath, "utf8");
    return getEvernoteVersionFromPlist(plist);
  } catch {
    return undefined;
  }
}

export function selectGetNoteBackend(
  version = getInstalledEvernoteVersion()
): GetNoteBackend {
  const override = process.env.EVERNOTE_GET_NOTE_BACKEND?.toLowerCase();
  if (override === "api-gateway" || override === "old") return "api-gateway";
  if (override === "notestore" || override === "new") return "notestore";

  if (!version) return "api-gateway";

  return compareVersions(version, NOTE_STORE_GET_NOTE_MIN_VERSION) >= 0
    ? "notestore"
    : "api-gateway";
}
