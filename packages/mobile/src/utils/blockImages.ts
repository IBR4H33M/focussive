import { ImageSourcePropType } from 'react-native';

export interface DefaultBlockImage {
  id: string;
  title: string;
  source: ImageSourcePropType;
}

export const DEFAULT_BLOCK_IMAGES: DefaultBlockImage[] = [
  {
    id: 'default:cat-no',
    title: 'Cat No',
    source: require('../../assets/images/blockimages/cat-no.gif'),
  },
  {
    id: 'default:dog-really',
    title: 'Dog Really',
    source: require('../../assets/images/blockimages/dog-really.gif'),
  },
  {
    id: 'default:dont-answer',
    title: "Don't Answer",
    source: require('../../assets/images/blockimages/dont-answer.gif'),
  },
];

/**
 * Resolves a block image identifier or URL into a React Native Image source prop.
 * Handles preset defaults (local bundled assets) and remote URLs (Cloudinary).
 */
export function resolveBlockImageSource(urlOrId?: string | null): ImageSourcePropType | null {
  if (!urlOrId || typeof urlOrId !== 'string') return null;

  const match = DEFAULT_BLOCK_IMAGES.find((item) => item.id === urlOrId);
  if (match) return match.source;

  // Fallbacks for direct names or loose matches
  if (urlOrId.includes('cat-no')) return DEFAULT_BLOCK_IMAGES[0].source;
  if (urlOrId.includes('dog-really')) return DEFAULT_BLOCK_IMAGES[1].source;
  if (urlOrId.includes('answer')) return DEFAULT_BLOCK_IMAGES[2].source;

  // Custom remote URL (e.g. Cloudinary)
  return { uri: urlOrId };
}

/**
 * Checks whether the given image ID or URL is one of the default presets.
 */
export function isDefaultBlockImage(urlOrId?: string | null): boolean {
  if (!urlOrId || typeof urlOrId !== 'string') return false;
  return (
    DEFAULT_BLOCK_IMAGES.some((item) => item.id === urlOrId) ||
    urlOrId.includes('cat-no') ||
    urlOrId.includes('dog-really') ||
    urlOrId.includes('answer')
  );
}
