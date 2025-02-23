const { Client, GatewayIntentBits, ActivityType, PermissionsBitField, REST, Routes, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// HTTP Server to Keep the Bot Running
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = 3000;
app.listen(PORT, () => console.log(`HTTP server running on port ${PORT}`));

// Discord Client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// Welcome Setup
const SETTINGS_DIR = path.join(__dirname, "maintenance");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "welcomeSettings.json");

if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR);
}

let welcomeSettings = {};
if (fs.existsSync(SETTINGS_FILE)) {
    welcomeSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
}

client.on('guildMemberAdd', async (member) => {
    const settings = welcomeSettings[member.guild.id];
    if (!settings) return;

    const welcomeChannel = member.guild.channels.cache.get(settings.channelId);
    if (!welcomeChannel) return;

    let userAvatar = member.user.displayAvatarURL({ format: 'png' }).replace(".webp", ".png");
    const userNameEncoded = encodeURIComponent(member.user.username);
    const serverMembers = member.guild.memberCount;
    const welcomeTextEncoded = settings.welcomeMessage.replace(/ /g, '+');

    const welcomeImageURL = `https://api.popcat.xyz/welcomecard?background=${settings.backgroundImage}&width=787&height=400&text1=${userNameEncoded}&text2=${welcomeTextEncoded}&text3=Member+%23${serverMembers}&avatar=${userAvatar}`;

    welcomeChannel.send(welcomeImageURL);
});

const commands = {
  ping: {
    data: { name: 'ping', description: 'Replies with Pong!' },
    async execute(interaction) {
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🏓 Pong!')
        .setDescription(`Latency: ${client.ws.ping}ms`);
      await interaction.reply({ embeds: [embed] });
    },
  },
  purge: {
    data: {
      name: 'purge',
      description: 'Deletes a specified number of messages.',
      options: [{ type: 4, name: 'amount', description: 'Number of messages to delete', required: true }],
    },
    async execute(interaction) {
      const amount = interaction.options.getInteger('amount');
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        return interaction.reply({ content: 'You don’t have permission to delete messages!', ephemeral: true });
      }
      if (amount < 1 || amount > 100) {
        return interaction.reply({ content: 'You can delete between 1 and 100 messages.', ephemeral: true });
      }
      await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: `🧹 Deleted ${amount} messages.`, ephemeral: true });
    },
  },
  mute: {
    data: {
      name: 'mute',
      description: 'Mutes a member.',
      options: [{ type: 6, name: 'user', description: 'User to mute', required: true }],
    },
    async execute(interaction) {
      const member = interaction.options.getMember('user');
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({ content: 'You don’t have permission to mute members!', ephemeral: true });
      }
      try {
        await member.timeout(60 * 60 * 1000, 'Muted by command');
        await interaction.reply(`🔇 Muted ${member.user.tag} for 1 hour.`);
      } catch {
        await interaction.reply({ content: 'Failed to mute the member.', ephemeral: true });
      }
    },
  },
  timeout: {
    data: {
      name: 'timeout',
      description: 'Temporarily timeouts a member.',
      options: [
        { type: 6, name: 'user', description: 'User to timeout', required: true },
        { type: 4, name: 'minutes', description: 'Minutes to timeout', required: true },
      ],
    },
    async execute(interaction) {
      const member = interaction.options.getMember('user');
      const minutes = interaction.options.getInteger('minutes');
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({ content: 'You don’t have permission to timeout members!', ephemeral: true });
      }
      try {
        await member.timeout(minutes * 60 * 1000, `Timed out for ${minutes} minutes`);
        await interaction.reply(`⏳ Timed out ${member.user.tag} for ${minutes} minutes.`);
      } catch {
        await interaction.reply({ content: 'Failed to timeout the member.', ephemeral: true });
      }
    },
  }
};

// Register Commands Globally
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
  try {
    const commandsData = Object.values(commands).map(command => command.data);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsData });
    console.log('Successfully registered slash commands globally.');
  } catch (error) {
    console.error('Error registering commands:', error);
  }
})();

// Interaction Handling
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands[interaction.commandName];
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch {
    await interaction.reply({ content: 'There was an error executing this command.', ephemeral: true });
  }
});

client.login(process.env.TOKEN);
