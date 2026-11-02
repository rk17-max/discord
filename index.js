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
  PermissionsBitField,
  EmbedBuilder,
} = require('discord.js');
const { translate } = require('google-translate-api-x');
const Tesseract = require('tesseract.js');

// --- 1. LIGHTWEIGHT WEB SERVER (Keeps Render alive 24/7) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Rony Discord Bot is online and healthy!');
});

app.listen(PORT, () => {
  console.log(`🌐 Web server active on port ${PORT}`);
});

// --- 2. CRYPTO SCAM SCANNER CONFIGURATION ---

// Common triggers in crypto scam screenshots & fake promo cards
const SCAM_TRIGGERS = [
  'airdrop',
  'binance giveaway',
  'tesla giveaway',
  'elon musk',
  'free usdt',
  'free btc',
  'free eth',
  'free bitcoin',
  'free ethereum',
  'crypto giveaway',
  'claim your reward',
  'claim airdrop',
  'seed phrase',
  'connect your wallet',
  'connect wallet',
  'walletconnect',
  'doubler',
  'deposit btc',
  'deposit eth',
  'deposit usdt',
  'crypto investment',
  'guaranteed return',
  'scan qr to claim',
  'scan the qr',
  'telegram @',
  't.me/',
  'gift code',
  'promo code: 1000',
  'bonus 0.',
  'withdraw btc',
];

// Helper: Check if text contains high-confidence crypto scam phrases
function detectCryptoScam(rawText) {
  if (!rawText) return null;
  const text = rawText.toLowerCase().replace(/\s+/g, ' ');

  // Look for exact matches
  for (const trigger of SCAM_TRIGGERS) {
    if (text.includes(trigger)) {
      return trigger;
    }
  }

  // Look for suspicious combinations (e.g., "bonus" + "btc" or "giveaway" + "telegram")
  const hasGiveaway = text.includes('giveaway') || text.includes('claim') || text.includes('reward') || text.includes('bonus');
  const hasCrypto = text.includes('btc') || text.includes('eth') || text.includes('crypto') || text.includes('usdt') || text.includes('wallet');
  const hasAction = text.includes('qr') || text.includes('scan') || text.includes('site') || text.includes('code');

  if (hasGiveaway && hasCrypto && hasAction) {
    return 'giveaway + crypto + scan pattern';
  }

  return null;
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

// --- 4. MESSAGE SCANNING (OCR for scam images + translation buttons) ---
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  // 4A. SCAN ATTACHMENTS (Images) FOR SCAM TEXT VIA OCR
  if (message.attachments.size > 0) {
    for (const [, attachment] of message.attachments) {
      const isImage = attachment.contentType?.startsWith('image/') ||
        /\.(png|jpe?g|webp)$/i.test(attachment.name || '');

      if (isImage) {
        // Run OCR in background
        (async () => {
          try {
            const { data } = await Tesseract.recognize(attachment.url, 'eng');
            const detectedText = data?.text || '';
            const matchedScam = detectCryptoScam(detectedText);

            if (matchedScam) {
              console.warn(`🚨 Crypto scam pic detected from ${message.author.tag}! Trigger: "${matchedScam}"`);

              // 1. Delete scam message immediately
              if (message.deletable) {
                await message.delete().catch(() => null);
              }

              // 2. Timeout the user for 1 hour to prevent repeat spam (if bot has permission)
              if (message.member && message.member.moderatable) {
                await message.member.timeout(60 * 60 * 1000, `Posted crypto scam image (Trigger: ${matchedScam})`).catch(() => null);
              }

              // 3. Post notification in channel
              await message.channel.send({
                embeds: [
                  new EmbedBuilder()
                    .setColor(0xff0033)
                    .setTitle('🛡️ Crypto Scam Image Removed')
                    .setDescription(`A suspicious crypto scam / phishing image from <@${message.author.id}> was detected and automatically deleted.`)
                    .setFooter({ text: 'Rony Security Shield' })
                    .setTimestamp(),
                ],
              }).then((msg) => {
                // Auto-delete warning embed after 15 seconds to keep channel clean
                setTimeout(() => msg.delete().catch(() => null), 15000);
              }).catch(console.error);

              return; // Stop processing this message
            }
          } catch (ocrErr) {
            console.error('OCR processing error:', ocrErr.message);
          }
        })();
      }
    }
  }

  // 4B. ATTACH TRANSLATE BUTTON TO REGULAR CHAT MESSAGES
  if (message.content.trim()) {
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
  }
});

// --- 5. HANDLE TRANSLATE BUTTON CLICKS ---
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
