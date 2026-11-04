export interface PlaceImageAsset {
  src: string;
  width: number;
  height: number;
  alt: string;
}

const placeImages: Record<string, PlaceImageAsset> = {
  "national-museum-of-ethiopia": {
    src: "/images/places/national-museum.webp",
    width: 960,
    height: 640,
    alt: "The National Museum of Ethiopia building in Addis Ababa",
  },
  "holy-trinity-cathedral": {
    src: "/images/places/holy-trinity.webp",
    width: 960,
    height: 1280,
    alt: "The dome and stone figures of Holy Trinity Cathedral in Addis Ababa",
  },
  "merkato": {
    src: "/images/places/merkato.webp",
    width: 960,
    height: 640,
    alt: "A busy market street in Addis Mercato",
  },
  "red-terror-martyrs-memorial-museum": {
    src: "/images/places/red-terror-museum.webp",
    width: 960,
    height: 558,
    alt: "An exhibit inside the Red Terror Martyrs Memorial Museum",
  },
  "unity-park": {
    src: "/images/places/unity-park.webp",
    width: 960,
    height: 1280,
    alt: "A landscaped path at Unity Park with Addis Ababa in the distance",
  },
  "meskel-square": {
    src: "/images/places/meskel-square.webp",
    width: 960,
    height: 720,
    alt: "Traffic near Meskel Square in Addis Ababa",
  },
};

export function getPlaceImage(placeId: string): PlaceImageAsset | undefined {
  return placeImages[placeId];
}
