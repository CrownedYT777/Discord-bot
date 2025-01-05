const { Client, GatewayIntentBits, ActivityType, PermissionsBitField, REST, Routes } = require('discord.js');
const axios = require('axios');
const express = require('express');
require('dotenv').config();

const app = express();
app.get('/', (req, res) => {
  res.send('Bot is running!');
});
const PORT = 3000;
app.listen(PORT, () => console.log(`HTTP server running on port ${PORT}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

const commands = {
  ping: {
    data: {
      name: 'ping',
      description: 'Replies with the bot\'s latency',
    },
    async execute(interaction) {
      await interaction.reply('Calculating latency...');
      const sent = await interaction.fetchReply();
      const latency = sent.createdTimestamp - interaction.createdTimestamp;
      const apiLatency = interaction.client.ws.ping;
      await interaction.editReply(`🏓 Pong! Bot Latency is **${latency}ms**. API Latency is **${apiLatency}ms**.`);
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
      } catch (error) {
        console.error(error);
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
      } catch (error) {
        console.error(error);
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
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Failed to unban the user. Check the ID.', ephemeral: true });
      }
    },
  },

  mute: {
    data: {
      name: 'mute',
      description: 'Mutes a member in the server.',
      options: [
        { type: 6, name: 'user', description: 'The user to mute', required: true },
        { type: 3, name: 'reason', description: 'Reason for the mute', required: false },
      ],
    },
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const member = interaction.guild.members.cache.get(user.id);

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({ content: 'You don’t have permission to mute members!', ephemeral: true });
      }

      try {
        const muteRole = interaction.guild.roles.cache.find(role => role.name === 'Muted');
        if (!muteRole) {
          return interaction.reply({ content: 'Mute role not found. Please create a "Muted" role.', ephemeral: true });
        }

        await member.roles.add(muteRole, reason);
        await interaction.reply(`✅ Successfully muted ${user.tag}.\nReason: ${reason}`);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Failed to mute the member.', ephemeral: true });
      }
    },
  },

  unmute: {
    data: {
      name: 'unmute',
      description: 'Unmutes a member in the server.',
      options: [
        { type: 6, name: 'user', description: 'The user to unmute', required: true },
      ],
    },
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const member = interaction.guild.members.cache.get(user.id);

      if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
        return interaction.reply({ content: 'You don’t have permission to unmute members!', ephemeral: true });
      }

      try {
        const muteRole = interaction.guild.roles.cache.find(role => role.name === 'Muted');
        if (!muteRole) {
          return interaction.reply({ content: 'Mute role not found.', ephemeral: true });
        }

        await member.roles.remove(muteRole);
        await interaction.reply(`✅ Successfully unmuted ${user.tag}.`);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Failed to unmute the member.', ephemeral: true });
      }
    },
  },

  addrole: {
    data: {
      name: 'addrole',
      description: 'Adds a role to a member.',
      options: [
        { type: 6, name: 'user', description: 'The user to give the role to', required: true },
        { type: 8, name: 'role', description: 'The role to add', required: true },
      ],
    },
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const role = interaction.options.getRole('role');
      const member = interaction.guild.members.cache.get(user.id);

      try {
        await member.roles.add(role);
        await interaction.reply(`✅ Successfully added role **${role.name}** to ${user.tag}.`);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Failed to add the role.', ephemeral: true });
      }
    },
  },

  removerole: {
    data: {
      name: 'removerole',
      description: 'Removes a role from a member.',
      options: [
        { type: 6, name: 'user', description: 'The user to remove the role from', required: true },
        { type: 8, name: 'role', description: 'The role to remove', required: true },
      ],
    },
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const role = interaction.options.getRole('role');
      const member = interaction.guild.members.cache.get(user.id);

      try {
        await member.roles.remove(role);
        await interaction.reply(`✅ Successfully removed role **${role.name}** from ${user.tag}.`);
      } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'Failed to remove the role.', ephemeral: true });
      }
    },
  },

  invite: {
    data: {
      name: 'invite',
      description: 'Sends the bot invite link.',
    },
    async execute(interaction) {
      const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;
      await interaction.reply(`🤖 Invite me to your server using this link:\n${inviteLink}`);
    },
  },
};

// Commands Registration
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('Refreshing application (/) commands...');
    const commandsData = Object.values(commands).map(command => command.data);
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commandsData }
    );
    console.log('Successfully registered application (/) commands.');
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
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: 'There was an error executing this command.', ephemeral: true });
  }
});

// Custom Status Management
const statusMessages = ["🎧 Listening to Spotify", "🎮 Playing GTA VI", "📱Watching YouTube"];
const statusTypes = ['dnd', 'idle','online'];
let currentStatusIndex = 0;
let currentTypeIndex = 0;

function updateStatus() {
  const currentStatus = statusMessages[currentStatusIndex];
  const currentType = statusTypes[currentTypeIndex];
  client.user.setPresence({
    activities: [{ name: currentStatus, type: ActivityType.Custom }],
    status: currentType,
  });
  console.log('[ STATUS ] Updated status to:', `${currentStatus} (${currentType})`);console
  currentStatusIndex = (currentStatusIndex + 1) % statusMessages.length;
  currentTypeIndex = (currentTypeIndex + 1) % statusTypes.length;
}

function heartbeat() {
  setInterval(() => {
    console.log('[ HEARTBEAT ] Bot is alive at', new Date().toLocaleTimeString());
  }, 30000); // Log heartbeat every 30 seconds
}

// Log in the bot and set rotating statuses
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);

  // Update status every 10 seconds
  updateStatus();
  setInterval(updateStatus, 10000);

  // Heartbeat log
  heartbeat();
});

client.login(process.env.TOKEN);
