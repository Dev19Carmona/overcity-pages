"use client";

import { useState } from "react";
import SocialIcon from "@/app/_components/social-icon";
import { SOCIAL_NETWORK_IDS, SOCIAL_NETWORKS, type SocialNetwork } from "@/lib/socials";

const buttonClass =
  "rounded-full border border-border-soft px-4 py-2 text-sm font-semibold transition hover:border-white disabled:opacity-50 disabled:hover:border-border-soft focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white";

export default function SocialPicker({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (network: SocialNetwork) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={buttonClass}
      >
        + Agregar red
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label="Elige una red"
      className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-white/30 bg-white/5 p-4"
    >
      <p className="text-sm font-semibold">Elige una red</p>
      <ul className="grid w-full grid-cols-3 gap-2">
        {SOCIAL_NETWORK_IDS.map((network) => (
          <li key={network}>
            <button
              type="button"
              onClick={() => {
                onPick(network);
                setOpen(false);
              }}
              className="flex w-full flex-col items-center gap-1 rounded-xl border border-border-soft px-2 py-3 text-xs font-semibold transition hover:border-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <SocialIcon network={network} className="size-6" />
              {SOCIAL_NETWORKS[network].label}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setOpen(false)} className={buttonClass}>
        Cancelar
      </button>
    </div>
  );
}
