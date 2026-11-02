require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

// --- 1. LIGHTWEIGHT WEB SERVER (Keeps cloud container alive) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Rony Discord Bot is online and healthy!');
});

app.listen(PORT, () => {
  console.log(`🌐 Web server active on port ${PORT}`);
});

// --- 2. MULTI-PROVIDER CLOUD TRANSLATOR (Never blocked by cloud datacenter IPs) ---
async function translateText(text, targetLang) {
  // Try Provider 1: MyMemory (Free public API, works 100% on cloud IPs)
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${targetLang}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data && data.responseData && data.responseData.translatedText) {
      let translated = data.responseData.translatedText;
      // If MyMemory returns MYMEMORY WARNING, still use it or fallback
      if (!translated.includes('MYMEMORY WARNING')) {
        const detected = data.responseData.match || targetLang;
        return {
          text: translated,
          from: data.matches && data.matches[0] ? data.matches[0]['segment'] : null,
        };
      }
    }
  } catch (err) {
    console.warn('Provider 1 (MyMemory) failed, trying fallback...', err.message);
  }

  // Try Provider 2: LibreTranslate Free Mirror
  try {
    const res = await fetch('https://translate.terraprint.co/translate', {
      method: 'POST',
      body: JSON.stringify({
        q: text,
        source: 'auto',
        target: targetLang,
        format: 'text',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await res.json();
    if (result && result.translatedText) {
      return { text: result.translatedText };
    }
  } catch (err) {
    console.warn('Provider 2 failed:', err.message);
  }

  // Try Provider 3: Lingva (Open source Google proxy)
  try {
    const res = await fetch(`https://lingva.ml/api/v1/auto/${targetLang}/${encodeURIComponent(text)}`);
    const result = await res.json();
    if (result && result.translation) {
      return { text: result.translation };
    }
  } catch (err) {
    console.warn('Provider 3 failed:', err.message);
  }

  throw new Error('All translation providers exhausted.');
}

// --- 3. DISCORD CLIENT CONFIGURATION ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const ROLE_TO_LANG = {
  spanish: 'es',
  español: 'es',
  english: 'en',
  french: 'fr',
  français: 'fr',
  german: 'de',
  deutsch: 'de',
  italian: 'it',
  portuguese: 'pt',
  russian: 'ru',
  japanese: 'ja',
  chinese: 'zh',
  hindi: 'hi',
  arabic: 'ar',
};

const LANG_NAMES = {
  es: 'Spanish',
  en: 'English',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
  hi: 'Hindi',
  ar: 'Arabic',
};

client.once(Events.ClientReady, () => {
  console.log(`✅ Logged in and ready as ${client.user.tag}!`);
});

// Attach translate button
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.content.trim()) return;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tr_${message.id}`)
      .setLabel('🌐 Translate')
      .setStyle(ButtonStyle.Secondary)
  );

  try {
    await message.reply({
      components: [row],
      allowedMentions: { repliedUser: false },
    });
  } catch (err) {
    console.error('Error attaching translate button:', err);
  }
});

// Handle translate interaction
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('tr_')) return;
  if (interaction.replied || interaction.deferred) return;

  const targetMessageId = interaction.customId.replace('tr_', '');
  const member = interaction.member;

  let targetLang = null;
  let roleDisplayName = null;

  if (member && member.roles) {
    for (const [, role] of member.roles.cache) {
      const lower = role.name.toLowerCase().trim();
      if (ROLE_TO_LANG[lower]) {
        targetLang = ROLE_TO_LANG[lower];
        roleDisplayName = role.name;
        break;
      }
    }
  }

  if (!targetLang) {
    return interaction.reply({
      content: 'ℹ️ You do not have a recognized language role (e.g., **Spanish**, **English**, **French**). Please ask a moderator to assign your language role!',
      flags: MessageFlags.Ephemeral,
    }).catch(console.error);
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(console.error);

  try {
    const originalMessage = await interaction.channel.messages.fetch(targetMessageId).catch(() => null);

    if (!originalMessage || !originalMessage.content.trim()) {
      return interaction.editReply({
        content: '⚠️ Could not find the original message. It may have been deleted.',
      });
    }

    const textToTranslate = originalMessage.content;
    const authorName = originalMessage.author.displayName || originalMessage.author.username;

    const res = await translateText(textToTranslate, targetLang);

    // If identical translation
    if (res.text.trim().toLowerCase() === textToTranslate.trim().toLowerCase()) {
      const langName = LANG_NAMES[targetLang] || roleDisplayName;
      return interaction.editReply({
        content: `ℹ️ This message is already in **${langName}**!`,
      });
    }

    await interaction.editReply({
      content: `🌐 **Translation (${roleDisplayName}):**\n> ${res.text}\n\n*(Original by **${authorName}**: "${textToTranslate}")*`,
    });
  } catch (err) {
    console.error('Translation error:', err);
    await interaction.editReply({
      content: '❌ Failed to translate the message. Please try again later.',
    }).catch(console.error);
  }
});

client.login(process.env.DISCORD_TOKEN);
