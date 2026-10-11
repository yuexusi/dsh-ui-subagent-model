# dsh-ui-subagent-model

Route every DSH subagent to a user-chosen model: a header picker selects the route all children use, an `agent/request` hook applies it to each subagent request, and an injected prompt section tells the model what its children run on. English | [中文](README.zh.md)

## Features

- **User choice**: a header button lists every configured provider/model route; one click pins the subagent route.
- **Uniform routing**: a global `agent/request` hook rewrites `origin === "subagent"` requests to the chosen route (other fields preserved).
- **Context injection**: a `## Subagent model routing` prompt section tells the model what its children actually run on, so it stops assuming children share its model.
- **Disable anytime**: the menu's follow-parent item restores inheritance.
- **Durable**: state persists in `~/.dsh/subagent-model.json`.

## Versus the built-in model selection

The built-in `modelSelectionSettings` (Settings → Plugins → Subagent) lets the **AI** pick per call; this plugin is the **user's** uniform default. When both are active this plugin overrides the AI's explicit choice — turn it off from the menu when you want AI autonomy.

## Install

```sh
pnpm add github:yuexusi/dsh-ui-subagent-model
```

Add to `dsh.profile.bundles`, restart `dsh web`.

## License

[MIT](LICENSE)
