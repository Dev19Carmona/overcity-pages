import Image from "next/image";
import type { ReactNode } from "react";
import ShareDialog from "@/app/_components/share-dialog";
import SocialIcon from "@/app/_components/social-icon";
import type { LinkItem, SiteContent, SocialItem } from "@/lib/content";
import { SOCIAL_NETWORKS } from "@/lib/socials";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

// Reemplazos opcionales que usa el editor del panel; la página pública no pasa ninguno.
export type SiteViewSlots = {
  logo?: ReactNode;
  brandName?: ReactNode;
  tagline?: ReactNode;
  sectionTitle?: ReactNode;
  link?: (link: LinkItem, index: number) => ReactNode;
  afterLinks?: ReactNode;
  socialsTitle?: ReactNode;
  social?: (social: SocialItem, index: number) => ReactNode;
  afterSocials?: ReactNode;
};

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

  return (
    <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center px-4 pb-10 pt-16">
      {!editing && <ShareDialog />}

      <header className="flex w-full flex-col items-center gap-2 text-center">
        {slots.logo ??
          (content.logoUrl && (
            <Image
              src={content.logoUrl}
              alt={`Logo de ${content.brandName}`}
              width={192}
              height={96}
              unoptimized
              className="mb-2 h-24 w-auto"
            />
          ))}
        {slots.brandName ?? (
          <h1 className="text-4xl font-extrabold tracking-tight">
            {content.brandName}
          </h1>
        )}
        {slots.tagline ?? (
          <p className="text-sm font-semibold uppercase tracking-[0.35em]">
            {content.tagline}
          </p>
        )}
      </header>

      <section className="mb-12 mt-10 flex w-full flex-col items-center gap-5">
        {slots.sectionTitle ?? (
          <h2 className="text-base font-semibold">{content.sectionTitle}</h2>
        )}
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
                  className={`block w-full rounded-full border border-border-soft bg-white/5 px-6 py-4 text-center text-base font-semibold backdrop-blur-sm transition motion-safe:hover:-translate-y-0.5 hover:border-white hover:bg-white/10 ${focusRing}`}
                >
                  {link.label}
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
            <h2 className="text-base font-semibold">{content.socialsTitle}</h2>
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
                      className={`block rounded-full p-2 transition-transform motion-safe:hover:scale-110 ${focusRing}`}
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
  );
}
