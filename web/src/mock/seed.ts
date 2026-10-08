import type { MenuCategory, MenuItem, MenuOptionGroup, StaffUser, Venue } from '@shared/types';

/*
 * Demo data for designing the guest app before the API exists. The venue is fictional.
 * Albanian texts are drafts for a native speaker to check.
 */

type ItemSeed = Omit<MenuItem, 'categoryId' | 'available' | 'suggestInBasket' | 'tags' | 'allergens' | 'optionGroups'> &
  Partial<Pick<MenuItem, 'available' | 'suggestInBasket' | 'tags' | 'allergens' | 'optionGroups'>>;

function category(id: string, name: MenuCategory['name'], items: ItemSeed[]): MenuCategory {
  return {
    id,
    name,
    items: items.map((item) => ({
      categoryId: id,
      available: true,
      suggestInBasket: false,
      tags: [],
      allergens: [],
      optionGroups: [],
      ...item,
    })),
  };
}

const removeOnion: MenuOptionGroup = {
  id: 'og-qofte-remove',
  name: { sq: 'Hiq përbërës', en: 'Leave out' },
  minSelect: 0,
  maxSelect: 2,
  options: [
    { id: 'o-qofte-no-onion', name: { sq: 'Pa qepë', en: 'No onion' }, priceDeltaLek: 0, available: true },
    { id: 'o-qofte-no-dip', name: { sq: 'Pa salcë kosi', en: 'No yoghurt dip' }, priceDeltaLek: 0, available: true },
  ],
};

