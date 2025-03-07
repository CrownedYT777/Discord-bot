const { Client, GatewayIntentBits, PermissionsBitField, REST, Routes, ActivityType } = require('discord.js');
const fs = require('fs');
const express = require('express');
const path = require('path');
require('dotenv').config();

// Set up express server for keeping the bot alive
const app = express();
const port = 3000;
app.get('/', (req, res) => {
  const imagePath = path.join(__dirname, 'index.html');
  res.sendFile(imagePath);
});
app.listen(port, () => {
  console.log('\x1b[36m[ SERVER ]\x1b[0m', '\x1b[32m SH : https://localhost:' + port + ' ✅\x1b[0m');
});

const SETTINGS_FILE = "welcomeSettings.json";
const BLACKLIST_FILE = "blacklist.json";

// Default structures for the JSON files
const DEFAULT_WELCOME_SETTINGS = {};
const DEFAULT_BLACKLIST = {};

// Function to ensure files exist with default content
function ensureFileExists(file, defaultData) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
        console.log(`✅ Created ${file} with default values`);
    }
}

// Create JSON files if they don't exist
ensureFileExists(SETTINGS_FILE, DEFAULT_WELCOME_SETTINGS);
ensureFileExists(BLACKLIST_FILE, DEFAULT_BLACKLIST);

// Load data from files
let welcomeSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
let blacklistData = JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf8"));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Status rotation configuration
const statusMessages = ["🎧 Listening to Spotify", "🎮 Playing VALORANT"];
const statusTypes = ['dnd', 'idle'];
let currentStatusIndex = 0;
let currentTypeIndex = 0;

function updateStatus() {
  const currentStatus = statusMessages[currentStatusIndex];
  const currentType = statusTypes[currentTypeIndex];
  client.user.setPresence({
    activities: [{ name: currentStatus, type: ActivityType.Custom }],
    status: currentType,
  });
  console.log('\x1b[33m[ STATUS ]\x1b[0m', `Updated status to: ${currentStatus} (${currentType})`);
  currentStatusIndex = (currentStatusIndex + 1) % statusMessages.length;
  currentTypeIndex = (currentTypeIndex + 1) % statusTypes.length;
}

function heartbeat() {
  setInterval(() => {
    console.log('\x1b[35m[ HEARTBEAT ]\x1b[0m', `Bot is alive at ${new Date().toLocaleTimeString()}`);
  }, 30000);
}

