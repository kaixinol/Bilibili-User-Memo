import { string, optional, object, record, array } from "valibot";
import { safeParse } from "valibot";
const UID = string();
const UserSchema = object({
  id: UID,
  nickname: string(),
  avatar: optional(string()),
  memo: string(),
});

const UsersSchema = array(UserSchema);

const UserSchemaOld = object({
  bid: UID,
  nickname: string(),
  memo: string(),
  avatar: optional(string()), // 可选字段
  info: string(), // 空字符串也合法
});

// 定义用户字典 schema（key 为字符串，value 为 UserSchema）
const UsersSchemaOld = record(UID, UserSchemaOld);
function validateEitherJSON(dataStr: string): boolean {
  let data: unknown;
  try {
    data = JSON.parse(dataStr); // 解包 JSON 字符串
  } catch {
    return false; // JSON 本身无效
  }

  // 遍历 schema，任意一个通过就算成功
  for (const schema of [UsersSchema, UsersSchemaOld]) {
    try {
      safeParse(schema, data);
      return true; // 成功匹配
    } catch {}
  }

  return false; // 全部失败
}
