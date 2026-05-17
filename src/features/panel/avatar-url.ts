const ALLOWED_AVATAR_PROTOCOLS = new Set(["http:", "https:", "data:"]);

export function isValidAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ALLOWED_AVATAR_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

export const AVATAR_URL_INVALID_MESSAGE = "请输入有效的 http(s) 或 data: 头像 URL";
