"use client";

import { useState, useTransition } from "react";
import SocialIcon from "@/app/_components/social-icon";
import { saveContent } from "@/app/admin/actions";
import LogoUploader from "@/app/admin/_components/logo-uploader";
import MediaUploader from "@/app/admin/_components/media-uploader";
import SocialPicker from "@/app/admin/_components/social-picker";
import {
  ghostButton,
  iconButton,
  inputClass,
  labelClass,
  panel,
  primaryButton,
  softButton,
  Switch,
  Toast,
  useToast,
} from "@/app/admin/_components/ui";
import type { LinkItem, SiteContent } from "@/lib/content";
import { MAX_LABEL, MAX_LINKS, MAX_SOCIALS, MAX_TITLE, MAX_URL } from "@/lib/content-limits";
import { SOCIAL_NETWORKS, type SocialNetwork } from "@/lib/socials";

function move<T>(list: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Panel de la página de links (`/`): logo, textos, botones, redes, fondo, música y efectos.
// Es un formulario: nada se publica hasta pulsar Guardar (el logo se publica al subirlo).
export default function LinksAdmin({ initial }: { initial: SiteContent }) {
  const [saved, setSaved] = useState<SiteContent>(initial);
  const [draft, setDraft] = useState<SiteContent>(initial);
  const [saving, startSaving] = useTransition();
  const [logoBusy, setLogoBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(0); // subidas de fondo/música en curso
  const { toast, show, hide } = useToast();
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const busy = logoBusy || mediaBusy > 0;

  function save() {
    startSaving(async () => {
      const result = await saveContent(draft);
      if (result.ok) {
        setSaved(result.content);
        setDraft(result.content);
        show("Cambios publicados");
      } else {
        show(result.error);
      }
    });
  }

  function discard() {
    setDraft(saved);
    show("Cambios descartados");
  }

  async function changeLogo(request: () => Promise<Response>) {
    setLogoBusy(true);
    try {
      const response = await request();
      const body: { logoUrl?: string | null; error?: string } = await response.json();
      if (!response.ok) {
        show(body.error ?? "No se pudo cambiar el logo.");
        return;
      }
      // El logo ya quedó guardado en el servidor: se refleja en ambos estados.
      const logoUrl = body.logoUrl ?? null;
      setSaved((current) => ({ ...current, logoUrl }));
      setDraft((current) => ({ ...current, logoUrl }));
      show(logoUrl ? "Logo publicado" : "Logo quitado");
    } catch {
      show("No se pudo cambiar el logo.");
    } finally {
      setLogoBusy(false);
    }
  }

  function uploadLogo(file: File) {
    const form = new FormData();
    form.set("logo", file);
    return changeLogo(() => fetch("/api/logo", { method: "POST", body: form }));
  }

  function setField(field: "brandName" | "sectionTitle" | "socialsTitle", value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function setLink(id: string, patch: Partial<LinkItem>) {
    setDraft((current) => ({
      ...current,
      links: current.links.map((link) => (link.id === id ? { ...link, ...patch } : link)),
    }));
  }

  function addLink() {
    setDraft((current) => ({
      ...current,
      links: [...current.links, { id: crypto.randomUUID(), label: "Nuevo botón", href: "https://" }],
    }));
  }

  function setSocial(id: string, url: string) {
    setDraft((current) => ({
      ...current,
      socials: current.socials.map((social) => (social.id === id ? { ...social, url } : social)),
    }));
  }

  function addSocial(network: SocialNetwork) {
    setDraft((current) => ({
      ...current,
      socials: [
        ...current.socials,
        {
          id: crypto.randomUUID(),
          network,
          url: SOCIAL_NETWORKS[network].mailto ? "mailto:" : "https://",
        },
      ],
    }));
  }

  const status = busy ? "Subiendo archivos…" : dirty ? "Cambios sin guardar" : "Todo guardado";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[clamp(22px,3vw,28px)] font-extrabold tracking-wide">
            Página de links
          </h1>
          <p className="text-[13px] text-white/70">
            Lo que se ve en la página principal. El botón del catálogo y los de categorías
            aparecen solos cuando hay productos visibles.
          </p>
        </div>
      </div>

      <div className="sticky top-[62px] z-20 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border-soft bg-theme-navy/85 px-3 py-2.5 backdrop-blur-[14px] min-[900px]:top-3">
        <div
          className={`flex min-w-[140px] flex-1 items-center gap-1.5 text-xs ${
            dirty ? "text-[#ff5a63]" : "text-white/65"
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-[7px] rounded-full ${dirty ? "bg-[#ff5a63]" : "bg-white/60"}`}
          />
          {status}
        </div>
        {dirty && (
          <button
            type="button"
            onClick={discard}
            disabled={saving}
            className={`${ghostButton} !h-[38px] !px-3.5 !text-[13px]`}
          >
            Descartar
          </button>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving || busy}
          className={`${primaryButton} !h-[38px] !px-[18px] !text-[13px]`}
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-start gap-4">
        <div className="flex min-w-0 flex-col gap-4">
          <LogoUploader
            logoUrl={draft.logoUrl}
            busy={logoBusy}
            onUpload={(file) => void uploadLogo(file)}
            onRemove={() => void changeLogo(() => fetch("/api/logo", { method: "DELETE" }))}
            onError={show}
          />

          <section className={`${panel} flex flex-col gap-3 p-4`}>
            <h2 className="text-[17px] font-bold">Textos</h2>
            <label className={labelClass}>
              Nombre de la marca (texto alternativo del logo)
              <input
                value={draft.brandName}
                maxLength={MAX_TITLE}
                onChange={(event) => setField("brandName", event.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Título de sección (encima de los botones)
              <input
                value={draft.sectionTitle}
                maxLength={MAX_TITLE}
                onChange={(event) => setField("sectionTitle", event.target.value)}
                className={inputClass}
              />
            </label>
            <label className={labelClass}>
              Título de redes sociales
              <input
                value={draft.socialsTitle}
                maxLength={MAX_TITLE}
                onChange={(event) => setField("socialsTitle", event.target.value)}
                className={inputClass}
              />
            </label>
          </section>

          <section className={`${panel} flex flex-col gap-3 p-4`}>
            <h2 className="text-[17px] font-bold">
              Redes sociales{" "}
              <span className="text-sm font-medium text-white/65">
                {draft.socials.length} / {MAX_SOCIALS}
              </span>
            </h2>
            {draft.socials.length === 0 && (
              <p className="text-sm text-white/70">Aún no hay redes. Agrega la primera abajo.</p>
            )}
            <ul className="flex flex-col gap-2">
              {draft.socials.map((social, index) => {
                const { label, mailto } = SOCIAL_NETWORKS[social.network];
                return (
                  <li
                    key={social.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/25 p-2.5"
                  >
                    <SocialIcon network={social.network} className="size-6 shrink-0 text-theme-red" />
                    <span className="w-20 shrink-0 text-[13px] font-semibold">{label}</span>
                    <input
                      aria-label={`Link de ${label}`}
                      value={social.url}
                      maxLength={MAX_URL}
                      inputMode={mailto ? "email" : "url"}
                      placeholder={mailto ? "mailto:correo@dominio.com" : "https://"}
                      onChange={(event) => setSocial(social.id, event.target.value)}
                      className={`${inputClass} !h-10 flex-1 basis-44 !text-xs`}
                    />
                    <span className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Subir ${label}`}
                        disabled={index === 0}
                        onClick={() =>
                          setDraft((c) => ({ ...c, socials: move(c.socials, index, -1) }))
                        }
                        className={iconButton}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Bajar ${label}`}
                        disabled={index === draft.socials.length - 1}
                        onClick={() =>
                          setDraft((c) => ({ ...c, socials: move(c.socials, index, 1) }))
                        }
                        className={iconButton}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar ${label}`}
                        onClick={() =>
                          setDraft((c) => ({
                            ...c,
                            socials: c.socials.filter((s) => s.id !== social.id),
                          }))
                        }
                        className={`${ghostButton} !h-9 !px-3 !text-xs`}
                      >
                        Quitar
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
            <SocialPicker disabled={draft.socials.length >= MAX_SOCIALS} onPick={addSocial} />
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className={`${panel} flex flex-col gap-3 p-4`}>
            <h2 className="text-[17px] font-bold">
              Botones de links{" "}
              <span className="text-sm font-medium text-white/65">
                {draft.links.length} / {MAX_LINKS}
              </span>
            </h2>
            {draft.links.length === 0 && (
              <p className="text-sm text-white/70">Aún no hay botones. Agrega el primero abajo.</p>
            )}
            <ul className="flex flex-col gap-2">
              {draft.links.map((link, index) => (
                <li
                  key={link.id}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/25 p-2.5"
                >
                  <input
                    aria-label={`Texto del botón ${index + 1}`}
                    value={link.label}
                    maxLength={MAX_LABEL}
                    onChange={(event) => setLink(link.id, { label: event.target.value })}
                    className={`${inputClass} !h-10 font-semibold`}
                  />
                  <input
                    aria-label={`Link del botón ${index + 1}`}
                    value={link.href}
                    maxLength={MAX_URL}
                    inputMode="url"
                    onChange={(event) => setLink(link.id, { href: event.target.value })}
                    className={`${inputClass} !h-10 !text-xs`}
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      aria-label={`Subir botón ${index + 1}`}
                      disabled={index === 0}
                      onClick={() => setDraft((c) => ({ ...c, links: move(c.links, index, -1) }))}
                      className={iconButton}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Bajar botón ${index + 1}`}
                      disabled={index === draft.links.length - 1}
                      onClick={() => setDraft((c) => ({ ...c, links: move(c.links, index, 1) }))}
                      className={iconButton}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Quitar botón ${index + 1}`}
                      onClick={() =>
                        setDraft((c) => ({ ...c, links: c.links.filter((l) => l.id !== link.id) }))
                      }
                      className={`${ghostButton} !h-9 !px-3 !text-xs`}
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={draft.links.length >= MAX_LINKS}
              onClick={addLink}
              className={`${softButton} self-start`}
            >
              + Agregar botón
            </button>
          </section>

          <MediaUploader
            kind="background"
            value={draft.background}
            onChange={(background) => setDraft((current) => ({ ...current, background }))}
            onBusyChange={(on) => setMediaBusy((count) => count + (on ? 1 : -1))}
          />
          <MediaUploader
            kind="music"
            value={draft.music}
            onChange={(music) => setDraft((current) => ({ ...current, music }))}
            onBusyChange={(on) => setMediaBusy((count) => count + (on ? 1 : -1))}
          />
          <section className={`${panel} flex items-center gap-3 p-4`}>
            <span className="flex flex-1 flex-col">
              <strong className="text-sm">Efectos</strong>
              <span className="text-xs text-white/65">
                Lluvia, humo, pétalos y relámpagos en el sitio y la tienda
              </span>
            </span>
            <Switch
              checked={draft.effectsEnabled}
              label="Efectos de la escena"
              onChange={(next) => setDraft((current) => ({ ...current, effectsEnabled: next }))}
            />
          </section>
        </div>
      </div>

      <Toast toast={toast} onClose={hide} />
    </>
  );
}
