import type { SiteContent } from "@/lib/content";

export const DEFAULT_CONTENT: SiteContent = {
  brandName: "OverCity",
  tagline: "Streetwear",
  sectionTitle: "😈 Overcity Premium 😈",
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
    { id: "camisas", label: "Camisas 😈", href: "https://heyzine.com/flip-book/17a9864401.html" },
    { id: "camisillas", label: "Camisillas 😈", href: "https://heyzine.com/flip-book/af8d607512.html" },
  ],
};
