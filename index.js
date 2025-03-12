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
app.listen(port, '0.0.0.0', () => {
  console.log('\x1b[36m[ SERVER ]\x1b[0m', '\x1b[32m Server running on http://0.0.0.0:' + port + ' ✅\x1b[0m');
});

const SETTINGS_FILE = "welcomeSettings.json";
const BLACKLIST_FILE = "blacklist.json";
const MODERATORS_FILE = "moderators.json";

// Default structures for the JSON files
const DEFAULT_WELCOME_SETTINGS = {};
const DEFAULT_BLACKLIST = {};
const DEFAULT_MODERATORS = { "moderators": {} };

// Function to ensure files exist with default content
function ensureFileExists(file, defaultData) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
        console.log(`✅ Created ${file} with default values`);
    }
}

// Function to backup files to GitHub to a specific repository
async function backupToGitHub(files) {
    try {
        const { execSync } = require('child_process');

        // Configuration constants - Update these values with your repository details
        const GITHUB_USERNAME = process.env.GITHUB_USERNAME || "YourGitHubUsername";
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "YourGitHubUsername"; // Personal Access Token
        const GITHUB_REPO = process.env.GITHUB_REPO || "YourRepositoryName";
        const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

        // Make sure we have the token
        if (!GITHUB_TOKEN) {
            console.log('❌ GitHub token not found. Please set GITHUB_TOKEN environment variable.');
            return false;
        }

        // Create a temporary directory for the repository
        const tempDir = `.git-backup-${Date.now()}`;
        execSync(`mkdir -p ${tempDir}`);

        try {
            // Change to temp directory
            process.chdir(tempDir);

            // Clone the repository (shallow clone for speed)
            const repoUrl = `https://${GITHUB_USERNAME}:${GITHUB_TOKEN}@github.com/${GITHUB_USERNAME}/${GITHUB_REPO}.git`;
            execSync(`git clone --depth 1 -b ${GITHUB_BRANCH} ${repoUrl} .`);

            // Configure Git
            execSync('git config user.name "DiscordBot"');
            execSync('git config user.email "discordbot@example.com"');

            // Copy the files to be backed up
            for (const file of files) {
                // Extract just the filename from the path
                const filename = file.split('/').pop();
                execSync(`cp ../${file} ./${filename}`);
                execSync(`git add ${filename}`);
            }

            // Create a commit
            const timestamp = new Date().toISOString();
            execSync(`git commit -m "Auto-backup configuration files - ${timestamp}"`);

            // Push to GitHub
            execSync(`git push origin ${GITHUB_BRANCH}`);

            console.log(`✅ Successfully backed up ${files.join(', ')} to GitHub repository ${GITHUB_USERNAME}/${GITHUB_REPO} at ${timestamp}`);
            return true;
        } finally {
            // Return to original directory and clean up
            process.chdir('..');
            execSync(`rm -rf ${tempDir}`);
        }
    } catch (error) {
        console.error('❌ Failed to backup to GitHub:', error.message);
        return false;
    }
}

// Create JSON files if they don't exist
ensureFileExists(SETTINGS_FILE, DEFAULT_WELCOME_SETTINGS);
ensureFileExists(BLACKLIST_FILE, DEFAULT_BLACKLIST);
ensureFileExists(MODERATORS_FILE, DEFAULT_MODERATORS);

