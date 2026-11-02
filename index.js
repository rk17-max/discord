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
const { translate } = require('google-translate-api-x');

// --- 1. LIGHTWEIGHT WEB SERVER (Keeps Render container awake) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Rony Discord Bot is online and healthy!');
});

app.listen(PORT, () => {
  console.log(`🌐 Web server active on port ${PORT}`);
});

// --- 2. DISCORD CLIENT CONFIGURATION ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// Map role names (lowercase) to language codes for translation
const ROLE_TO_LANG = {
  spanish: 'es',
  español: 'es',
  english: 'en',
  french: 'fr',
  français: 'fr',
  fr: 'fr',
  german: 'de',
  deutsch: 'de',
  italian: 'it',
  portuguese: 'pt',
  russian: 'ru',
  japanese: 'ja',
  chinese: 'zh-CN',
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
  'zh-CN': 'Chinese',
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

// Handle translate button clicks
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

    // Translate using google-translate-api-x (supports multi-sentence, auto-detects language)
    const res = await translate(textToTranslate, { to: targetLang });

    const detectedIso = res.from?.language?.iso?.toLowerCase();
    if (detectedIso && detectedIso === targetLang.toLowerCase()) {
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
