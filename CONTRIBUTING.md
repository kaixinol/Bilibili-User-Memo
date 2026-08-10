# 贡献指南

感谢你对 **Bilibili-User-Memo** 项目的关注！本文档将帮助你了解如何参与项目开发。

## 快速开始

### 开发流程

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/kaixinol/Bilibili-User-Memo.git
cd Bilibili-User-Memo

# 2. 安装依赖
pnpm install

# 3. 启动开发模式（生成调试版脚本，不压缩）
pnpm dev

# 4. 代码检查（ESLint + Stylelint + TypeScript）
pnpm lint

# 5. 运行测试
pnpm test

# 6. 生产构建（terser + lightningcss 压缩）
pnpm build
```

## 核心架构

项目本质是一个 **Tampermonkey 油猴脚本**，通过 vite-plugin-monkey 构建。核心流程：

```
URL 匹配 → 规则系统 → DOM 扫描/注入 → 渲染备注
```

### 渲染模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **Minimal** | 在原 DOM 元素上添加 CSS 类，不创建包裹元素 | 视频卡片作者、搜索列表等 |
| **Editable** | 创建 `<span class="editable-textarea">` 包裹元素，隐藏原始元素 | 视频页 UP 主、评论区、空间昵称等 |

### 扫描方式

所有规则共享一个 `setInterval`（750ms），通过 `buildMergedSelector` 生成合并选择器，单次 `querySelectorAllDeep` 扫描。
- 有 `container` 的规则：扫描到元素后额外校验 `el.closest(container)`，通过后才处理
- 无 `container` 的规则：全局扫描，所有匹配元素均处理

### 样式隔离

备注样式通过 **Constructable Stylesheets API** 注入到 Document 或 ShadowRoot，避免全局污染。自定义 CSS 同理。

## 代码规范

### TypeScript

项目启用了 `verbatimModuleSyntax: true`，必须严格区分类型导入：

```typescript
// 正确
import type { UserType } from './types'
import { createUser } from './utils'

// 错误
import { UserType, createUser } from './utils'
```

### CSS 样式

- **共享样式**：在 Shadow DOM 和主文档中使用的样式必须提取到独立 CSS 文件
- **注入方式**：使用 Constructable Stylesheets API（`src/core/style/style-manager.ts`）
- **禁止重复**：不要在 TS 代码中硬编码与 CSS 文件重复的样式
- **主题适配**：使用 `src/styles/global.css` 中的 CSS 变量，确保明暗主题兼容

### 性能优化

1. **避免布局抖动**：优先使用原生 CSS 属性（如 `outline`），避免创建大量覆盖层 DIV
2. **高频事件**：使用 Alpine.js `.debounce` 修饰符，如 `@input.debounce.100ms`
3. **批量操作**：遵循"批量读，批量写"原则，结合 `requestAnimationFrame`
4. **空闲规避**：`querySelectorAllDeep` 通过 `activityMonitor.isIdle()` 在用户闲置 3s 后跳过扫描，避免后台标签页的性能浪费
5. **动态扫描**：使用 `setInterval` 轮询（750ms），`container` 字段自动拼接到选择器前（`${container} ${selector}`），所有规则统一生成合并选择器

## 项目结构

```text
src/
├── core/              # 核心业务逻辑
│   ├── api/           # Bilibili API 接口与请求限流
│   ├── dom/           # DOM 操作工具（节点所有权、文本处理、UID 提取、头像提取）
│   ├── injection/     # 注入引擎（规则运行时、扫描调度）
│   ├── render/        # 渲染引擎（Minimal/Editable 两种模式）
│   ├── rules/         # 规则系统（URL 匹配 + 样式作用域 + UID 解析）
│   ├── store/         # 数据存储（UserStore 单例、昵称匹配、持久化）
│   ├── style/         # Constructable Stylesheets 样式管理
│   └── types.ts       # 核心类型（BiliUser, ElementMeta）
├── features/          # 功能模块
│   ├── debugger/      # 调试器（仅 __IS_DEBUG__ 模式加载）
│   └── panel/         # Alpine.js 控制面板 UI（扁平结构）
│       ├── panel-components.ts  # 组件注册入口
│       ├── panel-core.ts        # 共享 helpers + shell/toggle/actions
│       ├── panel-settings.ts    # 设置组件
│       ├── item-components.ts   # 用户卡片、UID、头像、备注编辑器、详细备注对话框
│       ├── perceptual-hash.ts   # 感知哈希检测假 noface 头像
│       ├── user-list-types.ts   # UserListStore TypeScript 接口
│       ├── box.html / panel.html # Alpine 模板
│       └── ...
├── styles/            # CSS 样式文件
├── utils/             # 工具函数（缓存、日志、调度器、中文搜索、GM 存储等）
└── main.ts            # 入口：Alpine 初始化、GM 菜单命令、生命周期
```

## 添加新规则

在 `src/core/rules/rules.ts` 的 `rawConfig` 数组中添加：

```typescript
{
    urlPattern: /^https:\/\/www\.bilibili\.com\/xxx/,  // URL 正则
    rule: {
        name: "规则名称",
        styleScope: StyleScope.Minimal,  // 或 Editable
        aSelector: ".target-element",     // 目标元素选择器
        textSelector: "span.name",        // 可选：文本内容选择器
        container: "#app",                // 可选：限定扫描容器，有 container 的规则会在匹配时校验 el.closest(container)
        uidResolver: (el) => ...,         // 可选：自定义 UID 提取
        matchByName: true,                // 可选：按名称匹配（无 UID 时回退，需同时设置 textSelector）
    }
}
```

## 提交规范

项目采用 [gitmoji](https://gitmoji.dev/) 规范：

```text
<emoji> <描述>

