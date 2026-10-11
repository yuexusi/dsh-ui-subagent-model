window.__ModuleLoader__.load({
	id: "dsh-ui-subagent-model",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const { useState, useEffect, useCallback, useRef } = react;
		const h = (type, props, ...children) => react.createElement(type, props, ...children.flat());
		const cx = (...names) => names.filter(Boolean).join(" ");

		//#region locales
		const NS = "subagent-model";
		const zh = {
			"button.label": "子代理：{model}",
			"button.disabled": "子代理：跟随主模型",
			"button.title": "选择子智能体使用的模型",
			"menu.pick": "选择模型",
			"menu.follow": "跟随主模型（关闭覆盖）",
			"menu.loading": "加载中…",
			"menu.empty": "没有可用模型",
			"error.title": "操作失败",
		};
		const en = {
			"button.label": "Subagents: {model}",
			"button.disabled": "Subagents: follow parent",
			"button.title": "Choose the model subagents use",
			"menu.pick": "Pick a model",
			"menu.follow": "Follow parent model (override off)",
			"menu.loading": "Loading…",
			"menu.empty": "No models available",
			"error.title": "Action failed",
		};
		//#endregion

		//#region rpc
		let rpcCounter = 0;
		async function rpcCall(endpoint, payload) {
			const response = await fetch(`subagent-model/${endpoint}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ type: "client-request", rpcId: `sm-${(rpcCounter += 1)}`, method: endpoint, payload: payload ?? {} }),
			});
			const body = await response.json().catch(() => null);
			const result = body?.result;
			if (result?.ok === true) return result.value;
			throw new Error(result?.error?.message ?? `rpc ${endpoint} failed (${String(response.status)})`);
		}
		//#endregion

		//#region css
		const css =
			".smA3_root{position:relative;flex:none}" +
			".smA3_button{border-radius:var(--dsw-radius-sm);height:24px;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:var(--dsw-font-xxs-12);background:0 0;border:0;flex:none;align-items:center;gap:5px;padding:0 8px;display:inline-flex}" +
			".smA3_button:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}" +
			".smA3_button:focus-visible{outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}" +
			".smA3_menu{z-index:30;box-shadow:var(--dsw-elevation-panel);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);flex-direction:column;gap:2px;min-width:220px;max-height:320px;padding:6px;position:absolute;top:28px;right:0;display:flex;overflow:auto}" +
			".smA3_menuTitle{color:var(--dsw-alias-label-tertiary);font:600 11px/16px var(--ds-font-family);user-select:none;padding:4px 8px 2px}" +
			".smA3_item{border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:0;align-items:center;justify-content:space-between;font:var(--dsw-font-xxs-12);padding:5px 8px;display:flex;width:100%;text-align:left}" +
			".smA3_item:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}" +
			".smA3_itemActive{color:var(--dsw-alias-state-business-primary)}" +
			".smA3_itemMeta{color:var(--dsw-alias-label-caption);font:10px/14px var(--ds-font-family-code);margin-left:8px;flex:none}" +
			".smA3_error{color:var(--dsw-alias-state-error-primary);font:11px/16px var(--ds-font-family);padding:2px 8px}";
		const cssTagId = "dsh-ui-subagent-model/styles.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(cssTagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-ui-subagent-model";
			tag.dataset.pluginCss = cssTagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		//#region view
		function SubagentModelButton({ t }) {
			const [open, setOpen] = useState(false);
			const [state, setState] = useState(null);
			const [routes, setRoutes] = useState(null);
			const [error, setError] = useState(null);
			const [busy, setBusy] = useState(false);
			const rootRef = useRef(null);

			const refresh = useCallback(async () => {
				try {
					const value = await rpcCall("routes", {});
					setState(value);
					setRoutes(value.routes ?? []);
					setError(null);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			}, []);

			useEffect(() => { void refresh(); }, [refresh]);
			useEffect(() => {
				if (open !== true) return;
				const onDocClick = (event) => {
					if (rootRef.current !== null && event.target instanceof Node && rootRef.current.contains(event.target) === false) setOpen(false);
				};
				document.addEventListener("mousedown", onDocClick);
				return () => document.removeEventListener("mousedown", onDocClick);
			}, [open]);

			const pick = useCallback(async (route) => {
				setBusy(true);
				try {
					const value = await rpcCall("set", { enabled: true, provider: route.provider, model: route.model });
					setState(value);
					setOpen(false);
					setError(null);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(false);
				}
			}, []);

			const disable = useCallback(async () => {
				setBusy(true);
				try {
					const value = await rpcCall("set", { enabled: false });
					setState(value);
					setOpen(false);
					setError(null);
				} catch (cause) {
					setError(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setBusy(false);
				}
			}, []);

			const label = state === null ? "…" : state.active === true
				? t("button.label", { model: state.model })
				: t("button.disabled");
			return h("div", { className: cx("smA3_root"), ref: rootRef },
				h("button", { className: cx("smA3_button"), type: "button", title: t("button.title"), onClick: () => setOpen(!open) }, label, "▾"),
				open === true ? h("div", { className: cx("smA3_menu") },
					h("div", { className: cx("smA3_menuTitle") }, t("menu.pick")),
					routes === null ? h("div", { className: cx("smA3_menuTitle") }, t("menu.loading")) : null,
					routes !== null && routes.length === 0 ? h("div", { className: cx("smA3_menuTitle") }, t("menu.empty")) : null,
					(routes ?? []).map((route) =>
						h("button", {
							key: route.provider + "/" + route.model,
							className: cx("smA3_item", state?.active === true && state.provider === route.provider && state.model === route.model && "smA3_itemActive"),
							type: "button",
							disabled: busy,
							onClick: () => { void pick(route); },
						},
							h("span", null, route.name),
							h("span", { className: cx("smA3_itemMeta") }, route.provider),
						)),
					h("button", { className: cx("smA3_item"), type: "button", disabled: busy, onClick: () => { void disable(); } }, t("menu.follow")),
					error !== null ? h("div", { className: cx("smA3_error") }, t("error.title"), "：", error) : null,
				) : null,
			);
		}
		//#endregion

		//#region registration
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "subagent-model: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("conversation.session.header.actions", () =>
				ctx.slots.register({
					name: "conversation.session.header.actions",
					id: "subagent-model",
					order: 30,
					locale: NS,
					label: () => t("button.title"),
				}, SubagentModelButton),
			);
		}
		exports.apply = apply;
		exports.inject = inject;
		exports.__internals = { SubagentModelButton, rpcCall };
		return module.exports;
	},
});
