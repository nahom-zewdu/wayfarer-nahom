import Image from "next/image";
import { getPlaceImage } from "../lib/place-images";

interface PlaceImageProps {
  placeId: string;
  name: string;
  category: string;
  className: string;
  sizes?: string;
  preload?: boolean;
}

export default function PlaceImage({
  placeId,
  name,
  category,
  className,
  sizes = "(max-width: 620px) 100vw, (max-width: 900px) 50vw, 33vw",
  preload = false,
}: PlaceImageProps) {
  const image = getPlaceImage(placeId);

  if (!image) {
    return (
      <div
        className={`${className} place-visual-fallback`}
        role="img"
        aria-label={`${name}, ${category}; photograph unavailable`}
      >
        <span className="fallback-kicker">Wayfarer field note</span>
        <strong>{category}</strong>
        <span className="fallback-message">Photograph unavailable</span>
        <span className="fallback-location">ADDIS ABABA · ETHIOPIA</span>
      </div>
    );
  }

  return (
    <div className={`${className} place-visual`}>
      <Image
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        sizes={sizes}
        preload={preload}
      />
    </div>
  );
}
