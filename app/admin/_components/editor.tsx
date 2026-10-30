"use client";

import { useState, useTransition } from "react";
import SiteView from "@/app/_components/site-view";
import { logoutAction, saveContent } from "@/app/admin/actions";
import SocialIcon from "@/app/_components/social-icon";
import LogoUploader from "@/app/admin/_components/logo-uploader";
import SocialPicker from "@/app/admin/_components/social-picker";
import {
  MAX_LABEL,
  MAX_LINKS,
  MAX_SOCIALS,
  MAX_TITLE,
  MAX_URL,
} from "@/lib/content-limits";
import type { LinkItem, SiteContent } from "@/lib/content";
import { SOCIAL_NETWORKS, type SocialNetwork } from "@/lib/socials";

const inputBase =
  "w-full rounded-md border border-dashed border-white/40 bg-transparent px-2 py-1 text-center outline-none focus-visible:border-white";

const barButton =
  "rounded-full border border-border-soft px-4 py-2 text-sm font-semibold transition hover:border-white disabled:opacity-50 disabled:hover:border-border-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

const smallButton =
  "rounded-full border border-border-soft px-3 py-1 text-xs font-semibold transition hover:border-white disabled:opacity-40 disabled:hover:border-border-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export default function Editor({ initial }: { initial: SiteContent }) {
  const [saved, setSaved] = useState<SiteContent>(initial);
  const [draft, setDraft] = useState<SiteContent>(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const [logoBusy, setLogoBusy] = useState(false);
  const [selectedSocialId, setSelectedSocialId] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const selectedIndex = draft.socials.findIndex((s) => s.id === selectedSocialId);
  const selectedSocial = selectedIndex >= 0 ? draft.socials[selectedIndex] : null;

  function save() {
    setMessage(null);
    startSaving(async () => {
      const result = await saveContent(draft);
      if (result.ok) {
        setSaved(result.content);
        setDraft(result.content);
        setMessage({ ok: true, text: "Cambios publicados." });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  }

  async function changeLogo(request: () => Promise<Response>) {
    setMessage(null);
    setLogoBusy(true);
    try {
      const response = await request();
      const body: { logoUrl?: string | null; error?: string } = await response.json();
      if (!response.ok) {
        setMessage({ ok: false, text: body.error ?? "No se pudo cambiar el logo." });
        return;
      }
      // El logo ya quedó guardado en el servidor: se refleja en ambos estados.
      const logoUrl = body.logoUrl ?? null;
      setSaved((current) => ({ ...current, logoUrl }));
      setDraft((current) => ({ ...current, logoUrl }));
      setMessage({
        ok: true,
        text: logoUrl ? "Logo publicado." : "Logo quitado.",
      });
    } catch {
      setMessage({ ok: false, text: "No se pudo cambiar el logo." });
    } finally {
      setLogoBusy(false);
    }
  }

  function uploadLogo(file: File) {
    const form = new FormData();
    form.set("logo", file);
    return changeLogo(() => fetch("/api/logo", { method: "POST", body: form }));
  }

  function discard() {
    setDraft(saved);
    setMessage(null);
  }

  function setField<K extends "brandName" | "tagline" | "sectionTitle" | "socialsTitle">(
    field: K,
    value: string,
  ) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function setSocial(id: string, url: string) {
    setDraft((current) => ({
      ...current,
      socials: current.socials.map((social) =>
        social.id === id ? { ...social, url } : social,
      ),
    }));
  }

  function setLink(id: string, patch: Partial<LinkItem>) {
    setDraft((current) => ({
      ...current,
      links: current.links.map((link) =>
        link.id === id ? { ...link, ...patch } : link,
      ),
    }));
  }

  function addSocial(network: SocialNetwork) {
    const id = crypto.randomUUID();
    setDraft((current) => ({
      ...current,
      socials: [
        ...current.socials,
        {
          id,
          network,
          url: SOCIAL_NETWORKS[network].mailto ? "mailto:" : "https://",
        },
      ],
    }));
    setSelectedSocialId(id);
  }

  function removeSocial(id: string) {
    setSelectedSocialId(null);
    setDraft((current) => ({
      ...current,
      socials: current.socials.filter((social) => social.id !== id),
    }));
  }

  function moveSocial(index: number, offset: -1 | 1) {
    setDraft((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.socials.length) return current;
      const socials = [...current.socials];
      [socials[index], socials[target]] = [socials[target], socials[index]];
      return { ...current, socials };
    });
  }

  function addLink() {
    setDraft((current) => ({
      ...current,
      links: [
        ...current.links,
        { id: crypto.randomUUID(), label: "Nuevo botón", href: "https://" },
      ],
    }));
  }

  function removeLink(id: string) {
    setDraft((current) => ({
      ...current,
      links: current.links.filter((link) => link.id !== id),
    }));
  }

  function moveLink(index: number, offset: -1 | 1) {
    setDraft((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.links.length) return current;
      const links = [...current.links];
      [links[index], links[target]] = [links[target], links[index]];
      return { ...current, links };
    });
  }

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border-soft bg-black/80 px-4 py-3 backdrop-blur">
        <span className="text-sm font-semibold">Modo edición</span>
        <div className="flex flex-wrap items-center gap-2">
          {message && (
            <span
              role="status"
              className={`text-sm font-semibold ${message.ok ? "text-green-300" : "text-red-300"}`}
            >
              {message.text}
            </span>
          )}
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className={`${barButton} border-white bg-white/10`}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={discard}
            className={barButton}
          >
            Descartar cambios
          </button>
          <form action={logoutAction}>
            <button type="submit" className={barButton}>
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>

      <SiteView
        content={draft}
        editing
        slots={{
          logo: (
            <LogoUploader
              logoUrl={draft.logoUrl}
              busy={logoBusy}
              onUpload={(file) => void uploadLogo(file)}
              onRemove={() =>
                void changeLogo(() => fetch("/api/logo", { method: "DELETE" }))
              }
              onError={(text) => setMessage({ ok: false, text })}
            />
          ),
          brandName: (
            <input
              aria-label="Nombre de la marca"
              value={draft.brandName}
              maxLength={MAX_TITLE}
              onChange={(e) => setField("brandName", e.target.value)}
              className={`${inputBase} text-4xl font-extrabold tracking-tight`}
            />
          ),
          tagline: (
            <input
              aria-label="Subtítulo"
              value={draft.tagline}
              maxLength={MAX_TITLE}
              onChange={(e) => setField("tagline", e.target.value)}
              className={`${inputBase} text-sm font-semibold uppercase tracking-[0.35em]`}
            />
          ),
          sectionTitle: (
            <input
              aria-label="Título de sección"
              value={draft.sectionTitle}
              maxLength={MAX_TITLE}
              onChange={(e) => setField("sectionTitle", e.target.value)}
              className={`${inputBase} text-base font-semibold`}
            />
          ),
          link: (link, index) => (
            <div className="flex w-full flex-col gap-2 rounded-3xl border border-border-soft bg-white/5 px-4 py-3">
              <input
                aria-label={`Texto del botón ${index + 1}`}
                value={link.label}
                maxLength={MAX_LABEL}
                onChange={(e) => setLink(link.id, { label: e.target.value })}
                className={`${inputBase} text-base font-semibold`}
              />
              <input
                aria-label={`Link del botón ${index + 1}`}
                value={link.href}
                maxLength={MAX_URL}
                inputMode="url"
                onChange={(e) => setLink(link.id, { href: e.target.value })}
                className={`${inputBase} text-xs`}
              />
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  aria-label={`Subir botón ${index + 1}`}
                  disabled={index === 0}
                  onClick={() => moveLink(index, -1)}
                  className={smallButton}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Bajar botón ${index + 1}`}
                  disabled={index === draft.links.length - 1}
                  onClick={() => moveLink(index, 1)}
                  className={smallButton}
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Quitar botón ${index + 1}`}
                  onClick={() => removeLink(link.id)}
                  className={smallButton}
                >
                  Quitar
                </button>
              </div>
            </div>
          ),
          afterLinks: (
            <button
              type="button"
              disabled={draft.links.length >= MAX_LINKS}
              onClick={addLink}
              className={barButton}
            >
              + Agregar botón
            </button>
          ),
          socialsTitle: (
            <input
              aria-label="Título de redes sociales"
              value={draft.socialsTitle}
              maxLength={MAX_TITLE}
              onChange={(e) => setField("socialsTitle", e.target.value)}
              className={`${inputBase} text-base font-semibold`}
            />
          ),
          // Los iconos se ven en fila, como en la página pública; al elegir uno se edita debajo.
          social: (social, index) => (
            <button
              type="button"
              aria-label={`${SOCIAL_NETWORKS[social.network].label} (red ${index + 1})`}
              aria-pressed={social.id === selectedSocialId}
              onClick={() =>
                setSelectedSocialId(social.id === selectedSocialId ? null : social.id)
              }
              className={`rounded-full border p-2 transition focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white ${
                social.id === selectedSocialId
                  ? "border-white bg-white/10"
                  : "border-dashed border-white/40 hover:border-white"
              }`}
            >
              <SocialIcon network={social.network} className="size-8" />
            </button>
          ),
          afterSocials: (
            <>
              {selectedSocial ? (
                <div className="flex w-full flex-col gap-2 rounded-3xl border border-border-soft bg-white/5 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <SocialIcon
                      network={selectedSocial.network}
                      className="size-6 shrink-0"
                    />
                    <input
                      aria-label={`Link de ${SOCIAL_NETWORKS[selectedSocial.network].label}`}
                      value={selectedSocial.url}
                      maxLength={MAX_URL}
                      inputMode={SOCIAL_NETWORKS[selectedSocial.network].mailto ? "email" : "url"}
                      placeholder={
                        SOCIAL_NETWORKS[selectedSocial.network].mailto
                          ? "mailto:correo@dominio.com"
                          : "https://"
                      }
                      onChange={(e) => setSocial(selectedSocial.id, e.target.value)}
                      className={`${inputBase} text-left text-xs`}
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      aria-label="Mover red a la izquierda"
                      disabled={selectedIndex === 0}
                      onClick={() => moveSocial(selectedIndex, -1)}
                      className={smallButton}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      aria-label="Mover red a la derecha"
                      disabled={selectedIndex === draft.socials.length - 1}
                      onClick={() => moveSocial(selectedIndex, 1)}
                      className={smallButton}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      aria-label="Quitar red"
                      onClick={() => removeSocial(selectedSocial.id)}
                      className={smallButton}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ) : (
                draft.socials.length > 0 && (
                  <p className="text-xs">Toca un icono para editar su link.</p>
                )
              )}
              <SocialPicker
                disabled={draft.socials.length >= MAX_SOCIALS}
                onPick={addSocial}
              />
            </>
          ),
        }}
      />
    </>
  );
}
