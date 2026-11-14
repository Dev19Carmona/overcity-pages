import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import NightScene from "@/app/_components/night-scene";
import type { SiteContent } from "@/lib/content";

const DEFAULT_LOGO = "/overcity/logo-overcity.png";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-theme-red";

// Ancho de la tienda (SPEC 07): hasta 1240 px, con el mismo relleno lateral que el diseño.
export const STORE_WIDTH =
  "mx-auto w-full max-w-[1240px] px-[clamp(14px,3vw,32px)]";

function navClass(active: boolean) {
  return `rounded-full border px-3.5 py-[7px] text-[13px] font-semibold text-white transition hover:border-theme-red ${focusRing} ${
    active ? "border-theme-red bg-theme-red/20" : "border-transparent"
  }`;
}

// Fondo y efectos de SiteContent más el encabezado fijo de la tienda (logo, marca y navegación).
// Sin bolsa ni candado de admin: eso queda para otros specs.
export default function StoreShell({
  content,
  catalogTitle,
  active,
  children,
}: {
  content: SiteContent;
  catalogTitle: string;
  active: "catalog" | null;
  children: ReactNode;
}) {
  return (
    <>
      <NightScene background={content.background} effectsEnabled={content.effectsEnabled} />
      <div className="relative z-10 flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border-soft bg-theme-navy/75 backdrop-blur-[14px]">
          <div className={`${STORE_WIDTH} flex h-[59px] items-center gap-2.5`}>
            <Link
              href="/"
              aria-label={`Inicio de ${content.brandName}`}
              className={`flex min-w-0 items-center gap-2.5 ${focusRing}`}
            >
              <Image
                src={content.logoUrl ?? DEFAULT_LOGO}
                alt=""
                width={710}
                height={257}
                unoptimized
                priority
                className="h-8 w-auto max-w-[110px] shrink-0 object-contain drop-shadow-[0_0_12px_rgba(216,26,33,0.48)]"
              />
              <span className="hidden truncate text-[17px] font-extrabold tracking-[.04em] min-[420px]:inline">
                {content.brandName}
              </span>
            </Link>
            <nav aria-label="Tienda" className="ml-[clamp(0px,2vw,24px)] flex gap-1">
              <Link href="/" className={navClass(false)}>
                Inicio
              </Link>
              <Link
                href="/catalogo"
                aria-current={active === "catalog" ? "page" : undefined}
                className={navClass(active === "catalog")}
              >
                <span className="block max-w-[120px] truncate">{catalogTitle}</span>
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </div>
    </>
  );
}