// Load data from files
let welcomeSettings = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
let blacklistData = JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf8"));
let moderatorsData = JSON.parse(fs.readFileSync(MODERATORS_FILE, "utf8"));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Status rotation configuration
const statusMessages = ["🎧 Listening to Spotify", "🎮 Playing GTA VI"];
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
    console.log('\x1b[35m[ HEARTBEAT ]\x1b[0m', `${client.user.tag} is alive at ${new Date().toLocaleTimeString()}`);
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

                // Backup to GitHub
                backupToGitHub([SETTINGS_FILE]);

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

                // Backup to GitHub
                backupToGitHub([BLACKLIST_FILE]);

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

                // Backup to GitHub
                backupToGitHub([BLACKLIST_FILE]);

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
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.reply({ content: "❌ I don't have permission to manage this channel.", ephemeral: true });
            }

            try {
                await targetChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    SendMessages: false,
                    AddReactions: false
                }, { reason });

                await interaction.reply({ content: `🔒 Locked ${targetChannel} | Reason: ${reason}` });
            } catch (error) {
                console.error("Error locking channel:", error);
                return interaction.reply({ content: "❌ Failed to lock the channel.", ephemeral: true });
            }
        }
    },
    "unlock": {
        data: {
            name: 'unlock',
            description: 'Unlock a locked channel',
            options: [
                { type: 7, name: 'channel', description: 'The channel to unlock (defaults to current)', required: false },
                { type: 3, name: 'reason', description: 'Reason for unlocking the channel', required: false }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.reply({ content: "❌ I don't have permission to manage this channel.", ephemeral: true });
            }

            try {
                await targetChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    SendMessages: null,
                    AddReactions: null
                }, { reason });

                await interaction.reply({ content: `🔓 Unlocked ${targetChannel} | Reason: ${reason}` });
            } catch (error) {
                console.error("Error unlocking channel:", error);
                return interaction.reply({ content: "❌ Failed to unlock the channel.", ephemeral: true });
            }
        }
    },
    "slowmode": {
        data: {
            name: 'slowmode',
            description: 'Set slowmode for a channel',
            options: [
                { type: 4, name: 'seconds', description: 'Slowmode in seconds (0 to disable)', required: true },
                { type: 7, name: 'channel', description: 'The channel to set slowmode for (defaults to current)', required: false },
                { type: 3, name: 'reason', description: 'Reason for setting slowmode', required: false }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const seconds = interaction.options.getInteger('seconds');
            const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
            const reason = interaction.options.getString('reason') || 'No reason provided';

            if (!targetChannel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.reply({ content: "❌ I don't have permission to manage this channel.", ephemeral: true });
            }

            try {
                // Discord rate limit constraints: 0 to 21600 seconds (6 hours)
                const rateLimit = Math.min(21600, Math.max(0, seconds));
                await targetChannel.setRateLimitPerUser(rateLimit, reason);

                if (rateLimit === 0) {
                    await interaction.reply({ content: `✅ Slowmode disabled in ${targetChannel}` });
                } else {
                    await interaction.reply({ content: `✅ Set slowmode to ${rateLimit} seconds in ${targetChannel} | Reason: ${reason}` });
                }
            } catch (error) {
                console.error("Error setting slowmode:", error);
                return interaction.reply({ content: "❌ Failed to set slowmode.", ephemeral: true });
            }
        }
    },
    "addrole": {
        data: {
            name: 'addrole',
            description: 'Add a role to a user',
            options: [
                { type: 6, name: 'user', description: 'The user to add the role to', required: true },
                { type: 8, name: 'role', description: 'The role to add', required: true },
                { type: 3, name: 'reason', description: 'Reason for adding the role', required: false }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const user = interaction.options.getUser('user');
            const role = interaction.options.getRole('role');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const member = interaction.guild.members.cache.get(user.id);

            if (!member) {
                return interaction.reply({ content: "❌ Unable to find that member.", ephemeral: true });
            }

            if (!role) {
                return interaction.reply({ content: "❌ Unable to find that role.", ephemeral: true });
            }

            // Check if the bot's role is higher than the role being assigned
            if (interaction.guild.members.me.roles.highest.position <= role.position) {
                return interaction.reply({ content: "❌ I cannot assign a role equal to or higher than my highest role.", ephemeral: true });
            }

            // Check if the user already has the role
            if (member.roles.cache.has(role.id)) {
                return interaction.reply({ content: `❌ ${user.tag} already has the ${role.name} role.`, ephemeral: true });
            }

            try {
                await member.roles.add(role, reason);
                await interaction.reply({ content: `✅ Added the ${role.name} role to ${user.tag} | Reason: ${reason}` });
            } catch (error) {
                console.error("Error adding role:", error);
                return interaction.reply({ content: "❌ Failed to add the role. Check my permissions.", ephemeral: true });
            }
        }
    },
    "removerole": {
        data: {
            name: 'removerole',
            description: 'Remove a role from a user',
            options: [
                { type: 6, name: 'user', description: 'The user to remove the role from', required: true },
                { type: 8, name: 'role', description: 'The role to remove', required: true },
                { type: 3, name: 'reason', description: 'Reason for removing the role', required: false }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const user = interaction.options.getUser('user');
            const role = interaction.options.getRole('role');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const member = interaction.guild.members.cache.get(user.id);

            if (!member) {
                return interaction.reply({ content: "❌ Unable to find that member.", ephemeral: true });
            }

            if (!role) {
                return interaction.reply({ content: "❌ Unable to find that role.", ephemeral: true });
            }

            // Check if the bot's role is higher than the role being removed
            if (interaction.guild.members.me.roles.highest.position <= role.position) {
                return interaction.reply({ content: "❌ I cannot remove a role equal to or higher than my highest role.", ephemeral: true });
            }

            // Check if the user has the role
            if (!member.roles.cache.has(role.id)) {
                return interaction.reply({ content: `❌ ${user.tag} does not have the ${role.name} role.`, ephemeral: true });
            }

            try {
                await member.roles.remove(role, reason);
                await interaction.reply({ content: `✅ Removed the ${role.name} role from ${user.tag} | Reason: ${reason}` });
            } catch (error) {
                console.error("Error removing role:", error);
                return interaction.reply({ content: "❌ Failed to remove the role. Check my permissions.", ephemeral: true });
            }
        }
    },
    "modadd": {
        data: {
            name: 'modadd',
            description: 'Add a user or role to the moderator whitelist',
            options: [
                { type: 9, name: 'target', description: 'The user or role to add to the moderator whitelist', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "❌ You need Administrator permission to use this command.", ephemeral: true });
            }

            const guildId = interaction.guildId;
            const target = interaction.options.getMentionable('target');

            // Initialize guild moderators if it doesn't exist
            if (!moderatorsData.moderators[guildId]) {
                moderatorsData.moderators[guildId] = {
                    users: [],
                    roles: []
                };
            }

            // Check if target is a user or role
            let isUser = false;
            if (target.user !== undefined || target.username !== undefined || target.discriminator !== undefined) {
                isUser = true;
            }
            const targetId = target.id;
            const targetType = isUser ? 'users' : 'roles';
            const targetList = moderatorsData.moderators[guildId][targetType];

            // Check if already whitelisted
            if (targetList.includes(targetId)) {
                return interaction.reply({ 
                    content: `❌ ${isUser ? `User ${target.tag}` : `Role ${target.name}`} is already in the moderator whitelist.`, 
                    ephemeral: true 
                });
            }

            // Add to whitelist
            targetList.push(targetId);

            try {
                fs.writeFileSync(MODERATORS_FILE, JSON.stringify(moderatorsData, null, 2));

                // Backup to GitHub if the function exists
                if (typeof backupToGitHub === 'function') {
                    backupToGitHub([MODERATORS_FILE]);
}

                // Different handling for users vs. roles
                let displayName;
                if (isUser) {
                    displayName = `<@${targetId}>`; // Always use user mention format
                } else {
                    displayName = `<@&${targetId}>`; // Always use role mention format
                }

                await interaction.reply({ 
                    content: `✅ Added ${isUser ? `User ${displayName}` : `Role ${displayName}`} to the moderator whitelist.`
                });
            } catch (error) {
                console.error("Error saving moderator data:", error);
                return interaction.reply({ content: "❌ Failed to update moderator whitelist.", ephemeral: true });
            }
        }
    },
    "modremove": {
        data: {
            name: 'modremove',
            description: 'Remove a user or role from the moderator whitelist',
            options: [
                { type: 9, name: 'target', description: 'The user or role to remove from the moderator whitelist', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "❌ You need Administrator permission to use this command.", ephemeral: true });
            }

            const guildId = interaction.guildId;
            const target = interaction.options.getMentionable('target');

            // Check if moderator system is set up for this guild
            if (!moderatorsData.moderators[guildId]) {
                return interaction.reply({ 
                    content: "❌ No moderator whitelist found for this server.", 
                    ephemeral: true 
                });
            }

            // Check if target is a user or role
            let isUser = false;
            if (target.user !== undefined || target.username !== undefined || target.discriminator !== undefined) {
                isUser = true;
            }
            const targetId = target.id;
            const targetType = isUser ? 'users' : 'roles';
            const targetList = moderatorsData.moderators[guildId][targetType];

            // Check if target is in the whitelist
            if (!targetList.includes(targetId)) {
                return interaction.reply({ 
                    content: `❌ ${isUser ? `User ${target.tag}` : `Role ${target.name}`} is not in the moderator whitelist.`, 
                    ephemeral: true 
                });
            }

            // Remove from whitelist
            moderatorsData.moderators[guildId][targetType] = targetList.filter(id => id !== targetId);

            try {
                fs.writeFileSync(MODERATORS_FILE, JSON.stringify(moderatorsData, null, 2));

                // Backup to GitHub if the function exists
                if (typeof backupToGitHub === 'function') {
                    backupToGitHub([MODERATORS_FILE]);
                }

                // Different handling for users vs. roles
                let displayName;
                if (isUser) {
                    displayName = `<@${targetId}>`; // Always use user mention format
                } else {
                    displayName = `<@&${targetId}>`; // Always use role mention format
                }

                await interaction.reply({ 
                    content: `✅ Removed ${isUser ? `User ${displayName}` : `Role ${displayName}`} from the moderator whitelist.`
                });
            } catch (error) {
                console.error("Error saving moderator data:", error);
                return interaction.reply({ content: "❌ Failed to update moderator whitelist.", ephemeral: true });
            }
        }
    },
    "blacklisted-words": {
        data: {
            name: 'blacklisted-words',
            description: 'List all blacklisted words in the server',
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const guildId = interaction.guildId;

            // Check if there are blacklisted words for this server
            if (!blacklistData[guildId] || blacklistData[guildId].length === 0) {
                return interaction.reply({ content: "⚠️ There are no blacklisted words for this server.", ephemeral: true });
            }

            // Format the blacklisted words
            const wordList = blacklistData[guildId].map((word, index) => `${index + 1}. ${word}`).join('\n');

            try {
                await interaction.reply({ 
                    content: `📋 **Blacklisted Words in ${interaction.guild.name}**\n\n${wordList}`,
                    ephemeral: true // Only visible to the command user for privacy
                });
            } catch (error) {
                console.error("Error listing blacklisted words:", error);
                return interaction.reply({ content: "❌ Failed to list blacklisted words.", ephemeral: true });
            }
        }
    },
    "health": {
        data: {
            name: 'health',
            description: 'Show bot health and status information',
        },
        async execute(interaction) {
            // Set the authorized user ID here
            const AUTHORIZED_USER_ID = process.env.OWNER_ID || '123456789012345678'; // Replace with your Discord user ID

            // Check if the user is authorized
            if (interaction.user.id !== AUTHORIZED_USER_ID) {
                return interaction.reply({ 
                    content: "❌ You don't have permission to use this command. Only the bot owner can access health information.",
                    ephemeral: true 
                });
            }

            // Get uptime
            const uptime = process.uptime();
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

            // Get memory usage
            const memoryUsage = process.memoryUsage();
            const totalMemoryMB = Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100;
            const usedMemoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100;
            const memoryPercentage = Math.round((usedMemoryMB / totalMemoryMB) * 100);

            // Get bot version
            const version = require('./package.json').version || '1.0.0';

            // Get ping
            const ping = Math.round(client.ws.ping);

            // Create embedded response
            const { EmbedBuilder } = require('discord.js');
            const healthEmbed = new EmbedBuilder()
                .setColor(0x2B82EA)
                .setTitle('📊 Bot Health Information')
                .setDescription(`Status information for ${client.user.tag}`)
                .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 128 }))
                .addFields(
                    { name: '⏱️ Uptime', value: uptimeString, inline: true },
                    { name: '🖥️ Servers', value: `${client.guilds.cache.size}`, inline: true },
                    { name: '👥 Users', value: `${client.users.cache.size}`, inline: true },
                    { name: '🔄 Ping', value: `${ping}ms`, inline: true },
                    { name: '💾 Memory', value: `${usedMemoryMB}MB / ${totalMemoryMB}MB (${memoryPercentage}%)`, inline: true },
                    { name: '🔢 Version', value: version, inline: true },
                    { name: '📅 Last Started', value: `<t:${Math.floor(Date.now() / 1000 - uptime)}:R>`, inline: true },
                    { name: '🔐 Accessed By', value: `<@${interaction.user.id}>`, inline: true },
                )
                .setFooter({ text: 'ZenithFlare Health Monitor' })
                .setTimestamp();

            await interaction.reply({ embeds: [healthEmbed] });
        }
    }
};

