import { describe, expect, it } from "vitest";
import type { BiliUser } from "../types";
import { findUniqueUserByName } from "./name-match";

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

  it("returns none when the nickname is empty", () => {
    const users = [createUser("1001", "唯一用户")];

    const result = findUniqueUserByName(users, "   ");

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

  it("ignores a single '账号已注销' record", () => {
    const users = [createUser("1001", "账号已注销")];

    const result = findUniqueUserByName(users, "账号已注销");

    expect(result.reason).toBe("ignored");
    expect(result.user).toBeUndefined();
  });

  it("ignores multiple '账号已注销' records before ambiguity matching", () => {
    const users = [
      createUser("1001", "账号已注销"),
      createUser("1002", "账号已注销"),
    ];

    const result = findUniqueUserByName(users, "账号已注销");

    expect(result.reason).toBe("ignored");
    expect(result.user).toBeUndefined();
  });
});
