import { sendTelegram, telegramConfig } from '../alerts';
import { operatorSettings } from './live';

/*
 * Connects the team's Telegram alerts, with the settings in .env.operator (or the environment).
 *
 *   pnpm alerts:test
 *
 * With only TELEGRAM_BOT_TOKEN set, it lists the chats that have written to the bot, so you can copy
 * the right TELEGRAM_CHAT_ID. With both set, it sends a test message to that chat.
 */

const settings = operatorSettings();
const token = settings.TELEGRAM_BOT_TOKEN?.trim();

if (!token) {
  console.error('Add TELEGRAM_BOT_TOKEN=… (from @BotFather) to .env.operator first (see README, Alerts).');
  process.exit(1);
}

const config = telegramConfig(settings);
if (config) {
  const sent = await sendTelegram(config, '✅ Urdho alerts are connected. Server errors and failed health checks will appear here.');
  console.log(sent ? `Test message sent to chat ${config.chatId}.` : `Telegram refused the message: check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (${config.chatId}).`);
  process.exit(sent ? 0 : 1);
}

// No chat yet: whoever wrote to the bot (or added it to a group) recently shows up in its updates.
const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`).catch(() => undefined);
const body = (await res?.json().catch(() => null)) as { ok?: boolean; result?: { message?: { chat?: { id: number; title?: string; first_name?: string; username?: string } } }[] } | null;
if (!body?.ok) {
  console.error("Telegram didn't accept TELEGRAM_BOT_TOKEN. Copy it again from @BotFather.");
  process.exit(1);
}
const chats = new Map(body.result?.flatMap((u) => (u.message?.chat ? [[u.message.chat.id, u.message.chat] as const] : [])));
if (chats.size === 0) {
  console.log('No chats yet. Open your bot in Telegram, press Start (or send it any message), then run this again.');
} else {
  console.log('Chats that wrote to the bot. Put the right one in .env.operator as TELEGRAM_CHAT_ID=…\n');
  for (const [id, chat] of chats) console.log(`  ${String(id).padEnd(16)} ${chat.title ?? chat.first_name ?? ''}${chat.username ? ` (@${chat.username})` : ''}`);
}
