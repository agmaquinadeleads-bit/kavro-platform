// Validação de filtros vindos de searchParams (query string), compartilhada
// entre /app/leads e /app/pipeline. Mesmo padrão já usado em leads/page.tsx:
// nunca confiar em input bruto do usuário para montar queries no Supabase.

export function validateDateFormat(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return null;
  const date = new Date(dateStr + "T00:00:00");
  if (isNaN(date.getTime())) return null;
  return dateStr;
}

export function validateUUID(id: string | undefined): string | null {
  if (!id) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id) ? id : null;
}

export function validateSearchString(search: string | undefined): string | null {
  if (!search) return null;
  const trimmed = search.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return null;
  return trimmed;
}
