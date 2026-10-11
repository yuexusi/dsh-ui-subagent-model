#!/usr/bin/env node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "subagent-model-test-"));
process.env.DSH_HOME = home;
const plugin = await import("../lib/index.js");
if (plugin.name !== "subagent-model") throw new Error("unexpected name");

const routes = [];
let section = null;
let requestListener = null;
const warnings = [];
let nextConfig = { provider: "w", model: "parent-model", reasoningEffort: "high" };
const overrideCalls = [];
const ctx = {
	effect: (fn) => { fn(); return () => {}; },
	inject: (_l, cb) => { cb(ctx); return () => {}; },
	systemPrompt: { section: (s) => { section = s; return () => {}; } },
	webServer: { register: (r) => { routes.push(r); return () => {}; } },
	connection: { admit: () => ({ peer: {} }) },
	settings: { describe: () => [{ user: { providers: { w: { models: [{ id: "cheap-model", name: "便宜模型" }] }, deepseek: { models: [{ id: "deepseek-v4.1", name: "V4.1" }] } } } }] },
	on: (name, listener) => { if (name === "agent/request") requestListener = listener; return () => {}; },
	logger: { info: () => {}, warn: (...a) => warnings.push(a.join(" ")) },
};
plugin.apply(ctx);
if (routes.length !== 1 || routes[0].path !== "/subagent-model") throw new Error("route missing");
if (section === null || section.name !== "subagent-model") throw new Error("section missing");
if (section.text() !== "") throw new Error("inactive state renders no section");
if (requestListener === null) throw new Error("agent/request listener missing");

// ---- agent/request waterfall behavior ----
const parentPayload = { agent: { session: { header: { origin: "main" } } } };
const childPayload = { agent: { session: { header: { origin: "subagent" } } } };
const run = async (payload) => requestListener(payload, () => Promise.resolve(nextConfig));

let config = await run(childPayload);
if (config.model !== "parent-model") throw new Error("inactive state must not override");
config = await run(parentPayload);
if (config.model !== "parent-model") throw new Error("parent requests untouched");

// enable via RPC
class FakeReq {
	constructor(body) { this.method = "POST"; this.headers = { "content-type": "application/json" }; this.body = body; }
	on(e, cb) { if (e === "data") this.dc = cb; if (e === "end") this.ec = cb; if (e === "error") setTimeout(() => { if (this.body !== undefined) this.dc?.(Buffer.from(this.body)); this.ec?.(); }, 0); return this; }
	destroy() {}
}
const drive = async (endpoint, payload) => {
	const req = new FakeReq(JSON.stringify({ type: "client-request", rpcId: "t", method: endpoint, payload: payload ?? {} }));
	const res = { status: 0, body: "" };
	res.writeHead = (s) => { res.status = s; };
	res.end = (b) => { res.body = b ?? ""; };
	await routes[0].handler(req, res);
	if (res.status !== 200) throw new Error(endpoint + " -> " + res.status + " " + res.body);
	return JSON.parse(res.body).result;
};
const enabled = await drive("set", { enabled: true, provider: "w", model: "cheap-model" });
if (enabled.value.active !== true) throw new Error("set activates");
const persisted = JSON.parse(readFileSync(join(home, "subagent-model.json"), "utf8"));
if (persisted.provider !== "w" || persisted.model !== "cheap-model") throw new Error("persisted");
if (!section.text().includes("w/cheap-model")) throw new Error("section names the route");

config = await run(childPayload);
if (config.provider !== "w" || config.model !== "cheap-model") throw new Error("subagent overridden");
if (config.reasoningEffort !== "high") throw new Error("other fields preserved");
overrideCalls.push(config.model);
config = await run(parentPayload);
if (config.model !== "parent-model") throw new Error("parent untouched while active");

const routeList = await drive("routes", {});
if (routeList.value.routes.length !== 2) throw new Error("routes from settings: " + JSON.stringify(routeList.value.routes));

const disabled = await drive("set", { enabled: false });
if (disabled.value.active !== false) throw new Error("disable");
config = await run(childPayload);
if (config.model !== "parent-model") throw new Error("disabled stops overriding");

const incomplete = await drive("set", { enabled: true, provider: "", model: "" });
if (incomplete.value.active !== false) throw new Error("incomplete route cannot activate");

console.log("ALL SUBAGENT-MODEL HOST CHECKS PASSED");
