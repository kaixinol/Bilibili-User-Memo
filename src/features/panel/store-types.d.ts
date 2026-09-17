/**
 * 全局类型增强：把各个 store 的形状挂到 Alpine.Stores 接口上。
 *
 * @types/alpinejs 把 Stores 定义成开放接口（`interface Stores { [key: string | symbol]: unknown }`），
 * 所以可以直接 declaration merging。好处有两处：
 *   1. `Alpine.store(name)` / `Alpine.store(name, value)` 的签名是
 *      `<T extends keyof Alpine.Stores>(name: T) => Alpine.Stores[T]`，
 *      所以注册和读取两端都能得到校验，不必再写 `Alpine.store("userList") as UserListStore`；
 *   2. `Alpine.store("userList")` 的返回值在 getUserListStore() 这类 helper 里
 *      能拿到完整类型，组件里通过 helper 间接获得补全和校验。
 *
 * 注意：本文件必须保持「没有任何 top-level import/export」——一旦出现，
 * `declare module "alpinejs"` 的行为会变化，实测 augmentation 会静默失效，
 * Stores 退回 unknown。MagicThis 定义在同目录的 alpine-types.d.ts 里。
 */
import type { AddUserDialogStore } from "./add-user-dialog";
import type { MemoDetailDialogStore } from "./item-components";
import type { PanelPrefsStore } from "./panel-prefs";
import type { UserListStore } from "./user-list-types";

declare module "alpinejs" {
  namespace Alpine {
    interface Stores {
      addUserDialog: AddUserDialogStore;
      memoDetailDialog: MemoDetailDialogStore;
      panelPrefs: PanelPrefsStore;
      userList: UserListStore;
    }
  }
}
