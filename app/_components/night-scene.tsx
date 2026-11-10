import type { CSSProperties } from "react";
import SceneEffects from "@/app/_components/scene-effects";
import type { MediaSetting } from "@/lib/content";
import { DEFAULT_BACKGROUND_URL, resolveMediaUrl } from "@/lib/media";

const DEFAULT_BACKGROUND: MediaSetting = { source: "default", url: null };

// Paisaje + capas de efectos. Fijo detrás del contenido (z-index 0 a 4).
// Con background "none" queda solo el fondo marino liso; con effectsEnabled false no hay efectos.
export default function NightScene({
  background = DEFAULT_BACKGROUND,
  effectsEnabled = true,
}: {
  background?: MediaSetting;
  effectsEnabled?: boolean;
}) {
  const imageUrl = resolveMediaUrl(background, DEFAULT_BACKGROUND_URL);
  const style = {
    "--scene-image": imageUrl ? `url(${JSON.stringify(imageUrl)})` : "none",
  } as CSSProperties;

  return (
    <>
      <div className="night-scene" style={style} aria-hidden="true" />
      {effectsEnabled && <SceneEffects />}
    </>
  );
}
