export function showAlert(message: string): void {
  window.alert(message);
}

export function confirmDialog(message: string): boolean {
  return window.confirm(message);
}

export function promptText(
  message: string,
  defaultValue = "",
): string | null {
  const result = window.prompt(message, defaultValue);
  if (result === null) return null;

  const trimmed = result.trim();
  return trimmed || null;
}
