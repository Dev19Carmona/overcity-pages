import ShareDialog from "@/app/_components/share-dialog";
import { CATALOG_LINKS, INSTAGRAM_URL } from "@/lib/links";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

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

export default function Home() {
  return (
    <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center px-4 pb-10 pt-16">
      <ShareDialog />

      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">OverCity</h1>
        <p className="text-sm font-semibold uppercase tracking-[0.35em]">
          Streetwear
        </p>
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Instagram de OverCity"
          className={`mt-4 rounded-full p-2 transition-transform motion-safe:hover:scale-110 ${focusRing}`}
        >
          <InstagramIcon className="size-8" />
        </a>
      </header>

      <section className="mb-12 mt-10 flex w-full flex-col items-center gap-5">
        <h2 className="text-base font-semibold">😈 Overcity Premium 😈</h2>
        <ul className="flex w-full flex-col gap-4">
          {CATALOG_LINKS.map((link) => (
            <li key={link.id}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`block w-full rounded-full border border-border-soft bg-white/5 px-6 py-4 text-center text-base font-semibold backdrop-blur-sm transition motion-safe:hover:-translate-y-0.5 hover:border-white hover:bg-white/10 ${focusRing}`}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </section>

      <a
        href={INSTAGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-auto flex items-center justify-center gap-2 rounded-full bg-brand-red px-8 py-3.5 text-base font-semibold shadow-lg shadow-brand-red/30 transition motion-safe:hover:-translate-y-0.5 hover:brightness-110 ${focusRing}`}
      >
        <InstagramIcon className="size-5" />
        Volver a Instagram
      </a>
    </main>
  );
}
