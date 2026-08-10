function requiredPublicEnvironment(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing required public environment variable: ${name}`);
  }

  return value;
}

export function getSupabasePublicConfig() {
  return {
    // NEXT_PUBLIC_* variables must use literal property access so Next.js can
    // replace them in the browser bundle during the production build.
    url: requiredPublicEnvironment(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: requiredPublicEnvironment(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    )
  };
}
