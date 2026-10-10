import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createDb } from '../db/client';
import { requireEnv } from '../env';
import { ClaudeError, DEFAULT_MODEL } from '../menuImport/claude';
import { DraftError, planImport, previewText, type MenuDraft } from '../menuImport/draft';
import { readMenu } from '../menuImport/extract';
import { readSources, SourceError } from '../menuImport/sources';
import { importMenu } from '../repos/menu';
import { venueIdBySlug, type PilotStats } from '../repos/operator';
import { callLive, OperatorError, operatorSettings } from './live';

/*
 * Loads a restaurant's menu from whatever they have: photos of the paper menu (e.g. sent over
 * WhatsApp), a PDF, the link to their current web or QR menu, or a CSV, in any mix. Claude reads
 * it into Urdho's menu in Albanian and English; you check the preview; then it goes in, hidden
 * from guests until someone checks it and shows each category in the dashboard.
 *
 *   pnpm menu:import --venue bar-kalaja ./bar-kalaja-photos https://bar-kalaja.al/menu
 *       reads the menu and saves menu-drafts/bar-kalaja.json and a readable .txt preview
 *   pnpm menu:import --venue bar-kalaja --draft menu-drafts/bar-kalaja.json --apply --live
 *       loads the checked draft into the venue on the live site
 *
 *   --apply        load into the venue: straight after reading, or the --draft given
 *   --live         the live site (.env.operator); without it, the database in .env
 *   --visible      show the new categories to guests at once
 *   --eur-rate N   lekë per euro, for a menu priced in euro
 *   --model ID     another Claude model (default claude-opus-5-5)
 *
 * Reading needs ANTHROPIC_API_KEY in .env.operator. The import adds to the venue's menu; it never
 * changes or removes what's there.
 */

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    venue: { type: 'string' },
    draft: { type: 'string' },
    apply: { type: 'boolean', default: false },
    live: { type: 'boolean', default: false },
    visible: { type: 'boolean', default: false },
    'eur-rate': { type: 'string' },
    model: { type: 'string' },
  },
});

const USAGE = `Usage:
  pnpm menu:import --venue <slug> <photos, PDFs, CSV files, folders or links…> [--apply] [--live]
  pnpm menu:import --venue <slug> --draft menu-drafts/<slug>.json --apply [--live]
Options: --visible, --eur-rate <lekë per euro>, --model <claude model>`;

interface DraftFile {
  venue: string;
  readAt: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  sources: string[];
  menu: MenuDraft;
}

const slug = values.venue ?? '';
const fail = (message: string): never => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

async function venueExists(): Promise<boolean> {
  if (values.live) return (await callLive<PilotStats>('GET', '/stats?days=1')).venues.some((v) => v.venue.slug === slug);
  const { db, pool } = createDb(requireEnv('DATABASE_URL'));
  try {
    return (await venueIdBySlug(db, slug)) !== undefined;
  } finally {
    await pool.end();
  }
}

async function readNewDraft(): Promise<{ file: DraftFile; path: string }> {
  const apiKey = operatorSettings().ANTHROPIC_API_KEY?.trim();
  if (!apiKey) fail('Add ANTHROPIC_API_KEY=… (from console.anthropic.com) to .env.operator to read menus with Claude.');
  // Before paying for a reading: a typo in the address would only show up at --apply.
  if (!(await venueExists())) fail(`No venue "${slug}" ${values.live ? 'on the live site' : 'in the local database'}. Create it first with pnpm venue:create${values.live ? ' --live' : ''}.`);

  const sources = await readSources(positionals);
  const model = values.model ?? DEFAULT_MODEL;
  console.log(`\nReading ${sources.length} source${sources.length === 1 ? '' : 's'} with ${model}: ${sources.map((s) => s.label).join(', ')}`);
  console.log('This can take a few minutes for a long menu…');
  const started = Date.now();
  const read = await readMenu(sources, { apiKey: apiKey!, model });
  console.log(`Read in ${Math.round((Date.now() - started) / 1000)} s (${read.usage.inputTokens.toLocaleString('en')} tokens in, ${read.usage.outputTokens.toLocaleString('en')} out).`);

  const file: DraftFile = { venue: slug, readAt: new Date().toISOString(), model: read.model, usage: read.usage, sources: sources.map((s) => s.label), menu: read.draft };
  await mkdir('menu-drafts', { recursive: true });
  const path = join('menu-drafts', `${slug}.json`);
  await writeFile(path, `${JSON.stringify(file, null, 2)}\n`);
  return { file, path };
}

