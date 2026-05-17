import { describe, expect, it } from "vitest";
import { isValidAvatarUrl } from "./avatar-url";

describe("isValidAvatarUrl", () => {
  it("allows http, https, and data URLs", () => {
    expect(isValidAvatarUrl("http://example.com/avatar.png")).toBe(true);
    expect(isValidAvatarUrl("https://example.com/avatar.png")).toBe(true);
    expect(isValidAvatarUrl("data:image/png;base64,AAAA")).toBe(true);
  });

  it("rejects local files and invalid values", () => {
    expect(isValidAvatarUrl("file:///tmp/avatar.png")).toBe(false);
    expect(isValidAvatarUrl("ftp://example.com/avatar.png")).toBe(false);
    expect(isValidAvatarUrl("avatar.png")).toBe(false);
    expect(isValidAvatarUrl("")).toBe(false);
  });
});
