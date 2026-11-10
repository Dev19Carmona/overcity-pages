import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import MusicToggle from "@/app/_components/music-toggle";
import NightScene from "@/app/_components/night-scene";
import ShareDialog from "@/app/_components/share-dialog";
import SocialIcon from "@/app/_components/social-icon";
import type { LinkItem, SiteContent, SocialItem } from "@/lib/content";
import { SOCIAL_NETWORKS } from "@/lib/socials";

export const DEFAULT_LOGO = "/overcity/logo-overcity.png";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-theme-red";

const NEON_TURN_SECONDS = 5; // turno de cada botón
const NEON_ON_SECONDS = 4.4; // tiempo encendido dentro del turno

// Reemplazos opcionales que usa el editor del panel; la página pública no pasa ninguno.
export type SiteViewSlots = {
  logo?: ReactNode;
  brandName?: ReactNode;
  sectionTitle?: ReactNode;
  link?: (link: LinkItem, index: number) => ReactNode;
  afterLinks?: ReactNode;
  socialsTitle?: ReactNode;
  social?: (social: SocialItem, index: number) => ReactNode;
  afterSocials?: ReactNode;
};

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

export default function SiteView({
  content,
  slots = {},
  editing = false,
}: {
  content: SiteContent;
  slots?: SiteViewSlots;
  editing?: boolean;
}) {
  // Sin redes, la sección solo se ve en el editor para poder agregar la primera.
  const showSocials = editing || content.socials.length > 0;
  const linkCount = content.links.length;

  return (
    <>
      <NightScene />
      <MusicToggle />
      {!editing && linkCount > 1 && <style>{neonKeyframes(linkCount)}</style>}

      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center px-4 pb-10 pt-16">
        {!editing && <ShareDialog />}

        <header className="mt-4 flex w-full flex-col items-center justify-center text-center">
          {slots.logo ?? (
            <Image
              src={content.logoUrl ?? DEFAULT_LOGO}
              alt={`Logo de ${content.brandName}`}
              width={710}
              height={257}
              unoptimized
              priority
              className="h-20 w-auto max-w-full object-contain drop-shadow-[0_0_12px_rgba(216,26,33,0.48)]"
            />
          )}
          {slots.brandName}
        </header>

        <section className="mb-12 mt-10 flex w-full flex-col items-center gap-5">
          <h2 className="premium-heading w-full text-lg font-semibold text-white">
            <span className="oni-mask" aria-hidden="true">👺</span>
            {slots.sectionTitle ?? <span>{content.sectionTitle}</span>}
            <span className="oni-mask" aria-hidden="true">👹</span>
          </h2>
          <ul className="flex w-full flex-col gap-4">
            {content.links.map((link, index) => (
              <li key={link.id}>
                {slots.link ? (
                  slots.link(link, index)
                ) : (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`catalog-neon block w-full rounded-full border border-border-soft bg-black/30 px-6 py-4 text-center text-base font-semibold text-white shadow-sm backdrop-blur-md transition-all duration-300 motion-safe:hover:-translate-y-1 hover:border-theme-red hover:bg-theme-red/20 hover:shadow-[0_0_15px_rgba(216,26,33,0.3)] ${focusRing}`}
                  >
                    <svg
                      className="neon-outline-svg"
                      viewBox="0 0 400 74"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                      focusable="false"
                      style={neonStyle(linkCount, index)}
                    >
                      <rect x="2" y="2" width="396" height="70" rx="35" pathLength="100" />
                    </svg>
                    <span className="catalog-label">{link.label}</span>
                  </a>
                )}
              </li>
            ))}
          </ul>
          {slots.afterLinks}
        </section>

        {showSocials && (
          <section className="mt-auto flex w-full flex-col items-center gap-4">
            {slots.socialsTitle ?? (
              <h2 className="text-base font-semibold text-white">{content.socialsTitle}</h2>
            )}
            {/* Siempre en fila horizontal, también en el editor. */}
            <ul className="flex flex-wrap items-center justify-center gap-4">
              {content.socials.map((social, index) => {
                const { label, mailto } = SOCIAL_NETWORKS[social.network];
                return (
                  <li key={social.id}>
                    {slots.social ? (
                      slots.social(social, index)
                    ) : (
                      <a
                        href={social.url}
                        {...(mailto
                          ? {}
                          : { target: "_blank", rel: "noopener noreferrer" })}
                        aria-label={label}
                        className={`block rounded-full p-2 text-theme-red drop-shadow-lg transition-transform duration-300 hover:text-white motion-safe:hover:scale-125 ${focusRing}`}
                      >
                        <SocialIcon network={social.network} className="size-8" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
            {slots.afterSocials}
          </section>
        )}
      </main>
    </>
  );
}
