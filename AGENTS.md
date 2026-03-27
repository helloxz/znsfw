# AGENTS.md

## 目的

本文件为在此仓库中工作的智能编码代理提供操作说明。
除非用户明确要求，否则请优先遵循这里的约定。

## 仓库概况

- 运行时：Bun
- 语言：TypeScript
- Web 框架：Hono
- 入口文件：`src/index.ts`
- 路由汇总：`src/routers.ts`
- API 处理器：`src/api/*.ts`
- 包管理器：Bun（已提交 `bun.lock`）

## 规则文件

当前仓库中不存在以下规则文件：

- `.cursorrules`
- `.cursor/rules/`
- `.github/copilot-instructions.md`

不要假设存在其他 Cursor 或 Copilot 专用规则。

## 当前项目状态

- `package.json` 目前只有 `dev` 脚本。
- 还没有独立的 `build`、`lint`、`test` 脚本。
- 仓库中没有 ESLint、Prettier、Vitest、Jest、Playwright 配置。
- `tsconfig.json` 开启了 `strict: true`。
- 当前仓库里没有已提交的测试文件。

由于自动化配置较少，验证时优先直接使用 Bun 命令。

## 安装与运行

- 安装依赖：`bun install`
- 启动开发服务：`bun run dev`
- 等价运行方式：`bun run --hot src/index.ts`

当前 Bun 服务监听端口为 `6086`。

## 构建命令

`package.json` 里没有构建脚本，直接使用 Bun bundler：

- 构建服务端产物：`bun build --target=bun --outfile dist/index.js src/index.ts`

说明：

- `dist/` 是生成目录。
- 如果只是为了验证构建，完成后可删除 `dist/`，除非用户要求保留。

## Lint 与静态检查

当前仓库没有 lint 命令。
静态检查以 TypeScript 类型检查为主：

- 类型检查：`bunx tsc --noEmit --pretty false`

如果以后仓库新增正式 lint 命令，优先使用仓库自带命令。

## 测试命令

虽然当前没有测试文件，但可以直接使用 Bun 测试运行器。
如果你新增了测试，优先使用以下命令：

- 运行全部测试：`bun test`
- 没有测试时也返回成功：`bun test --pass-with-no-tests`
- 运行单个测试文件：`bun test src/api/url_check.test.ts`
- 运行多个测试文件：`bun test src/api/url_check.test.ts src/routers.test.ts`
- 按测试名称运行：`bun test --test-name-pattern "hello route"`
- 在单个文件中运行指定名称的测试：`bun test src/api/url_check.test.ts --test-name-pattern "hello route"`
- 生成覆盖率：`bun test --coverage`

## 推荐验证流程

### 小型 TypeScript 修改

1. `bunx tsc --noEmit --pretty false`

### 有行为变更且已存在测试时

1. 运行相关测试：`bun test ...`
2. 运行类型检查：`bunx tsc --noEmit --pretty false`
3. 如涉及启动或打包，再运行构建命令

### 涉及路由或启动流程时

1. `bunx tsc --noEmit --pretty false`
2. `bun build --target=bun --outfile dist/index.js src/index.ts`

## 架构说明

- `src/index.ts` 创建根 Hono 应用并挂载路由。
- `src/routers.ts` 定义顶层路由。
- `src/api/` 目录放具体请求处理逻辑。
- 启动代码应尽量轻量，业务逻辑放到 `src/api/`。
- 处理器尽量小而专注，优先返回结构化 JSON。

## 代码风格

### 格式

- 使用 TypeScript，并保持严格类型安全。
- 使用 4 空格缩进。
- 优先使用单引号。
- 不写分号，以保持与现有代码一致。
- 一行只写一条语句。
- 逻辑块之间保留一个空行。
- 编辑多行对象或数组时，保留尾随逗号风格。
- 不要随意加注释，只有在逻辑不直观时才添加。

### 导入

- 外部依赖放在本地导入前面。
- 保持导入分组清晰，不要加装饰性注释。
- 类型导入使用 `import type`。
- 可复用的处理器或工具优先使用具名导出与具名导入。
- 只有在文件已采用默认导出，或模块确实只有一个主导出时，才使用默认导出。
- 相对路径保持简短，不要自行引入路径别名。

### 类型

- 不要削弱 `strict` 设置。
- 避免 `any`，优先使用明确类型、联合类型、泛型，或 `unknown` 后再收窄。
- 在模块边界处，必要时补充明确的参数和返回类型。
- 在 Hono 处理器中显式标注上下文类型。
- 使用请求参数、查询参数、请求头、请求体前先校验。
- 使用可空值或可选值前先收窄。

### 命名

- 变量、函数、局部常量使用 `camelCase`。
- 类型、接口、类使用 `PascalCase`。
- 真正常量和环境变量使用 `UPPER_SNAKE_CASE`。
- 文件名保持小写。
- 多单词文件名优先使用 `snake_case`，与 `src/api/url_check.ts` 保持一致。
- 处理器名称应体现行为含义，避免泛化命名如 `handler`。

### 路由与 API

- `src/index.ts` 只保留最小启动逻辑。
- 路由注册放在 `src/routers.ts`。
- 请求处理逻辑放在 `src/api/`。
- 路由路径保持明确、稳定、一致。
- API 返回值优先使用可预测的 JSON 对象，而不是裸字符串或裸原始值。
- 响应字段默认使用英文，除非用户明确要求其他语言。
- 中间件尽量放在其实际作用的路由附近，除非它是全局中间件。

### 错误处理

- 不要静默吞掉错误。
- 尽早校验输入，并返回清晰的客户端错误信息。
- 使用合适的 HTTP 状态码。
- 区分客户端错误和服务端错误。
- 不要在响应中暴露堆栈或内部实现细节。
- 对可能抛出异常的边界逻辑，捕获后转换为安全的 JSON 响应。

### 依赖与项目卫生

- 优先采用 Bun 原生工作流。
- 没有明确必要时不要新增依赖。
- 优先使用小而直接、与框架风格一致的工具，而不是大型抽象层。
- 不要擅自往 `package.json` 添加脚本，除非用户要求。
- 不要擅自新增 lint 或格式化配置，除非任务要求。
- 如果新增测试，将测试放在代码附近或放在统一且清晰的位置。
- 如果在文档中写入命令，先确认命令在当前仓库中可用。

## 给代理的编辑建议

- 改代码前先读相邻文件，优先遵循仓库已有模式。
- 修改文件时，可以顺手修复低风险的局部格式问题。
- 尽量做最小改动，保持当前结构稳定。
- 除非用户要求，不要随意改变 API 响应结构。
- 要诚实说明仓库当前缺少哪些自动化能力，不要假装已有 lint 或测试体系。

## 已知缺口

- 还没有正式的 lint 任务。
- 还没有已提交的自动化测试。
- 代码格式主要依赖现有文件风格，而不是工具强制执行。

如无特殊要求，优先选择：最小改动、严格类型、Bun/Hono 原生方案。
