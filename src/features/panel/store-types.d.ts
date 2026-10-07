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
 * 注意：顶部的 import 不能删——删掉本文件就变成全局脚本，`declare module "alpinejs"`
 * 随之变成环境模块声明、整份覆盖 @types/alpinejs，所有 Alpine 属性都会 TS2339。
 * 有 top-level import 时它才是 augmentation。
 */
import type { AddUserDialogStore } from "./add-user-dialog";
import type { AltKeysStore, MemoDetailDialogStore } from "./item-components";
import type { PanelPrefsStore } from "./panel-prefs";
import type { UserListStore } from "./user-list-types";

declare module "alpinejs" {
  namespace Alpine {
    interface Stores {
      addUserDialog: AddUserDialogStore;
      altKeys: AltKeysStore;
      memoDetailDialog: MemoDetailDialogStore;
      panelPrefs: PanelPrefsStore;
      userList: UserListStore;
    }
  }
}
