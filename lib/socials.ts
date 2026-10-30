export type SocialNetwork =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "whatsapp"
  | "youtube"
  | "x"
  | "telegram"
  | "email"
  | "web";

// Catálogo fijo; el orden es el del selector del panel.
export const SOCIAL_NETWORKS: Record<SocialNetwork, { label: string; mailto?: boolean }> = {
  instagram: { label: "Instagram" },
  facebook: { label: "Facebook" },
  tiktok: { label: "TikTok" },
  whatsapp: { label: "WhatsApp" },
  youtube: { label: "YouTube" },
  x: { label: "X" },
  telegram: { label: "Telegram" },
  email: { label: "Email", mailto: true },
  web: { label: "Web" },
};

export const SOCIAL_NETWORK_IDS = Object.keys(SOCIAL_NETWORKS) as SocialNetwork[];

export function isSocialNetwork(value: unknown): value is SocialNetwork {
  return typeof value === "string" && value in SOCIAL_NETWORKS;
}