// Make sure to register commands when bot is ready
// Check for required environment variables
if (!process.env.TOKEN || !process.env.CLIENT_ID) {
    console.error('❌ Missing required environment variables. Please check your .env file.');
    process.exit(1);
}

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log('\x1b[36m[ INFO ]\x1b[0m', `\x1b[34mPing: ${client.ws.ping} ms \x1b[0m`);
    console.log('\x1b[36m[ INFO ]\x1b[0m', `\x1b[35mBot ID: ${client.user.id} \x1b[0m`);
    console.log('\x1b[36m[ INFO ]\x1b[0m', `\x1b[34mConnected to ${client.guilds.cache.size} server(s) \x1b[0m`);

    // Start status rotation
    updateStatus();
    setInterval(updateStatus, 10000);
    heartbeat();

    // Register Commands Globally
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log('Started refreshing application commands...');
        // For global commands (can take up to an hour to register)
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: Object.values(commands).map(cmd => cmd.data) }
        );

        // For testing in a specific server (instant registration)
        // Replace GUILD_ID with your server ID
        if (process.env.GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: Object.values(commands).map(cmd => cmd.data) }
            );
            console.log('✅ Successfully registered guild-specific commands for testing.');
        }
        console.log('✅ Successfully registered global slash commands.');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = commands[interaction.commandName];
    if (command) {
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);
            // Check if the interaction is still valid before responding
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: "❌ An error occurred while executing this command.", ephemeral: true })
                    .catch(err => console.error("Failed to send followUp:", err));
            } else {
                try {
                    await interaction.reply({ content: "❌ An error occurred while executing this command.", ephemeral: true });
                } catch (replyError) {
                    console.error("Failed to reply to interaction:", replyError);
                }
            }
        }
    }
});

