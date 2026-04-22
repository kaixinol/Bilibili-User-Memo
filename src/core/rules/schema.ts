import {
  string,
  optional,
  object,
  record,
  array,
  union,
  safeParse,
} from "valibot";

// --- 1. Schema 定义 ---
const UID = string();

// 新版模型
const UserSchema = object({
  id: UID,
  nickname: string(),
  avatar: optional(string()),
  memo: string(),
});

// 旧版模型
const UserSchemaOld = object({
  bid: UID,
  nickname: string(),
  memo: string(),
  avatar: optional(string()),
  info: string(),
});

// 组合 Schema：自动识别是 数组(新) 还是 字典(旧)
const CombinedSchema = union([array(UserSchema), record(UID, UserSchemaOld)]);

// --- 2. 类型定义 ---
type ValidateResult = { ok: true } | { ok: false; error: string };

// --- 3. 辅助函数：优化错误信息格式化 ---
function formatIssues(
  issues: NonNullable<ReturnType<typeof safeParse>["issues"]>,
): string {
  return issues
    .slice(0, 2)
    .map(({ path, message }) => {
      // 优雅地处理路径提取
      const pathStr =
        path
          ?.map((p) => p.key)
          .filter(Boolean)
          .join(".") || "";
      return pathStr ? `[${pathStr}] ${message}` : message;
    })
    .join("; ");
}

// 校验函数
export function validateEitherJSON(data: unknown): ValidateResult {
  const result = safeParse(CombinedSchema, data);

  if (result.success) return { ok: true };

  return {
    ok: false,
    error: `格式不匹配: ${formatIssues(result.issues)}`,
  };
}
