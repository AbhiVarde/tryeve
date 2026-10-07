export function isSafeAgentUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h.startsWith("[")) return false;
    const suffix = process.env.SANDBOX_HOST_SUFFIX;
    if (suffix && !h.endsWith(suffix)) return false;
    return !(
      h === "localhost" ||
      h.endsWith(".local") ||
      h.endsWith(".internal") ||
      /^(0|10|127)\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^169\.254\./.test(h)
    );
  } catch {
    return false;
  }
}