// Filter messages for blacklisted words
client.on('messageCreate', async message => {
    // Don't process non-guild messages
    if (!message.guild) return;

    const guildId = message.guild.id;

    // Check if this guild has a blacklist
    if (blacklistData[guildId] && blacklistData[guildId].length > 0) {
        // Check if the user is a moderator or has a whitelisted role
        let isWhitelisted = false;

        // Check if moderator system is set up for this guild
        if (moderatorsData.moderators[guildId]) {
            // Check if user is directly whitelisted
            if (moderatorsData.moderators[guildId].users.includes(message.author.id)) {
                isWhitelisted = true;
            } else {
                // Check if user has any whitelisted roles
                const memberRoles = message.member.roles.cache.map(role => role.id);
                const whitelistedRoles = moderatorsData.moderators[guildId].roles;

                if (whitelistedRoles.some(roleId => memberRoles.includes(roleId))) {
                    isWhitelisted = true;
                }
            }
        }

        // Skip blacklist check if user is whitelisted
        if (isWhitelisted) return;

        const content = message.content.toLowerCase();

        // Check if message contains any blacklisted words - improved matching
        const containsBlacklisted = blacklistData[guildId].some(word => {
            // Create a regex pattern that's case insensitive
            const wordPattern = new RegExp(word, 'i');
            return wordPattern.test(content);
        });

        if (containsBlacklisted && message.deletable) {
            try {
                await message.delete();
                // Optionally send a warning to the user
                const warningMsg = await message.channel.send(
                    `⚠️ ${message.author}, your message contained blacklisted word(s) and was removed.`
                );

                // Delete the warning after a few seconds
                setTimeout(() => {
                    warningMsg.delete().catch(error => console.error("Error deleting warning message:", error));
                }, 5000);

                console.log(`Deleted message from ${message.author.tag} in ${message.guild.name} (${message.guild.id}) for blacklisted content`);
            } catch (error) {
                console.error("Error deleting blacklisted content:", error);
            }
        }
    }
});

