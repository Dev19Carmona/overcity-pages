import Image from "next/image";
import type { ReactNode } from "react";
import ShareDialog from "@/app/_components/share-dialog";
import type { LinkItem, SiteContent } from "@/lib/content";

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
  instagramEditor?: ReactNode;
};

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
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

      <section className="mt-auto flex w-full flex-col items-center gap-4">
        <h2 className="text-base font-semibold">Redes sociales</h2>
        <ul className="flex items-center justify-center gap-4">
          <li>
            <a
              href={content.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram de OverCity"
              className={`block rounded-full p-2 transition-transform motion-safe:hover:scale-110 ${focusRing}`}
            >
              <InstagramIcon className="size-8" />
            </a>
          </li>
        </ul>
        {slots.instagramEditor}
      </section>
    </main>
  );
}
