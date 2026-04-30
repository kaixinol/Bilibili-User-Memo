export function getCaller(depth = 3) {
  const stack = new Error().stack?.split("\n");
  return stack?.[depth]?.trim();
}
