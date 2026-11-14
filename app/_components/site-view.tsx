import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import MusicToggle from "@/app/_components/music-toggle";
import NightScene from "@/app/_components/night-scene";
import ShareDialog from "@/app/_components/share-dialog";
import SocialIcon from "@/app/_components/social-icon";
import type { SiteContent } from "@/lib/content";
import { DEFAULT_MUSIC_URL, resolveMediaUrl } from "@/lib/media";
import { SOCIAL_NETWORKS } from "@/lib/socials";

export const DEFAULT_LOGO = "/overcity/logo-overcity.png";

// Botón automático por categoría con productos visibles (SPEC 07): no es un LinkItem.
export type CatalogCategoryButton = {
  id: string;
  name: string;
  count: number;
  cover: string; // URL de la portada del primer producto visible
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red";

const NEON_TURN_SECONDS = 5; // turno de cada botón
const NEON_ON_SECONDS = 4.4; // tiempo encendido dentro del turno

// Con N botones cada uno se ilumina por turnos; el ciclo dura N × 5 s. Con 1 solo queda encendido.
function neonKeyframes(count: number) {
  if (count < 2) return "";
  const eps = 0.01;
  return Array.from({ length: count }, (_, i) => {
    const start = ((i * NEON_TURN_SECONDS) / (count * NEON_TURN_SECONDS)) * 100;
    const end = ((i * NEON_TURN_SECONDS + NEON_ON_SECONDS) / (count * NEON_TURN_SECONDS)) * 100;
    const on = `${start.toFixed(3)}%,${end.toFixed(3)}%{opacity:1}`;
    const before = i === 0 ? "" : `0%,${(start - eps).toFixed(3)}%{opacity:0}`;
    const after = `${(end + eps).toFixed(3)}%,100%{opacity:0}`;
    return `@keyframes neon-turn-${count}-${i}{${before}${on}${after}}`;
  }).join("");
}

function neonStyle(count: number, index: number): CSSProperties | undefined {
  if (count < 2) return undefined;
  return {
    animation: `neon-turn-${count}-${index} ${count * NEON_TURN_SECONDS}s linear infinite`,
  };
}

const linkButtonClass = `catalog-neon block w-full rounded-full border border-border-soft bg-black/30 px-6 py-4 text-center text-base font-semibold text-white shadow-sm backdrop-blur-md transition-all duration-300 motion-safe:hover:-translate-y-1 hover:border-theme-red hover:bg-theme-red/20 hover:shadow-[0_0_15px_rgba(216,26,33,0.3)] ${focusRing}`;

// Contenido del botón: trazo de neón en el perímetro y texto.
function LinkButtonInner({
  label,
  style,
}: {
  label: string;
  style: CSSProperties | undefined;
}) {
  return (
    <>
      <svg
        className="neon-outline-svg"
        viewBox="0 0 400 74"
        preserveAspectRatio="none"
        aria-hidden="true"
        focusable="false"
        style={style}
      >
        <rect x="2" y="2" width="396" height="70" rx="35" pathLength="100" />
      </svg>
      <span className="catalog-label">{label}</span>
    </>
  );
}

export default function SiteView({
  content,
  catalogLabel = null,
  catalogCategories = [],
}: {
  content: SiteContent;
  // Título del catálogo: si viene, se muestra el botón automático hacia /catalogo en primer lugar.
  catalogLabel?: string | null;
  // Categorías con al menos un producto visible: un botón cada una, bajo el del catálogo.
  catalogCategories?: CatalogCategoryButton[];
}) {
  const catalogOffset = catalogLabel ? 1 : 0;
  const linkCount = content.links.length + catalogOffset;
  const musicUrl = resolveMediaUrl(content.music, DEFAULT_MUSIC_URL);

  return (
    <>
      <NightScene background={content.background} effectsEnabled={content.effectsEnabled} />
      {musicUrl && <MusicToggle key={musicUrl} src={musicUrl} />}
      {linkCount > 1 && <style>{neonKeyframes(linkCount)}</style>}

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center px-4 pb-10 pt-16">
        <ShareDialog />

        <header className="mt-4 flex w-full flex-col items-center justify-center text-center">
          <Image
            src={content.logoUrl ?? DEFAULT_LOGO}
            alt={`Logo de ${content.brandName}`}
            width={710}
            height={257}
            unoptimized
            priority
            className="h-20 w-auto max-w-full object-contain drop-shadow-[0_0_12px_rgba(216,26,33,0.48)]"
          />
        </header>

        <section className="mb-12 mt-10 flex w-full flex-col items-center gap-5">
          <h2 className="premium-heading w-full text-lg font-semibold text-white">
            <span className="oni-mask" aria-hidden="true">👺</span>
            <span>{content.sectionTitle}</span>
            <span className="oni-mask" aria-hidden="true">👹</span>
          </h2>
          <ul className="flex w-full flex-col gap-4">
            {catalogLabel && (
              <li>
                <Link href="/catalogo" className={linkButtonClass}>
                  <LinkButtonInner label={catalogLabel} style={neonStyle(linkCount, 0)} />
                </Link>
              </li>
            )}
            {catalogLabel &&
              catalogCategories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/catalogo?categoria=${category.id}`}
                    className={`grid grid-cols-[48px_1fr_48px] items-center gap-2 rounded-full border border-white/70 bg-black/30 p-1.5 text-[15px] font-bold text-white backdrop-blur-md transition-all duration-300 motion-safe:hover:-translate-y-1 hover:border-theme-red hover:shadow-[0_0_15px_rgba(216,26,33,0.3)] ${focusRing}`}
                  >
                    <Image
                      src={category.cover}
                      alt=""
                      width={96}
                      height={96}
                      unoptimized
                      className="size-12 rounded-full object-cover"
                    />
                    <span className="min-w-0 truncate text-center">{category.name}</span>
                    <span className="pr-1 text-center text-xs font-medium text-white/65">
                      {category.count}
                    </span>
                  </Link>
                </li>
              ))}
            {content.links.map((link, index) => (
              <li key={link.id}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkButtonClass}
                >
                  <LinkButtonInner
                    label={link.label}
                    style={neonStyle(linkCount, index + catalogOffset)}
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>

        {content.socials.length > 0 && (
          <section className="mt-auto flex w-full flex-col items-center gap-4">
            <h2 className="text-base font-semibold text-white">{content.socialsTitle}</h2>
            <ul className="flex flex-wrap items-center justify-center gap-4">
              {content.socials.map((social) => {
                const { label, mailto } = SOCIAL_NETWORKS[social.network];
                return (
                  <li key={social.id}>
                    <a
                      href={social.url}
                      {...(mailto ? {} : { target: "_blank", rel: "noopener noreferrer" })}
                      aria-label={label}
                      className={`block rounded-full p-2 text-theme-red drop-shadow-lg transition-transform duration-300 hover:text-white motion-safe:hover:scale-125 ${focusRing}`}
                    >
                      <SocialIcon network={social.network} className="size-8" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