async function main() {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) fail(`--venue needs the venue's address, e.g. --venue bar-kalaja.\n\n${USAGE}`);
  if (!values.draft && positionals.length === 0) fail(USAGE);
  const eurRate = values['eur-rate'] ? Number(values['eur-rate']) : undefined;
  if (eurRate !== undefined && !(eurRate > 0)) fail('--eur-rate needs a number of lekë per euro, e.g. --eur-rate 100.');

  let file: DraftFile;
  let draftPath: string;
  if (values.draft) {
    draftPath = values.draft;
    const saved = JSON.parse(await readFile(draftPath, 'utf8')) as DraftFile | MenuDraft;
    file = 'menu' in saved ? saved : { venue: slug, readAt: '', model: '', usage: { inputTokens: 0, outputTokens: 0 }, sources: [], menu: saved };
    if (file.venue && file.venue !== slug) fail(`${draftPath} was read for "${file.venue}", not "${slug}".`);
  } else {
    ({ file, path: draftPath } = await readNewDraft());
  }

  const plan = planImport(file.menu, { eurRate, visible: values.visible });
  const previewPath = draftPath.replace(/\.json$/i, '') + '.txt';
  await writeFile(previewPath, previewText(plan, file.menu.warnings ?? []));

  const dishes = plan.input.categories.reduce((n, c) => n + c.items.length, 0);
  console.log(`\n${dishes} dishes in ${plan.input.categories.length} categories${file.menu.currency === 'EUR' ? ` (euro × ${eurRate} lekë)` : ''}:`);
  for (const c of plan.input.categories) console.log(`  ${(c.name.sq ?? c.name.en ?? '').padEnd(32)} ${c.items.length}`);
  if (plan.skipped.length) console.log(`\nLeft out (${plan.skipped.length}):\n${plan.skipped.map((s) => `  - ${s}`).join('\n')}`);
  if (file.menu.warnings?.length) console.log(`\nNotes from reading the menu:\n${file.menu.warnings.map((w) => `  - ${w}`).join('\n')}`);
  console.log(`\nCheck every price in ${previewPath} (the draft is ${draftPath}; edit it if something's wrong).`);

  if (!values.apply) {
    console.log(`Then load it:\n  pnpm menu:import --venue ${slug} --draft ${draftPath} --apply${values.live ? ' --live' : ''}${eurRate ? ` --eur-rate ${eurRate}` : ''}\n`);
    return;
  }

  const result = values.live
    ? await callLive<{ categories: number; items: number }>('POST', `/venues/${slug}/menu`, plan.input)
    : await (async () => {
        const { db, pool } = createDb(requireEnv('DATABASE_URL'));
        try {
          const venueId = await venueIdBySlug(db, slug);
          if (!venueId) fail(`No venue "${slug}" in the local database.`);
          return await importMenu(db, venueId!, plan.input);
        } finally {
          await pool.end();
        }
      })();
  console.log(
    `\nLoaded ${result.items} dishes in ${result.categories} categories into "${slug}"${values.live ? ' on the live site' : ''}.` +
      (values.visible ? ' They are on the guests\' menu now.' : ' Guests don\'t see them yet: in the dashboard, Menu, check each category and show it.') +
      '\nPhotos and allergens the menu didn\'t mark are for the owner to add there.\n',
  );
}

main().catch((error: unknown) => {
  if (error instanceof SourceError || error instanceof ClaudeError || error instanceof DraftError) fail(error.message);
  if (error instanceof OperatorError) fail(`The live site answered ${error.status} ${error.code}${error.details ? `: ${JSON.stringify(error.details).slice(0, 300)}` : ''}`);
  throw error;
});
