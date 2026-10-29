import { defaultSocketUrl, ReconnectingSocket, type ConnectionState } from "../client/net/ReconnectingSocket.js";
import type { LiveEvent, LiveEventKind } from "../shared/events.js";
import type { ProviderStatus, ServerMessage } from "../shared/protocol.js";

/** Painel de controle: envia eventos fictícios ao servidor e mostra o que foi recebido. */

const MAX_LOG_LINES = 80;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`elemento #${id} não encontrado no painel`);
  return found as T;
}

const connDot = element<HTMLSpanElement>("connDot");
const connText = element<HTMLSpanElement>("connText");
const providerText = element<HTMLParagraphElement>("providerText");
const autoToggle = element<HTMLInputElement>("autoToggle");
const intervalRange = element<HTMLInputElement>("intervalRange");
const intervalLabel = element<HTMLSpanElement>("intervalLabel");
const log = element<HTMLDivElement>("log");

const CONNECTION_TEXT: Record<ConnectionState, string> = {
  connecting: "conectando...",
  open: "conectado ao servidor",
  closed: "sem conexão (tentando reconectar)",
};

function appendLog(text: string, cssClass: string): void {
  const line = document.createElement("div");
  line.className = cssClass;
  line.textContent = `${new Date().toLocaleTimeString("pt-BR")}  ${text}`;
  log.appendChild(line);
  while (log.childElementCount > MAX_LOG_LINES) log.firstElementChild?.remove();
  log.scrollTop = log.scrollHeight;
}

function describeEvent(event: LiveEvent): { text: string; cssClass: string } {
  switch (event.kind) {
    case "like":
      return { text: `[curtida] ${event.userName} +${event.count}`, cssClass: "like" };
    case "comment":
      return { text: `[comentário] ${event.userName}: ${event.text}`, cssClass: "comment" };
    case "gift":
      return {
        text: `[presente] ${event.userName} enviou ${event.giftName} (${event.diamonds})`,
        cssClass: "gift",
      };
  }
}

function renderProvider(status: ProviderStatus): void {
  const detail = status.detail ? ` - ${status.detail}` : "";
  providerText.textContent = `Provedor: ${status.kind} (${status.state})${detail}`;
}

function renderAuto(enabled: boolean): void {
  autoToggle.checked = enabled;
}

function handleServerMessage(message: ServerMessage): void {
  switch (message.type) {
    case "welcome":
      renderProvider(message.providerStatus);
      renderAuto(message.autoEnabled);
      return;
    case "status":
      renderProvider(message.providerStatus);
      renderAuto(message.autoEnabled);
      return;
    case "live:event": {
      const described = describeEvent(message.event);
      appendLog(described.text, described.cssClass);
      return;
    }
    case "error":
      appendLog(`erro do servidor: ${message.message}`, "error");
      return;
  }
}

const socket = new ReconnectingSocket({
  url: defaultSocketUrl(),
  role: "admin",
  onMessage: handleServerMessage,
  onState: (state) => {
    connDot.className = `dot ${state === "open" ? "open" : state === "closed" ? "closed" : ""}`.trim();
    connText.textContent = CONNECTION_TEXT[state];
  },
});

function sendSimulation(kind: LiveEventKind, count: number): void {
  const sent = socket.send({ type: "admin:simulate", kind, count });
  if (!sent) appendLog("sem conexão com o servidor; evento não enviado", "error");
}

for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-kind]")) {
  button.addEventListener("click", () => {
    const kind = button.dataset.kind as LiveEventKind;
    const count = Number(button.dataset.count ?? "1");
    sendSimulation(kind, Number.isInteger(count) && count > 0 ? count : 1);
  });
}

intervalRange.addEventListener("input", () => {
  intervalLabel.textContent = intervalRange.value;
});

intervalRange.addEventListener("change", () => {
  if (!autoToggle.checked) return;
  socket.send({ type: "admin:auto", enabled: true, intervalMs: Number(intervalRange.value) });
});

autoToggle.addEventListener("change", () => {
  const sent = socket.send({
    type: "admin:auto",
    enabled: autoToggle.checked,
    intervalMs: Number(intervalRange.value),
  });
  if (!sent) {
    autoToggle.checked = !autoToggle.checked;
    appendLog("sem conexão com o servidor; modo automático não alterado", "error");
  }
});

socket.start();
