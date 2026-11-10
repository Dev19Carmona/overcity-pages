import SceneEffects from "@/app/_components/scene-effects";

// Paisaje + capas de efectos. Fijo detrás del contenido (z-index 0 a 4).
export default function NightScene() {
  return (
    <>
      <div className="night-scene" aria-hidden="true" />
      <SceneEffects />
    </>
  );
}
