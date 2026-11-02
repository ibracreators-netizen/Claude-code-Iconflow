import "server-only";
import { MCP_TOOLS, callTool } from "./tools";
import { mcpAgencyStore } from "./server-store";

const SERVER_INFO = { name: "iconflow-briefs", version: "1.0.0" };
const DEFAULT_PROTOCOL = "2025-06-18";

type RpcId = string | number | null;
export interface RpcMessage { jsonrpc?: string; id?: RpcId; method?: string; params?: Record<string, unknown> }

const ok = (id: RpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });
const fail = (id: RpcId, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

/** Traite un message JSON-RPC MCP. Renvoie l'objet réponse, ou null pour une notification (pas de réponse). */
export async function handleRpc(msg: RpcMessage): Promise<object | null> {
  const id: RpcId = msg?.id ?? null;
  const method = msg?.method;
  const params = msg?.params ?? {};
  if (typeof method !== "string") return fail(id, -32600, "Requête invalide.");
  if (method.startsWith("notifications/")) return null; // notification

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : DEFAULT_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: "Outils pour créer et lister des briefs dans les espaces clients d'IconFlow Studio.",
      });
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: MCP_TOOLS });
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string") return fail(id, -32602, "tools/call : « name » manquant.");
      const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
      try {
        const store = await mcpAgencyStore();
        const value = await callTool(store, name, args);
        const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
        return ok(id, { content: [{ type: "text", text }] });
      } catch (e) {
        return ok(id, { content: [{ type: "text", text: `Erreur : ${e instanceof Error ? e.message : String(e)}` }], isError: true });
      }
    }
    default:
      return fail(id, -32601, `Méthode inconnue : ${method}`);
  }
}
