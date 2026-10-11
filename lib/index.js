/**
 * dsh-ui-subagent-model host entry.
 *
 * Routes every subagent request to the user-chosen model through the
 * agent/request waterfall, exposes an authenticated /subagent-model JSON
 * channel with the available provider/model routes, and contributes a
 * prompt section telling the model what its children run on.
 */
import { readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/** Cordis plugin identity. */
export const name = "subagent-model";

//#region state
class SubagentModelState {
	constructor(path) {
		this.path = path;
		this.enabled = false;
		this.provider = "";
		this.model = "";
	}

	load() {
		try {
			const parsed = JSON.parse(readFileSync(this.path, "utf8"));
			this.enabled = parsed?.enabled === true;
			this.provider = typeof parsed?.provider === "string" ? parsed.provider : "";
			this.model = typeof parsed?.model === "string" ? parsed.model : "";
		} catch {}
	}

	async persist() {
		const body = JSON.stringify({ enabled: this.enabled, provider: this.provider, model: this.model }, null, "\t") + "\n";
		const temp = `${this.path}.tmp-${randomBytes(4).toString("hex")}`;
		await mkdir(dirname(this.path), { recursive: true });
		await writeFile(temp, body, "utf8");
		await rename(temp, this.path);
	}

	/** The override applies only with a complete route. */
	get active() {
		return this.enabled && this.provider !== "" && this.model !== "";
	}
}
//#endregion

//#region prompt
/** Tell the model what its children run on. */
function renderSection(state) {
	if (!state.active) return "";
	return [
		"## Subagent model routing",
		"",
		`By user configuration, every subagent you spawn runs on ${state.provider}/${state.model}, regardless of the model this conversation itself uses. Assume children have that model's capabilities, speed, and cost profile. If a task needs a different model, tell the user instead of assuming children share yours.`,
		"This rule is user-owned; a subagent explicitly selecting a different route is overridden by it.",
	].join("\n");
}
//#endregion

//#region rpc
function readBody(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > 1024 * 1024) { reject(new Error("request body too large")); req.destroy(); return; }
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
		req.on("error", reject);
	});
}

function makeRpcRouteHandler(connectionCtx, handle) {
	return async (req, res) => {
		const write = (status, body) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8" }); res.end(JSON.stringify(body)); };
		try {
			const admission = connectionCtx.connection.admit(req);
			if ("rejection" in admission) { res.writeHead(admission.rejection); res.end(admission.rejection === 401 ? "unauthorized" : "forbidden"); return; }
			if (req.method !== "POST") { write(405, { error: "method not allowed" }); return; }
			if ((req.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") { write(415, { error: "content type must be application/json" }); return; }
			let message;
			try { message = JSON.parse(await readBody(req)); } catch { write(400, { error: "body is not JSON" }); return; }
			if (message === null || typeof message !== "object" || message.type !== "client-request" || typeof message.rpcId !== "string" || message.rpcId === "" || typeof message.method !== "string") {
				write(400, { type: "server-response", rpcId: "invalid-request", result: { ok: false, error: { code: "gateway/bad-request", message: "invalid client-request message" } } });
				return;
			}
			const result = await handle(message.method, message.payload ?? {});
			write(200, { type: "server-response", rpcId: message.rpcId, result });
		} catch (error) {
			write(500, { error: `rpc failure: ${String(error instanceof Error ? error.message : error)}` });
		}
	};
}
//#endregion

//#region body
/** Collect the provider/model routes the settings documents advertise. */
function collectRoutes(settings) {
	const routes = [];
	try {
		for (const descriptor of settings.describe({ redactSecrets: true })) {
			const providers = descriptor?.user?.providers;
			if (providers === null || typeof providers !== "object") continue;
			for (const [providerId, profile] of Object.entries(providers)) {
				const models = profile?.models;
				if (!Array.isArray(models)) continue;
				for (const model of models) {
					if (typeof model?.id !== "string" || model.id === "") continue;
					routes.push({ provider: providerId, model: model.id, name: typeof model.name === "string" && model.name !== "" ? model.name : model.id });
				}
			}
		}
	} catch {}
	return routes;
}

export function apply(ctx) {
	const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
	const state = new SubagentModelState(join(home, "subagent-model.json"));
	state.load();

	ctx.on("agent/request", async (payload, next) => {
		const config = await next();
		try {
			if (!state.active) return config;
			const origin = payload?.agent?.session?.header?.origin;
			if (origin !== "subagent") return config;
			if (typeof config !== "object" || config === null) return config;
			if (config.provider === state.provider && config.model === state.model) return config;
			return { ...config, provider: state.provider, model: state.model };
		} catch (error) {
			ctx.logger?.warn?.("subagent-model: override failed: %s", String(error?.message ?? error));
			return config;
		}
	}, { global: true });

	ctx.systemPrompt.section({
		name: "subagent-model",
		order: 9450,
		text: () => renderSection(state),
	});

	const handleRpc = async (endpoint, payload) => {
		try {
			switch (endpoint) {
				case "get":
					return { ok: true, value: { enabled: state.enabled, provider: state.provider, model: state.model, active: state.active } };
				case "routes": {
					const routes = ctx.settings !== undefined ? collectRoutes(ctx.settings) : [];
					return { ok: true, value: { routes, active: state.active, enabled: state.enabled, provider: state.provider, model: state.model } };
				}
				case "set": {
					if (payload === null || typeof payload !== "object") return { ok: false, error: { code: "subagent-model/invalid", message: "payload must be an object" } };
					if (typeof payload.enabled === "boolean") state.enabled = payload.enabled;
					if (typeof payload.provider === "string") state.provider = payload.provider.trim();
					if (typeof payload.model === "string") state.model = payload.model.trim();
					if (state.provider === "" || state.model === "") state.enabled = false;
					await state.persist();
					return { ok: true, value: { enabled: state.enabled, provider: state.provider, model: state.model, active: state.active } };
				}
				default:
					return { ok: false, error: { code: "subagent-model/unknown-endpoint", message: `unknown endpoint ${String(endpoint)}` } };
			}
		} catch (error) {
			return { ok: false, error: { code: "subagent-model/failed", message: error instanceof Error ? error.message : String(error) } };
		}
	};

	ctx.inject(["connection", "webServer"], (rpcCtx) => {
		rpcCtx.webServer.register({ kind: "prefix", path: "/subagent-model", handler: makeRpcRouteHandler(rpcCtx, handleRpc) });
	});

	ctx.logger?.info?.("subagent-model: store at %s, active=%s", state.path, String(state.active));
}
//#endregion
