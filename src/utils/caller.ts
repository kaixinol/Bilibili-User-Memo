export function getCaller(depth = 3): string {
  const frame = new Error().stack?.split("\n")?.[depth]?.trim();
  if (!frame) return "unknown";

  const nameMatch = frame.match(/at\s+(?:async\s+)?([^(]+)/);
  const funcName = nameMatch ? nameMatch[1].trim() : "?";

  const pathMatch = frame.match(/\(([^)]+)\)/);
  const rawPath = pathMatch ? pathMatch[1] : "";
  const modulePart = rawPath
    .replace(/^https?:\/\/[^/]+/, "")
    .replace(/\?.*$/, "")
    .replace(/:\d+(:\d+)?$/, "")
    .replace(/^\/?src\//, "")
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/\//g, ".");

  return modulePart ? `${modulePart}:${funcName}` : funcName;
}