client.on('guildMemberAdd', async (member) => {
    const guildId = member.guild.id;

    // Check if the guild has a welcome setup
    if (!welcomeSettings[guildId] || !welcomeSettings[guildId].channelId) {
        console.log(`⚠️ No welcome settings found for guild ${guildId}`);
        return;
    }

    const { channelId, backgroundImage, welcomeMessage } = welcomeSettings[guildId];
    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) {
        console.log(`⚠️ Channel not found: ${channelId}`);
        return;
    }

    // Encode values for the URL
    const userNameEncoded = encodeURIComponent(member.user.username);
    const avatarUrl = encodeURIComponent(member.user.displayAvatarURL({ size: 512 }).replace('.webp', '.png'));
    const memberCount = member.guild.memberCount;
    const welcomeMessageEncoded = encodeURIComponent(welcomeMessage);

    // Generate Popcat API welcome image link
    const welcomeImageUrl = `https://api.popcat.xyz/welcomecard?background=${backgroundImage}&width=787&height=400&text1=${userNameEncoded}&text2=${welcomeMessageEncoded}&text3=Member+%23${memberCount}&avatar=${avatarUrl}`;

    try {
        await channel.send(welcomeImageUrl);
        console.log(`✅ Welcome image link sent to ${member.user.username} in ${member.guild.name}`);
    } catch (error) {
        console.error(`❌ Failed to send welcome image link:`, error);
    }
});

// Global error handling to prevent crashes
process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

client.login(process.env.TOKEN);
