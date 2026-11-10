import type { SiteContent } from "@/lib/content";

export const DEFAULT_CONTENT: SiteContent = {
  brandName: "OverCity",
  tagline: "Streetwear",
  sectionTitle: "STREETWEAR",
  logoUrl: null,
  socialsTitle: "Redes sociales",
  socials: [
    {
      id: "instagram",
      network: "instagram",
      url: "https://www.instagram.com/overcitystreetwear/",
    },
  ],
  links: [
    { id: "camisas", label: "Camisas (シャツ)", href: "https://heyzine.com/flip-book/17a9864401.html" },
    { id: "camisillas", label: "Camisillas (タンクトップ)", href: "https://heyzine.com/flip-book/af8d607512.html" },
  ],
  background: { source: "default", url: null },
  music: { source: "default", url: null },
  effectsEnabled: true,
};
