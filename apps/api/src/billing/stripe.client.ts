import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import Stripe from "stripe";

// Wrapper fino, mesmo padrão de EvolutionClient/MetaWhatsappClient (uma
// classe por provedor externo) — instancia o SDK só quando precisa, pra
// não derrubar o boot da API se STRIPE_SECRET_KEY ainda não estiver
// configurada (mesmo raciocínio de "não configurado ainda" já usado em
// EvolutionConnectionService.isConfigured()).
@Injectable()
export class StripeClient {
  private instance: Stripe | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  }

  get sdk(): Stripe {
    if (this.instance) return this.instance;
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) throw new ServiceUnavailableException("Stripe não configurado");
    this.instance = new Stripe(secretKey);
    return this.instance;
  }
}