const commands = {
    "welcome-setup": {
        data: {
            name: 'welcome-setup',
            description: 'Setup the welcome message',
            options: [
                { type: 3, name: 'background_image', description: 'Enter background image URL', required: true },
                { type: 3, name: 'welcome_message', description: 'Enter the welcome message', required: true },
                { type: 7, name: 'channel', description: 'Set the welcome message channel', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            // Acknowledge interaction immediately
            await interaction.deferReply({ ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.followUp({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const guildId = interaction.guildId;
            const backgroundImage = interaction.options.getString('background_image');
            const welcomeMessage = interaction.options.getString('welcome_message');
            const channel = interaction.options.getChannel('channel');

            if (!channel.isTextBased()) {
                return interaction.followUp({ content: "❌ Please select a valid text channel!", ephemeral: true });
            }

            // Save settings
            welcomeSettings[guildId] = { backgroundImage, welcomeMessage, channelId: channel.id };

            try {
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(welcomeSettings, null, 2));
                await interaction.followUp(`✅ Welcome setup complete!\n**Channel:** <#${channel.id}>\n**Message:** ${welcomeMessage}\n**Background Image:** ${backgroundImage}`);
            } catch (error) {
                console.error("Error saving welcome settings:", error);
                return interaction.followUp({ content: "❌ Failed to save welcome settings.", ephemeral: true });
            }
        }
    },
    "blacklist": {
        data: {
            name: 'blacklist',
            description: 'Add a word to the blacklist',
            options: [
                { type: 3, name: 'word', description: 'The word to blacklist', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
            
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }
            
            const guildId = interaction.guildId;
            const word = interaction.options.getString('word').toLowerCase();
            
            // Initialize guild blacklist if it doesn't exist
            if (!blacklistData[guildId]) {
                blacklistData[guildId] = [];
            }
            
            // Check if word is already blacklisted
            if (blacklistData[guildId].includes(word)) {
                return interaction.reply({ content: `❌ The word "${word}" is already blacklisted.`, ephemeral: true });
            }
            
            // Add word to blacklist
            blacklistData[guildId].push(word);
            
            try {
                fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2));
                await interaction.reply({ content: `✅ Added "${word}" to the blacklist.`, ephemeral: true });
            } catch (error) {
                console.error("Error saving blacklist:", error);
                return interaction.reply({ content: "❌ Failed to update blacklist.", ephemeral: true });
            }
        }
    },
    "whitelist": {
        data: {
            name: 'whitelist',
            description: 'Remove a word from the blacklist',
            options: [
                { type: 3, name: 'word', description: 'The word to whitelist', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
            
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }
            
            const guildId = interaction.guildId;
            const word = interaction.options.getString('word').toLowerCase();
            
            // Check if guild has a blacklist
            if (!blacklistData[guildId] || !blacklistData[guildId].includes(word)) {
                return interaction.reply({ content: `❌ The word "${word}" is not blacklisted.`, ephemeral: true });
            }
            
            // Remove word from blacklist
            blacklistData[guildId] = blacklistData[guildId].filter(w => w !== word);
            
            try {
                fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2));
                await interaction.reply({ content: `✅ Removed "${word}" from the blacklist.`, ephemeral: true });
            } catch (error) {
                console.error("Error saving blacklist:", error);
                return interaction.reply({ content: "❌ Failed to update blacklist.", ephemeral: true });
            }
        }
    },
    "kick": {
        data: {
            name: 'kick',
            description: 'Kick a member from the server',
            options: [
                { type: 6, name: 'user', description: 'The user to kick', required: true },
                { type: 3, name: 'reason', description: 'Reason for kicking the user', required: false }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
            
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }
            
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const member = interaction.guild.members.cache.get(user.id);
            
            if (!member) {
                return interaction.reply({ content: "❌ Unable to find that member.", ephemeral: true });
            }
            
            if (!member.kickable) {
                return interaction.reply({ content: "❌ I cannot kick this user. They may have higher permissions than me.", ephemeral: true });
            }
            
            try {
                await member.kick(reason);
                await interaction.reply({ content: `✅ Kicked ${user.tag} | Reason: ${reason}` });
            } catch (error) {
                console.error("Error kicking member:", error);
                return interaction.reply({ content: "❌ Failed to kick the member.", ephemeral: true });
            }
        }
    },
    "ban": {
        data: {
            name: 'ban',
            description: 'Ban a member from the server',
            options: [
                { type: 6, name: 'user', description: 'The user to ban', required: true },
                { type: 3, name: 'reason', description: 'Reason for banning the user', required: false },
                { type: 4, name: 'days', description: 'Number of days of messages to delete (0-7)', required: false }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
            
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }
            
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const days = Math.min(7, Math.max(0, interaction.options.getInteger('days') || 0));
            
            try {
                await interaction.guild.members.ban(user, { deleteMessageDays: days, reason });
                await interaction.reply({ content: `✅ Banned ${user.tag} | Reason: ${reason} | Message deletion: ${days} days` });
            } catch (error) {
                console.error("Error banning member:", error);
                return interaction.reply({ content: "❌ Failed to ban the member.", ephemeral: true });
            }
        }
    },
    "unban": {
        data: {
            name: 'unban',
            description: 'Unban a user from the server',
            options: [
                { type: 3, name: 'userid', description: 'The ID of the user to unban', required: true },
                { type: 3, name: 'reason', description: 'Reason for unbanning the user', required: false }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
            
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }
            
            const userId = interaction.options.getString('userid');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            
            try {
                await interaction.guild.members.unban(userId, reason);
                await interaction.reply({ content: `✅ Unbanned user with ID ${userId} | Reason: ${reason}` });
            } catch (error) {
                console.error("Error unbanning user:", error);
                return interaction.reply({ content: "❌ Failed to unban the user. Make sure the ID is correct and the user is banned.", ephemeral: true });
            }
        }
    },
    "ping": {
        data: {
            name: 'ping',
            description: 'Check the bot\'s latency',
        },
        async execute(interaction) {
            // Using fetchReply for now to get the correct timestamp
            const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
            const latency = sent.createdTimestamp - interaction.createdTimestamp;
            const apiPing = client.ws.ping > 0 ? Math.round(client.ws.ping) : 'unavailable';
            await interaction.editReply(`🏓 Pong! Bot Latency: ${latency}ms | API Latency: ${apiPing === 'unavailable' ? 'unavailable' : `${apiPing}ms`}`);
        }
    },
    "purge": {
        data: {
            name: 'purge',
            description: 'Delete a specified number of messages',
            options: [
                { type: 4, name: 'amount', description: 'Number of messages to delete (1-100)', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
            
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }
            
            const amount = Math.min(100, Math.max(1, interaction.options.getInteger('amount')));
            
            try {
                await interaction.channel.bulkDelete(amount, true);
                await interaction.reply({ content: `✅ Deleted ${amount} messages.`, ephemeral: true });
            } catch (error) {
                console.error("Error purging messages:", error);
                return interaction.reply({ content: "❌ Failed to delete messages. Messages older than 14 days cannot be bulk deleted.", ephemeral: true });
            }
        }
    },
    "timeout": {
        data: {
            name: 'timeout',
            description: 'Timeout a member',
            options: [
                { type: 6, name: 'user', description: 'The user to timeout', required: true },
                { type: 4, name: 'minutes', description: 'Timeout duration in minutes', required: true },
                { type: 3, name: 'reason', description: 'Reason for the timeout', required: false }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
            
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }
            
            const user = interaction.options.getUser('user');
            const minutes = interaction.options.getInteger('minutes');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const member = interaction.guild.members.cache.get(user.id);
            
            if (!member) {
                return interaction.reply({ content: "❌ Unable to find that member.", ephemeral: true });
            }
            
            if (!member.moderatable) {
                return interaction.reply({ content: "❌ I cannot timeout this user. They may have higher permissions than me.", ephemeral: true });
            }
            
            try {
                // Convert minutes to milliseconds (maximum 28 days)
                const duration = Math.min(minutes * 60 * 1000, 28 * 24 * 60 * 60 * 1000);
                if (duration <= 0) {
                    return interaction.reply({ content: "❌ Timeout duration must be positive.", ephemeral: true });
                }
                await member.timeout(duration, reason);
                await interaction.reply({ content: `✅ Timed out ${user.tag} for ${minutes} minutes | Reason: ${reason}` });
            } catch (error) {
                console.error("Error timing out member:", error);
                return interaction.reply({ content: "❌ Failed to timeout the member.", ephemeral: true });
            }
        }
    },
    "warn": {
        data: {
            name: 'warn',
            description: 'Warn a member',
            options: [
                { type: 6, name: 'user', description: 'The user to warn', required: true },
                { type: 3, name: 'reason', description: 'Reason for the warning', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
            
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }
            
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            const member = interaction.guild.members.cache.get(user.id);
            
            if (!member) {
                return interaction.reply({ content: "❌ Unable to find that member.", ephemeral: true });
            }
            
            try {
                // Send warning to the member via DM
                try {
                    await member.send(`⚠️ You have been warned in **${interaction.guild.name}** for: ${reason}`);
                } catch (dmError) {
                    console.log(`Could not send DM to ${user.tag}`);
                }
                
                // Reply in the channel
                await interaction.reply({ content: `⚠️ Warned ${user.tag} | Reason: ${reason}` });
            } catch (error) {
                console.error("Error warning member:", error);
                return interaction.reply({ content: "❌ Failed to warn the member.", ephemeral: true });
            }
        }
    },
    "lock": {
        data: {
            name: 'lock',
            description: 'Lock a channel',
            options: [
                { type: 7, name: 'channel', description: 'The channel to lock (defaults to current)', required: false },
                { type: 3, name: 'reason', description: 'Reason for locking the channel', required: false }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
            
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.reply({ content: "❌ You don't have permis