示例：
:sparkles: 添加批量删除功能
:bug: 修复布局抖动问题
:memo: 更新安装说明
:zap: 优化卡片渲染性能
:heavy_minus_sign: 移除依赖
:coffin: 清理死代码
```

### 提交前检查清单

- [ ] 通过 `pnpm lint` 检查
- [ ] 通过 `pnpm test` 测试
- [ ] 在 Bilibili 实际环境中测试（至少测试受影响的页面类型）
- [ ] 无 `console.log` 等调试代码（使用 `logger.debug` 代替）
- [ ] 样式适配明暗主题（如涉及 UI 变更）

## Pull Request 流程

1. 从 `master` 分支创建功能分支：`git checkout -b feat/your-feature`
2. 开发并提交（遵循上述规范）
3. 推送到你的 fork，向主仓库 `master` 分支发起 PR
4. PR 描述中说明改动内容、测试场景

## 常见问题

### 如何调试？

- `pnpm dev` 生成调试版脚本（不压缩，保留变量名）
- 调试版（`pnpm dev`）启动后自动打开调试窗口
- 使用 `logger.debug()` 输出调试日志
- 调试版和正式版都暴露 `window.Alpine.store('userList')`，可直接用于非 DOM 相关的自动化测试（查询用户、搜索过滤、多选、导出、刷新等），避免直接操作 DOM；预注入关闭时（列表未加载）先 `await window.Alpine.store('userList').ensureUsersLoaded()`
- 调试器命中数从批量扫描快照（`getLatestScan()`）读取，不再对每规则单独调用 `querySelectorAllDeep`

### 为什么我的规则没有生效？

1. 检查 `urlPattern` 是否正确匹配目标页面
2. 检查 `aSelector` 是否能选中目标元素
3. 如果是动态加载的内容，建议配置 `container`
4. 打开调试器查看规则运行时日志

### 如何添加新的外部依赖？

- 如果依赖有 UMD/IIFE 构建且暴露全局变量 → 可加入 `vite.config.ts` 的 `externalGlobals`
- 否则 → 作为普通 npm 依赖打包（如 `@alpinejs/persist`）
- 注意：CDN 构建如果没有全局导出，不能用 `externalGlobals`

感谢你的贡献！
