import fs from "node:fs";
import path from "path";
import os from "os";

const APP_NAME = "9router";

function defaultDir() {
  const home = (typeof os.homedir === "function" ? os.homedir() : "") || "/tmp";
  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, APP_NAME);
  }
  return path.join(home, `.${APP_NAME}`);
}

export function getDataDir() {
  const configured = process.env.DATA_DIR;
  if (!configured) return defaultDir();
  try {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  } catch (e) {
    if (e?.code === "EACCES" || e?.code === "EPERM") {
      console.warn(`[DATA_DIR] '${configured}' not writable → fallback ~/.${APP_NAME}`);
      return defaultDir();
    }
    // In serverless / edge runtimes (e.g. Cloudflare Workers unenv stub) fs.mkdirSync is not implemented
    return configured;
  }
}

export const DATA_DIR = getDataDir();