const categories: MenuCategory[] = [
  category('c-meze', { sq: 'Meze', en: 'Starters' }, [
    {
      id: 'i-byrek',
      photoUrl: '/demo/byrek.webp',
      name: { sq: 'Byrek me spinaq', en: 'Spinach byrek' },
      description: {
        sq: 'Petë e hollë shtëpie, e mbushur me spinaq, gjizë dhe qepë të njoma.',
        en: 'Thin homemade pastry filled with spinach, curd cheese and spring onion.',
      },
      priceLek: 250,
      tags: ['vegetarian'],
      allergens: ['gluten', 'milk', 'eggs'],
    },
    {
      id: 'i-sallate',
      photoUrl: '/demo/sallate.webp',
      name: { sq: 'Sallatë fshati', en: 'Village salad' },
      description: {
        sq: 'Domate, kastravec, qepë, speca, ullinj dhe djathë i bardhë, me vaj ulliri.',
        en: 'Tomato, cucumber, onion, peppers, olives and white cheese with olive oil.',
      },
      priceLek: 400,
      tags: ['vegetarian'],
      allergens: ['milk'],
      optionGroups: [
        {
          id: 'og-sallate-remove',
          name: { sq: 'Hiq përbërës', en: 'Leave out' },
          minSelect: 0,
          maxSelect: 3,
          options: [
            { id: 'o-sallate-no-onion', name: { sq: 'Pa qepë', en: 'No onion' }, priceDeltaLek: 0, available: true },
            { id: 'o-sallate-no-olives', name: { sq: 'Pa ullinj', en: 'No olives' }, priceDeltaLek: 0, available: true },
            { id: 'o-sallate-no-cheese', name: { sq: 'Pa djathë', en: 'No cheese' }, priceDeltaLek: 0, available: true },
          ],
        },
      ],
    },
    {
      id: 'i-speca',
      photoUrl: '/demo/speca.webp',
      name: { sq: 'Speca me gjizë', en: 'Peppers with curd cheese' },
      description: {
        sq: 'Speca të pjekur në furrë me gjizë, kos dhe hudhër.',
        en: 'Oven-roasted peppers with curd cheese, yoghurt and garlic.',
      },
      priceLek: 450,
      tags: ['vegetarian', 'spicy'],
      allergens: ['milk'],
    },
    {
      id: 'i-salce',
      photoUrl: '/demo/salce.webp',
      name: { sq: 'Salcë kosi', en: 'Yoghurt and garlic dip' },
      description: {
        sq: 'Kos i trashë me hudhër, kastravec dhe kopër.',
        en: 'Thick yoghurt with garlic, cucumber and dill.',
      },
      priceLek: 150,
      tags: ['vegetarian'],
      allergens: ['milk'],
      suggestInBasket: true,
    },
  ]),
  category('c-gatime', { sq: 'Gatime tradicionale', en: 'Traditional mains' }, [
    {
      id: 'i-tave-kosi',
      photoUrl: '/demo/tave-kosi.webp',
      name: { sq: 'Tavë kosi', en: 'Tavë kosi' },
      description: {
        sq: 'Mish qengji i pjekur me oriz nën një kore të artë kosi dhe vezësh, në tavë balte.',
        en: 'Lamb baked with rice under a golden crust of yoghurt and egg, in a clay dish.',
      },
      priceLek: 850,
      allergens: ['milk', 'eggs', 'gluten'],
      optionGroups: [
        {
          id: 'og-tave-extras',
          name: { sq: 'Shto', en: 'Add' },
          minSelect: 0,
          maxSelect: 2,
          options: [
            { id: 'o-tave-bread', name: { sq: 'Bukë misri', en: 'Cornbread' }, priceDeltaLek: 100, available: true },
            { id: 'o-tave-salad', name: { sq: 'Sallatë jeshile', en: 'Green salad' }, priceDeltaLek: 150, available: true },
          ],
        },
      ],
    },
    {
      id: 'i-fergese',
      photoUrl: '/demo/fergese.webp',
      name: { sq: 'Fërgesë Tirane', en: 'Fërgesë Tirane' },
      description: {
        sq: 'Speca, domate dhe gjizë, të gatuara ngadalë në tavë balte. Shërbehet me bukë të ngrohtë.',
        en: 'Peppers, tomatoes and curd cheese, slow-cooked in a clay pot. Served with warm bread.',
      },
      priceLek: 700,
      tags: ['vegetarian'],
      allergens: ['milk', 'gluten'],
    },
    {
      id: 'i-qofte',
      photoUrl: '/demo/qofte.webp',
      name: { sq: 'Qofte të fshira', en: 'Qofte të fshira' },
      description: {
        sq: 'Qofte me mish të grirë dhe erëza mali sipas recetës së shtëpisë, me salcë kosi.',
        en: 'Meatballs of minced meat and mountain herbs, made to the house recipe, with yoghurt dip.',
      },
      priceLek: 600,
      allergens: ['gluten', 'eggs', 'milk'],
      optionGroups: [
        {
          id: 'og-qofte-size',
          name: { sq: 'Porcioni', en: 'Portion' },
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: 'o-qofte-6', name: { sq: '6 copë', en: '6 pieces' }, priceDeltaLek: 0, available: true },
            { id: 'o-qofte-10', name: { sq: '10 copë', en: '10 pieces' }, priceDeltaLek: 350, available: true },
          ],
        },
        {
          id: 'og-qofte-extras',
          name: { sq: 'Shto', en: 'Add' },
          minSelect: 0,
          maxSelect: 3,
          options: [
            { id: 'o-qofte-fries', name: { sq: 'Patate të skuqura', en: 'Chips' }, priceDeltaLek: 200, available: true },
            { id: 'o-qofte-salad', name: { sq: 'Sallatë jeshile', en: 'Green salad' }, priceDeltaLek: 150, available: true },
            { id: 'o-qofte-rice', name: { sq: 'Pilaf', en: 'Rice pilaf' }, priceDeltaLek: 150, available: false },
          ],
        },
        removeOnion,
      ],
    },
    {
      id: 'i-tave-dheu',
      photoUrl: '/demo/tave-dheu.webp',
      name: { sq: 'Tavë dheu', en: 'Tavë dheu' },
      description: {
        sq: 'Mëlçi, hudhër dhe gjizë, të pjekura në tavë balte sipas mënyrës së Tiranës.',
        en: 'Liver, garlic and curd cheese baked in a clay pot, the Tirana way.',
      },
      priceLek: 750,
      available: false,
      allergens: ['milk', 'gluten'],
    },
  ]),
  category('c-embelsira', { sq: 'Ëmbëlsira & pije', en: 'Desserts & drinks' }, [
    {
      id: 'i-bakllava',
      photoUrl: '/demo/bakllava.webp',
      name: { sq: 'Bakllava', en: 'Baklava' },
      description: {
        sq: 'Petë të holla me arra dhe shurup, sipas recetës së gjyshes.',
        en: 'Thin layers of pastry with walnuts and syrup, to grandma’s recipe.',
      },
      priceLek: 300,
      allergens: ['gluten', 'nuts', 'milk'],
      suggestInBasket: true,
    },
    {
      id: 'i-trilece',
      photoUrl: '/demo/trilece.webp',
      name: { sq: 'Trileçe', en: 'Trileçe' },
      description: {
        sq: 'Pandispanjë e njomur me tre lloje qumështi, me karamel sipër.',
        en: 'Sponge cake soaked in three kinds of milk, topped with caramel.',
      },
      priceLek: 350,
      tags: ['new'],
      allergens: ['gluten', 'eggs', 'milk'],
      suggestInBasket: true,
    },
    {
      id: 'i-birre',
      photoUrl: '/demo/birre.webp',
      name: { sq: 'Birrë Tirana', en: 'Tirana beer' },
      description: { sq: 'Birrë e lehtë, e ftohtë akull.', en: 'Light lager, served ice cold.' },
      priceLek: 300,
      allergens: ['gluten'],
      suggestInBasket: true,
      optionGroups: [
        {
          id: 'og-birre-size',
          name: { sq: 'Madhësia', en: 'Size' },
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: 'o-birre-33', name: { sq: '33 cl', en: '33 cl' }, priceDeltaLek: 0, available: true },
            { id: 'o-birre-50', name: { sq: '50 cl', en: '50 cl' }, priceDeltaLek: 100, available: true },
          ],
        },
      ],
    },
    {
      id: 'i-dhalle',
      photoUrl: '/demo/dhalle.webp',
      name: { sq: 'Dhallë', en: 'Dhallë' },
      description: {
        sq: 'Pije kosi e freskët me pak kripë.',
        en: 'Chilled yoghurt drink with a pinch of salt.',
      },
      priceLek: 150,
      tags: ['vegetarian'],
      allergens: ['milk'],
      suggestInBasket: true,
    },
  ]),
];

export const DEMO_SLUG = 'demo';

export const SEED_CATEGORIES = categories;

/** QR tokens for the demo tables: /demo/t/demo-1 … /demo/t/demo-6. */
export const SEED_TABLES = [1, 2, 3, 4, 5, 6].map((number) => ({ id: `t-${number}`, number, qrToken: `demo-${number}` }));

export const SEED_VENUE: Venue = {
  id: 'v-demo',
  slug: DEMO_SLUG,
  name: 'Tavë & Raki',
  logoUrl: null,
  coverUrl: '/demo/cover.webp',
  brandColor: '#C8432A',
  languages: ['sq', 'en'],
  defaultLanguage: 'sq',
  timezone: 'Europe/Tirane',
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: true, from: '08:00', to: '23:00' })),
};

/** Demo staff accounts. The mock login accepts any password for these addresses. */
export const SEED_STAFF: StaffUser[] = [
  { id: 's-owner', name: 'Arta Hoxha', email: 'pronari@demo.al', role: 'owner' },
  { id: 's-manager', name: 'Besnik Leka', email: 'menaxheri@demo.al', role: 'manager' },
  { id: 's-waiter', name: 'Dea Marku', email: 'kamarieri@demo.al', role: 'waiter' },
];