# dsh-ui-subagent-model

DSH（DeepSeek Harness）子智能体模型路由插件：会话头部一个按钮选择所有子智能体统一使用的模型（便宜模型跑简单任务），
通过 `agent/request` 钩子对每个子代理请求生效，并注入系统提示告诉模型其子代理运行在什么模型上、能力边界如何。

## 功能

- **用户选择**：头部「子代理：模型」按钮，弹出菜单列出所有已配置的 provider/model 路由，一键选定
- **统一路由**：`agent/request` 全局钩子把 `origin === "subagent"` 的请求改写为选定路由（保留 effort/maxTokens 等其余字段）
- **上下文注入**：系统提示 `## Subagent model routing` 小节告诉模型子代理实际运行的模型、提醒它不要假设子代理与自己同模型
- **可关闭**：菜单底部「跟随主模型」一键关闭覆盖，子代理恢复继承父模型
- **持久化**：状态存 `~/.dsh/subagent-model.json`

## 与内建模型选择的区别

DSH 内建的 `modelSelectionSettings`（设置 → 插件 → Subagent）让 **AI** 在每次调用时自己选模型；
本插件是**用户**视角的统一默认。两者叠加时本插件覆盖 AI 的显式选择——需要 AI 自主选择时请从菜单关闭覆盖。

## 安装

```sh
pnpm add github:yuexusi/dsh-ui-subagent-model
```

再加进 profile `dsh.profile.bundles`，重启 `dsh web`。

## 开发

```sh
node test/host.mjs   # 宿主全流程（钩子/注入/RPC/持久化）
```

## 许可

[MIT](LICENSE)
