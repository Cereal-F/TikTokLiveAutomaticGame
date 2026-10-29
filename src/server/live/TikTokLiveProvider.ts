import type { ProviderStatus } from "../../shared/protocol.js";
import type { LiveProvider, ProviderSink } from "./LiveProvider.js";

export interface TikTokProviderConfig {
  /** Nome de usuário da live (não é segredo). */
  username?: string;
}

/**
 * Ponto de encaixe para o conector real do TikTok LIVE.
 *
 * Ainda NÃO há integração: não existe endpoint oficial de eventos documentado para
 * este projeto, e a escolha de biblioteca depende de verificar licença, limitações e
 * compatibilidade (ver "Próximos passos" no README). Até lá, o provedor apenas informa
 * seu estado e não emite eventos.
 */
export class TikTokLiveProvider implements LiveProvider {
  readonly kind = "tiktok" as const;

  private currentStatus: ProviderStatus = {
    kind: "tiktok",
    state: "idle",
  };

  constructor(private readonly config: TikTokProviderConfig = {}) {}

  start(sink: ProviderSink): void {
    const detail = this.config.username
      ? "Conector TikTok LIVE ainda não implementado nesta versão."
      : "Defina TIKTOK_USERNAME e aguarde a implementação do conector.";
    this.currentStatus = { kind: "tiktok", state: "not_configured", detail };
    sink.onStatus(this.currentStatus);
  }

  stop(): void {
    this.currentStatus = { kind: "tiktok", state: "idle" };
  }

  status(): ProviderStatus {
    return this.currentStatus;
  }
}
