/** The 14 allergens of EU Regulation 1169/2011. Names are translated by the app, not the venue. */
export const ALLERGENS = [
  'gluten',
  'crustaceans',
  'eggs',
  'fish',
  'peanuts',
  'soybeans',
  'milk',
  'nuts',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
  'molluscs',
] as const;

export type Allergen = (typeof ALLERGENS)[number];
