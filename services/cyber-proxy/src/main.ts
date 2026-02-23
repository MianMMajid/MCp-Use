import * as http from "node:http";
import * as net from "node:net";
import { startGrpcServer, gracefulShutdown, mapleLog } from "@maple/common";
import { createCyberProxyService } from "./service.js";
import { checkUrl } from "./ssrf-guard.js";
import { config } from "./config.js";

const HTTP_PROXY_PORT = Number(process.env.CYBER_HTTP_PROXY_PORT ?? 8888);
const HTTP_CONNECT_PROXY_ENABLED = String(process.env.CYBER_HTTP_CONNECT_ENABLED ?? "0") === "1";

function startHttpConnectProxy() {
  const server = http.createServer((_req, res) => {
    res.writeHead(405, { "Content-Type": "text/plain" });
    res.end("Use CONNECT method for proxying.");
  });

  server.on("connect", async (req, clientSocket, head) => {
    const [hostname, portStr] = (req.url ?? "").split(":");
    const port = parseInt(portStr ?? "443", 10);

    if (!hostname) {
      clientSocket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      clientSocket.destroy();
      return;
    }

    // SSRF check before establishing tunnel
    try {
      const urlCheck = await checkUrl(`https://${hostname}:${port}`, config.allowedDomains, config.blockedDomains);
      if (!urlCheck.allowed) {
        mapleLog("warn", "http_connect_blocked", { hostname, port, reason: urlCheck.reason });
        clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        clientSocket.destroy();
        return;
      }
    } catch (err: any) {
      mapleLog("error", "http_connect_ssrf_check_failed", { hostname, port, error: err.message });
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      clientSocket.destroy();
      return;
    }

    const serverSocket = net.connect(port, hostname, () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      serverSocket.write(head);
      serverSocket.pipe(clientSocket);
      clientSocket.pipe(serverSocket);
    });

    serverSocket.on("error", (err) => {
      mapleLog("warn", "http_connect_tunnel_error", { hostname, port, error: err.message });
      clientSocket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      clientSocket.destroy();
    });

    clientSocket.on("error", () => {
      serverSocket.destroy();
    });
  });

  server.listen(HTTP_PROXY_PORT, config.host, () => {
    mapleLog("info", "http_connect_proxy_started", { port: HTTP_PROXY_PORT, host: config.host });
  });

  return server;
}

async function main() {
  mapleLog("info", "cyber_proxy_starting", { port: config.port });
  const grpcServer = createCyberProxyService();
  await startGrpcServer(grpcServer, { port: config.port, host: config.host, serviceName: "cyber-proxy" });

  // Optional legacy HTTP CONNECT proxy.
  const httpProxy = HTTP_CONNECT_PROXY_ENABLED ? startHttpConnectProxy() : null;

  gracefulShutdown(grpcServer, "cyber-proxy");
  process.on("SIGTERM", () => httpProxy?.close());
  process.on("SIGINT", () => httpProxy?.close());
}

main().catch((err) => {
  mapleLog("error", "cyber_proxy_fatal", { error: err.message });
  process.exit(1);
});
