# 贡献指南

感谢你对 **Bilibili-User-Memo** 项目的关注！本文档将帮助你了解如何参与项目开发。

## 🚀 快速开始

### 开发流程

```bash
# 1. Fork 并克隆仓库
git clone https://github.com/kaixinol/Bilibili-User-Memo.git
cd Bilibili-User-Memo

# 2. 安装依赖
pnpm install

# 3. 启动开发模式
pnpm dev

# 4. 代码检查
pnpm lint

# 5. 运行测试
pnpm test

# 6. 生产构建
pnpm build
```

## 📝 代码规范

### TypeScript

项目启用了 `verbatimModuleSyntax: true`，必须严格区分类型导入：

```typescript
// ✅ 正确
import type { UserType } from './types'
import { createUser } from './utils'

// ❌ 错误
import { UserType, createUser } from './utils'
```

### CSS 样式

- **共享样式**：在 Shadow DOM 和主文档中使用的样式必须提取到独立 CSS 文件
- **注入方式**：使用 Constructable Stylesheets API
- **禁止重复**：不要在 TS 代码中硬编码与 CSS 文件重复的样式

### 性能优化

1. **避免布局抖动**：优先使用原生 CSS 属性（如 `outline`），避免创建大量覆盖层 DIV
2. **高频事件**：使用 Alpine.js `.debounce` 修饰符，如 `@input.debounce.100ms`
3. **MutationObserver**：实现防重入锁机制，避免并发调用
4. **批量操作**：遵循"批量读，批量写"原则，结合 `requestAnimationFrame`

## 🔧 项目结构

```
src/
├── core/         # 核心业务逻辑
│   ├── api/      # API 接口与请求管理
│   │   ├── bilibili-user.ts    # Bilibili 用户 API 接口
│   │   └── request-limiter.ts  # 请求频率限制器
│   ├── dom/      # DOM 操作工具
│   │   ├── dom-utils.ts    # DOM 工具函数
│   │   ├── owned-node.ts   # 节点所有权管理
│   │   ├── text-utils.ts   # 文本处理工具
│   │   └── uid-extractor.ts # UID 提取工具
│   ├── injection/ # 注入引擎（规则运行时、扫描调度、监听器）
│   │   ├── injector.ts           # 注入器入口
│   │   ├── remote-change-buffer.ts # 远程变更缓冲
│   │   ├── rule-runtime.ts       # 规则运行时
│   │   ├── scan-scheduler.ts     # 扫描任务调度
│   │   ├── scan-scope.ts         # 扫描范围管理
│   │   ├── watch-runtime.ts      # 监听运行时
│   │   └── watchers.ts           # 监听器实现
│   ├── render/   # 渲染引擎
│   │   ├── dom-refresh.ts   # DOM 刷新
│   │   ├── editor.ts        # 编辑器
│   │   ├── rendered-node.ts # 已渲染节点管理
│   │   └── renderer.ts      # 渲染器
│   ├── rules/    # 规则系统
│   │   ├── rule-types.ts # 规则类型定义
│   │   ├── rules.ts      # 规则集合与逻辑
│   │   └── schema.ts     # Schema 验证
│   ├── store/    # 数据存储
│   │   ├── name-match.ts           # 昵称匹配
│   │   ├── page-disable-storage.ts # 页面禁用状态存储
│   │   ├── store.ts                # 核心存储逻辑
│   │   ├── user-normalization.ts   # 用户数据规范化
│   │   └── user-storage.ts         # 用户数据持久化
│   ├── style/    # 样式管理
│   │   └── style-manager.ts # Constructable Stylesheets 管理
│   └── types.ts  # 核心类型定义
├── features/     # 功能模块
│   ├── debugger/ # 调试器功能
│   │   ├── debugger.ts   # 调试器逻辑
│   │   └── debugger.html # 调试器界面
│   └── panel/    # 控制面板功能
│       ├── add-user-dialog.ts  # 添加用户对话框
│       ├── avatar-url.ts       # 头像 URL 处理
│       ├── bili-api.ts     # Bilibili API
│       ├── custom-css.ts       # 自定义 CSS 支持
│       ├── dialogs.ts          # 对话框组件
│       ├── panel-components.ts # 面板组件
│       ├── panel-prefs.ts      # 面板偏好设置
│       ├── panel.ts            # 面板主逻辑
│       ├── user-list-io.ts     # 用户列表导入导出
│       ├── user-list-store.ts  # 用户列表状态管理
│       ├── box.html            # 面板 HTML 模板
│       └── panel.html          # 面板主 HTML
├── styles/       # CSS 样式文件
│   ├── box.css                 # 用户卡片样式
│   ├── debugger.css            # 调试器界面样式
│   ├── debugger-highlight.css  # 调试高亮样式
│   ├── global.css              # 全局样式与主题变量
│   ├── memo.css                # 备注编辑器样式
│   └── panel.css               # 控制面板样式
├── utils/        # 工具函数
│   ├── cache.ts              # 内存缓存管理
│   ├── caller.ts             # 调用栈信息提取（调试与日志）
│   ├── chinese-search.ts     # 中文搜索优化（支持繁简互通）
│   ├── gm-storage.ts         # Greasemonkey API 存储封装
│   ├── logger.ts             # 日志工具
│   ├── perf-diagnostics.ts   # 性能诊断工具
│   ├── query-dom.ts          # DOM 查询工具
│   └── scheduler.ts          # 任务调度器
├── main.ts       # 入口文件（初始化与生命周期管理）
└── vite-env.d.ts # Vite 类型声明
```

## 📋 提交规范

### Commit 消息格式

项目采用 [gitmoji](https://gitmoji.dev/) 规范，commit 消息格式为：

```
<emoji> <描述>

示例：
✨ 添加批量删除功能
🐛 修复布局抖动问题
📝 更新安装说明
⚡️ 优化卡片渲染性能
```

### 提交前检查清单

- [ ] 通过 `pnpm lint` 检查
- [ ] 通过 `pnpm test` 测试
- [ ] 在 Bilibili 实际环境中测试
- [ ] 更新相关文档（如需要）
- [ ] 无 console.log 等调试代码

## 🔄 Pull Request 流程

1. **创建分支**：从 `master` 分支创建功能分支
   ```bash
   git checkout -b feat/your-feature
   ```

2. **开发并提交**：遵循代码规范和 commit 规范

3. **推送并提 PR**：推送到你的 fork，然后向主仓库的 `master` 分支发起 PR

4. **PR 检查清单**：
   - [ ] 代码通过 lint 检查
   - [ ] 所有测试通过
   - [ ] 在实际环境中测试过
   - [ ] 文档已更新（如需要）
   - [ ] TypeScript 类型定义完整
   - [ ] 样式适配明暗主题

## 💡 常见问题

### 如何调试？

- 使用 `pnpm dev` 生成调试版脚本
- 右键点击面板开关按钮可打开调试窗口
- 调试时建议切换到 "Minimal" 模式防止样式污染

### 如何添加新功能？

1. 先查看现有 issues 和 PRs
2. 创建 issue 讨论功能设计
3. 获得维护者同意后再开始开发

感谢你的贡献！🎉
