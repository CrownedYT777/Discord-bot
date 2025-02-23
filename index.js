const { Client, GatewayIntentBits, ActivityType, PermissionsBitField, REST, Routes } = require('discord.js');
const axios = require('axios');
const express = require('express');
require('dotenv').config();

// HTTP Server to Keep the Bot Running
const app = express();
app.get('/', (req, res) => {
  res.send('Bot is running!');
});
const PORT = 3000;
app.listen(PORT, () => console.log(`HTTP server running on port ${PORT}`));

// Discord Client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// Commands Definition
const commands = {
  mcstatus: {
    data: {
      name: 'mcstatus',
      description: 'Get the status of a Minecraft server (Java or Bedrock)',
      options: [
        { type: 3, name: 'ip', description: 'The IP address of the Minecraft server', required: true },
        {
          type: 3,
          name: 'type',
          description: 'The type of Minecraft server (java or bedrock)',
          required: true,
          choices: [{ name: 'Java', value: 'java' }, { name: 'Bedrock', value: 'bedrock' }],
        },
        { type: 4, name: 'port', description: 'The port of the server (required for Bedrock)', required: false },
      ],
    },
    async execute(interaction) {
      const ip = interaction.options.getString('ip');
      const type = interaction.options.getString('type');
      const port = interaction.options.getInteger('port') || (type === 'bedrock' ? 19132 : undefined);

      await interaction.reply('Fetching server status...');
      try {
        const url =
          type === 'java'
            ? `https://api.mcstatus.io/v2/status/java/${ip}`
            : `https://api.mcstatus.io/v2/status/bedrock/${ip}:${port}`;

        const response = await axios.get(url);
        const data = response.data;

        if (data.online) {
          const players = data.players.online || 0;
          const maxPlayers = data.players.max || 'Unknown';
          const version = data.version?.name || 'Unknown';
          const motd = data.motd?.clean || 'No MOTD available';
          const latency = data.latency || 'Unknown';

          const serverInfo =
            `🏰 **Minecraft Server Status**:\n` +
            `**Status:** 🟢 Online\n` +
            `**IP:** ${ip}\n` +
            (type === 'bedrock' ? `**Port:** ${port}\n` : '') +
            `**Players:** ${players}/${maxPlayers}\n` +
            `**Version:** ${version}\n` +
            `**MOTD:** ${motd}\n` +
            `**Latency:** ${latency}ms`;

          await interaction.editReply(serverInfo);
        } else {
          await interaction.editReply(
            `🏰 **Minecraft Server Status**:\n` +
            `**Status:** 🔴 Offline\n` +
            `**IP:** ${ip}\n` +
            (type === 'bedrock' ? `**Port:** ${port}\n` : '') +
            `The server is currently offline or unreachable.`
          );
        }
      } catch (error) {
        await interaction.editReply(
          `❌ Unable to fetch the status of the server: ${ip}${type === 'bedrock' ? `:${port}` : ''}\n` +
          `Ensure the IP address and type are correct.`
        );
      }
    },
  },

  kick: {
    data: {
      name: 'kick',
      description: 'Kicks a member from the server.',
      options: [
        { type: 6, name: 'user', description: 'The user to kick', required: true },
        { type: 3, name: 'reason', description: 'Reason for the kick', required: false },
      ],
    },
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = interaction.guild.members.cache.get(user.id);

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
        return interaction.reply({ content: 'You don’t have permission to kick members!', ephemeral: true });
      }

      try {
        await member.kick(reason);
        await interaction.reply(`✅ Successfully kicked ${user.tag}.\nReason: ${reason}`);
      } catch {
        await interaction.reply({ content: 'Failed to kick the member.', ephemeral: true });
      }
    },
  },

  ban: {
    data: {
      name: 'ban',
      description: 'Bans a member from the server.',
      options: [
        { type: 6, name: 'user', description: 'The user to ban', required: true },
        { type: 3, name: 'reason', description: 'Reason for the ban', required: false },
      ],
    },
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return interaction.reply({ content: 'You don’t have permission to ban members!', ephemeral: true });
      }

      try {
        await interaction.guild.members.ban(user.id, { reason });
        await interaction.reply(`✅ Successfully banned ${user.tag}.\nReason: ${reason}`);
      } catch {
        await interaction.reply({ content: 'Failed to ban the member.', ephemeral: true });
      }
    },
  },

  unban: {
    data: {
      name: 'unban',
      description: 'Unbans a member from the server.',
      options: [
        { type: 3, name: 'user_id', description: 'The ID of the user to unban', required: true },
      ],
    },
    async execute(interaction) {
      const userId = interaction.options.getString('user_id');

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
        return interaction.reply({ content: 'You don’t have permission to unban members!', ephemeral: true });
      }

      try {
        await interaction.guild.members.unban(userId);
        await interaction.reply(`✅ Successfully unbanned user with ID: ${userId}`);
      } catch {
        await interaction.reply({ content: 'Failed to unban the user. Check the ID.', ephemeral: true });
      }
    },
  },

  invite: {
    data: { name: 'invite', description: 'Sends the bot invite link.' },
    async execute(interaction) {
      const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;
      await interaction.reply(`🤖 Invite me to your server using this link:\n${inviteLink}`);
    },
  },
};

// Register Commands
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    const commandsData = Object.values(commands).map(command => command.data);
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commandsData }
    );
    console.log('Successfully registered slash commands.');
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

// Custom Status Management
const statusMessages = ["🎧 Listening to Spotify", "🎮 Playing GTA VI", "👾Im a prototype model!"];
const statusTypes = ['dnd', 'idle', 'online'];
let currentStatusIndex = 0;
let currentTypeIndex = 0;

function updateStatus() {
  const currentStatus = statusMessages[currentStatusIndex];
  const currentType = statusTypes[currentTypeIndex];
  client.user.setPresence({
    activities: [{ name: currentStatus, type: ActivityType.Custom }],
    status: currentType,
  });
  console.log('[ STATUS ] Updated status to:', `${currentStatus} (${currentType})`);
  currentStatusIndex = (currentStatusIndex + 1) % statusMessages.length;
  currentTypeIndex = (currentTypeIndex + 1) % statusTypes.length;
}

function heartbeat() {
  setInterval(() => {
    console.log('[ HEARTBEAT ] Bot is alive');
  }, 30000);
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  updateStatus();
  setInterval(updateStatus, 10000);
  heartbeat();
});

client.login(process.env.TOKEN);
