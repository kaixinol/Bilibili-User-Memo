import { describe, expect, it } from "vitest";
import type { BiliUser } from "../types";
import {
  findUniqueUserByName,
  resolveUniqueUserIdByName,
} from "./name-match";

function createUser(id: string, nickname: string): BiliUser {
  return {
    id,
    nickname,
    avatar: "",
    memo: "memo",
  };
}

describe("findUniqueUserByName", () => {
  it("returns the user when the nickname matches exactly one record", () => {
    const users = [
      createUser("1001", "唯一用户"),
      createUser("1002", "其他用户"),
    ];

    const result = findUniqueUserByName(users, "唯一用户");

    expect(result.reason).toBe("unique");
    expect(result.user?.id).toBe("1001");
  });

  it("returns none when the nickname does not exist", () => {
    const users = [createUser("1001", "唯一用户")];

    const result = findUniqueUserByName(users, "不存在");

    expect(result.reason).toBe("none");
    expect(result.user).toBeUndefined();
  });

  it("returns ambiguous when multiple users share the same nickname", () => {
    const users = [
      createUser("1001", "重名用户"),
      createUser("1002", "重名用户"),
    ];

    const result = findUniqueUserByName(users, "重名用户");

    expect(result.reason).toBe("ambiguous");
    expect(result.user).toBeUndefined();
  });

  it("treats multiple '账号已注销' records as ambiguous", () => {
    const users = [
      createUser("1001", "账号已注销"),
      createUser("1002", "账号已注销"),
    ];

    const result = findUniqueUserByName(users, "账号已注销");

    expect(result.reason).toBe("ambiguous");
    expect(result.user).toBeUndefined();
  });
});

describe("resolveUniqueUserIdByName", () => {
  it("returns the uid when matchByName fallback has a unique nickname match", () => {
    const users = [createUser("1001", "唯一用户")];

    expect(resolveUniqueUserIdByName(users, "唯一用户")).toBe("1001");
  });

  it("returns null when matchByName fallback hits an ambiguous nickname", () => {
    const users = [
      createUser("1001", "账号已注销"),
      createUser("1002", "账号已注销"),
    ];

    expect(resolveUniqueUserIdByName(users, "账号已注销")).toBeNull();
  });
});
