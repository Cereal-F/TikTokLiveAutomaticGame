import type { ProviderKind, ProviderStatus } from "../../shared/protocol.js";

/**
 * Canal através do qual um provedor entrega dados ao servidor.
 * Os dados são brutos e não confiáveis: o pipeline os valida antes de qualquer uso.
 */
export interface ProviderSink {
  onRawEvent(raw: unknown): void;
  onStatus(status: ProviderStatus): void;
}

/**
 * Interface independente de fornecedor para fontes de eventos de live.
 * Implementações: SimulatedLiveProvider (testes locais) e TikFinityLiveProvider (WebSocket local do TikFinity).
 */
export interface LiveProvider {
  readonly kind: ProviderKind;
  start(sink: ProviderSink): void;
  stop(): void;
  status(): ProviderStatus;
}
