import { MetaAuthPopup } from "@/components/meta-auth-popup";

type Props = { searchParams: Promise<{ nonce?: string }> };

export default async function MetaAuthPage({ searchParams }: Props) {
  const { nonce = "" } = await searchParams;
  return <MetaAuthPopup nonce={nonce} />;
}
