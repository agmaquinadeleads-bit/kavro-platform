import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { KavroSession } from "./session";

type SupabaseUser = { id?: string; email?: string };
type Membership = { org_id: string; role: "owner" | "admin" | "member" };

@Injectable()
export class KavroAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; kavroSession?: KavroSession }>();
    const match = request.headers.authorization?.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
    const accessToken = match?.[1];
    if (!accessToken) throw new UnauthorizedException("Sessão ausente");

    const baseUrl = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!baseUrl || !publishableKey) throw new ServiceUnavailableException("Autenticação da API não configurada");
    const headers = { apikey: publishableKey, authorization: `Bearer ${accessToken}` };
    const userResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/auth/v1/user`, { headers, signal: AbortSignal.timeout(8000) });
    if (!userResponse.ok) throw new UnauthorizedException("Sessão inválida");
    const user = await userResponse.json() as SupabaseUser;
    if (!user.id || !user.email) throw new UnauthorizedException("Usuário inválido");

    const membershipResponse = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/organization_members?select=org_id,role&user_id=eq.${encodeURIComponent(user.id)}&limit=1`, { headers, signal: AbortSignal.timeout(8000) });
    if (!membershipResponse.ok) throw new UnauthorizedException("Organização inválida");
    const memberships = await membershipResponse.json() as Membership[];
    const membership = memberships[0];
    if (!membership) throw new UnauthorizedException("Usuário sem organização");
    request.kavroSession = { accessToken, userId: user.id, email: user.email, organizationId: membership.org_id, role: membership.role };
    return true;
  }
}
