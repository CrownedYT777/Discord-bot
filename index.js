const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActivityType, 
    Routes, 
    REST,
    Partials,
    PermissionsBitField
} = require('discord.js');
const fs = require('fs');
const express = require('express');
const path = require('path');
const https = require('https');
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

const WELCOME_SETTINGS_FILE = "welcomeSettings.json";
const BLACKLIST_FILE = "blacklist.json";
const MODERATORS_FILE = "moderators.json";
const SECURITY_SETTINGS_FILE = "securitySettings.json";

// Default structures for the JSON files
const DEFAULT_WELCOME_SETTINGS = {};
const DEFAULT_BLACKLIST = { 
    categories: { 
        profanity: { enabled: true, words: [], description: "Words considered profane or offensive" }, 
        spam: { enabled: true, words: [], description: "Words or phrases typically used in spam messages" }, 
        custom: { enabled: true, words: [], description: "Custom words for this server" } 
    },
    guildCategories: {} 
};
const DEFAULT_MODERATORS = { "moderators": {} };
const DEFAULT_SECURITY_SETTINGS = {
    "antiNuke": {
        enabled: false,
        logChannel: null,
        whitelistedRoles: [],
        whitelistedUsers: [],
        punishment: "ban", // ban, kick, or strip roles
        punishmentDuration: 0, // 0 means permanent for bans
        maxRoleDeletes: 3,    // Trigger anti-nuke after X role deletions 
        maxChannelDeletes: 3, // Trigger anti-nuke after X channel deletions
        maxBans: 5,           // Trigger anti-nuke after X bans
        timeframe: 10000
    },
    "antiRaid": {
        enabled: false,
        logChannel: null,
        joinThreshold: 5,     // Number of joins to trigger anti-raid
        joinTimeframe: 10000, // Timeframe in ms (10 seconds) for join rate limiting
        accountAgeDays: 7,    // Minimum account age in days
        action: "verification", // verification, kick, or ban
        raidMode: false,       // Current raid mode status
        autoRaidMode: true     // Whether to automatically enable raid mode
    },
    "antiSpam": {
        enabled: false,
        logChannel: null,
        messageThreshold: 5,  // Number of messages before considered spam
        messageDuplicateThreshold: 3, // Number of duplicate messages before considered spam
        timeframe: 5000,      // Timeframe in ms (5 seconds) for message rate
        mentionLimit: 5,      // Max mentions in a single message
        punishment: "mute",   // mute, kick, or ban
        punishmentDuration: 300000 // 5 minutes (in ms) for mutes
    }
};

// Function to ensure files exist with default content
function ensureFileExists(file, defaultData) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
        console.log(`✅ Created ${file} with default values`);
    }
}

// Create JSON files if they don't exist
ensureFileExists(WELCOME_SETTINGS_FILE, DEFAULT_WELCOME_SETTINGS);
ensureFileExists(BLACKLIST_FILE, DEFAULT_BLACKLIST);
ensureFileExists(MODERATORS_FILE, DEFAULT_MODERATORS);
ensureFileExists(SECURITY_SETTINGS_FILE, DEFAULT_SECURITY_SETTINGS);

// Load data from files
let welcomeSettings = JSON.parse(fs.readFileSync(WELCOME_SETTINGS_FILE, "utf8"));
let blacklistData = JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf8"));
let moderatorsData = JSON.parse(fs.readFileSync(MODERATORS_FILE, "utf8"));
let securitySettings = JSON.parse(fs.readFileSync(SECURITY_SETTINGS_FILE, "utf8"));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Status rotation configuration
const statusMessages = [
    { type: ActivityType.Playing, message: "with ayan" }, // Type 0
    { type: ActivityType.Streaming, message: "on Twitch" }, // Type 1
    { type: ActivityType.Listening, message: "Ayan's struggles" }, // Type 2
    { type: ActivityType.Watching, message: "https://discord-bot-izrw.onrender.com" }, // Type 3
    { type: ActivityType.Custom, message: "sleeping with ayan💖" }, // Type 4
    { type: ActivityType.Competing, message: "🍑" } // Type 5
];
const statusTypes = ['idle', 'dnd', 'dnd', 'online', 'idle'];
let currentStatusIndex = 0;
let currentTypeIndex = 0;

function updateStatus() {
  const currentStatus = statusMessages[currentStatusIndex];
  const currentType = statusTypes[currentTypeIndex];
  client.user.setPresence({
    activities: [{ name: currentStatus.message, type: currentStatus.type }],
    status: currentType,
  });
  console.log('\x1b[33m[ STATUS ]\x1b[0m', `Updated status to: ${currentStatus.type} ${currentStatus.message} (${currentType})`);
  currentStatusIndex = (currentStatusIndex + 1) % statusMessages.length;
  currentTypeIndex = (currentTypeIndex + 1) % statusTypes.length;
}

function heartbeat() {
  setInterval(() => {
    console.log('\x1b[35m[ HEARTBEAT ]\x1b[0m', `${client.user.tag} is alive at ${new Date().toLocaleTimeString()}`);
  }, 50000);
}

const commands = {
    "welcome-setup": {
        data: {
            name: 'welcome-setup',
            description: 'Setup the welcome message',
            options: [
                { type: 3, name: 'welcome_message', description: 'Enter the welcome message', required: true },
                { type: 7, name: 'channel', description: 'Set the welcome message channel', required: true },
                { type: 3, name: 'background_image', description: 'Enter background image URL (defaults to Discord-style bg if not provided)', required: false }
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
            // Use a default background image if none provided
            const backgroundImage = interaction.options.getString('background_image') || "https://i.imgur.com/syDfHGn.png";
            const welcomeMessage = interaction.options.getString('welcome_message');
            const channel = interaction.options.getChannel('channel');

            if (!channel.isTextBased()) {
                return interaction.followUp({ content: "❌ Please select a valid text channel!", ephemeral: true });
            }

            // Save settings
            welcomeSettings[guildId] = { backgroundImage, welcomeMessage, channelId: channel.id };

            try {
                fs.writeFileSync(WELCOME_SETTINGS_FILE, JSON.stringify(welcomeSettings, null, 2));

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
            { type: 3, name: 'word', description: 'The word to blacklist', required: true },
            { type: 3, name: 'category', description: 'Category for the word', required: true }
        ],
    },
    async execute(interaction) {
        if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

        // Acknowledge the interaction immediately to avoid timeout
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.followUp({ content: "❌ You don't have permission to use this command.", ephemeral: true });
        }

        const word = interaction.options.getString('word').toLowerCase();
        const category = interaction.options.getString('category');

        // Make sure the category exists
        if (!blacklistData.categories[category]) {
            return interaction.followUp({ content: `❌ Category "${category}" does not exist.`, ephemeral: true });
        }

        // Check if word is already blacklisted in this category
        if (blacklistData.categories[category].words.includes(word)) {
            return interaction.followUp({ content: `❌ The word "${word}" is already blacklisted in the ${category} category.`, ephemeral: true });
        }

        // Add word to the category
        blacklistData.categories[category].words.push(word);

        try {
            fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2));

            await interaction.followUp({ content: `✅ Added "${word}" to the ${category} blacklist category.`, ephemeral: true });
        } catch (error) {
            console.error("Error saving blacklist:", error);

            // Ensure the interaction is appropriately handled
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "❌ Failed to update blacklist.", ephemeral: true });
            } else {
                await interaction.followUp({ content: "❌ Failed to update blacklist.", ephemeral: true });
            }
        }
    }
    },
    "whitelist": {
        data: {
            name: 'whitelist',
            description: 'Remove a word from the blacklist',
            options: [
                { type: 3, name: 'word', description: 'The word to whitelist', required: true },
                { type: 3, name: 'category', description: 'Category of the word', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const word = interaction.options.getString('word').toLowerCase();
            const category = interaction.options.getString('category');

            // Check if category exists and contains the word
            if (!blacklistData.categories[category] || !blacklistData.categories[category].words.includes(word)) {
                return interaction.reply({ content: `❌ The word "${word}" is not blacklisted in the ${category} category.`, ephemeral: true });
            }

            // Remove word from the category
            blacklistData.categories[category].words = blacklistData.categories[category].words.filter(w => w !== word);

            try {
                fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2));

                await interaction.reply({ content: `✅ Removed "${word}" from the ${category} blacklist category.`, ephemeral: true });
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
    "create-category": {
        data: {
            name: 'create-category',
            description: 'Create a new custom blacklist category',
            options: [
                { type: 3, name: 'name', description: 'Name for the new category (lowercase, no spaces)', required: true },
                { type: 3, name: 'description', description: 'Short description of the category', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "❌ You need Administrator permission to create categories.", ephemeral: true });
            }

            const categoryName = interaction.options.getString('name').toLowerCase().trim().replace(/\s+/g, '-');
            const description = interaction.options.getString('description');

            // Validate category name (alphanumeric + hyphens only)
            if (!/^[a-z0-9-]+$/.test(categoryName)) {
                return interaction.reply({ 
                    content: "❌ Invalid category name. Use only lowercase letters, numbers, and hyphens.", 
                    ephemeral: true 
                });
            }

            // Check if category already exists
            if (blacklistData.categories[categoryName]) {
                return interaction.reply({ 
                    content: `❌ Category "${categoryName}" already exists.`, 
                    ephemeral: true 
                });
            }

            // Set up server-specific categories if they don't exist
            if (!blacklistData.guildCategories) {
                blacklistData.guildCategories = {};
            }

            if (!blacklistData.guildCategories[interaction.guildId]) {
                blacklistData.guildCategories[interaction.guildId] = [];
            }

            // Add the new category
            blacklistData.categories[categoryName] = {
                enabled: true,
                words: [],
                description: description,
                guildId: interaction.guildId
            };

            // Keep track of which categories belong to which guild
            blacklistData.guildCategories[interaction.guildId].push(categoryName);

            try {
                fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2));

                await interaction.reply({ 
                    content: `✅ Created new category "${categoryName}" with description: ${description}`, 
                    ephemeral: false 
                });
            } catch (error) {
                console.error("Error saving new category:", error);
                return interaction.reply({ content: "❌ Failed to create new category.", ephemeral: true });
            }
        }
    },
    "toggle-category": {
        data: {
            name: 'toggle-category',
            description: 'Enable or disable a blacklist category',
            options: [
                { type: 3, name: 'category', description: 'The category to toggle', required: true },
                { type: 5, name: 'enabled', description: 'Whether to enable or disable the category', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const category = interaction.options.getString('category');
            const enabled = interaction.options.getBoolean('enabled');

            // Check if category exists
            if (!blacklistData.categories[category]) {
                return interaction.reply({ content: `❌ Category "${category}" does not exist.`, ephemeral: true });
            }

            // Update the category's enabled status
            blacklistData.categories[category].enabled = enabled;

            try {
                fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2));

                const status = enabled ? "enabled" : "disabled";
                await interaction.reply({ content: `✅ ${category} category is now ${status}.`, ephemeral: true });
            } catch (error) {
                console.error("Error saving blacklist:", error);
                return interaction.reply({ content: "❌ Failed to update category status.", ephemeral: true });
            }
        }
    },
    "list-categories": {
        data: {
            name: 'list-categories',
            description: 'List all available blacklist categories in the server',
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            try {
                let response = `📋 **Available Blacklist Categories in ${interaction.guild.name}**\n\n`;
                const guildId = interaction.guildId;

                // Default categories first
                response += "**Default Categories:**\n";
                const defaultCategories = ['profanity', 'spam', 'custom'];
                defaultCategories.forEach(cat => {
                    if (blacklistData.categories[cat]) {
                        const status = blacklistData.categories[cat].enabled ? "✅ Enabled" : "❌ Disabled";
                        const wordCount = blacklistData.categories[cat].words.length;
                        response += `- **${cat}**: ${status} (${wordCount} words)\n`;
                    }
                });

                // Custom guild categories
                response += "\n**Server-Specific Categories:**\n";
                if (blacklistData.guildCategories && blacklistData.guildCategories[guildId]) {
                    const guildCategories = blacklistData.guildCategories[guildId];
                    if (guildCategories.length > 0) {
                        guildCategories.forEach(catName => {
                            if (blacklistData.categories[catName]) {
                                const cat = blacklistData.categories[catName];
                                const status = cat.enabled ? "✅ Enabled" : "❌ Disabled";
                                const wordCount = cat.words.length;
                                const desc = cat.description || "No description";
                                response += `- **${catName}**: ${status} (${wordCount} words)\n  *${desc}*\n`;
                            }
                        });
                    } else {
                        response += "- No custom categories created yet.\n";
                    }
                } else {
                    response += "- No custom categories created yet.\n";
                }

                response += "\n*Use `/create-category` to create new categories!*";

                await interaction.reply({ 
                    content: response,
                    ephemeral: true
                });
            } catch (error) {
                console.error("Error listing categories:", error);
                return interaction.reply({ content: "❌ Failed to list categories.", ephemeral: true });
            }
        }
    },
    "blacklisted-words": {
        data: {
            name: 'blacklisted-words',
            description: 'List all blacklisted words in the server',
            options: [
                { type: 3, name: 'category', description: 'Category to view', required: false }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const selectedCategory = interaction.options.getString('category') || 'all';

            // Check if the blacklist has categories
            if (!blacklistData.categories) {
                return interaction.reply({ content: "⚠️ No blacklist categories are set up.", ephemeral: true });
            }

            try {
                let response = `📋 **Blacklisted Words in ${interaction.guild.name}**\n\n`;

                if (selectedCategory === 'all') {
                    // Show all categories
                    for (const [categoryName, categoryData] of Object.entries(blacklistData.categories)) {
                        const status = categoryData.enabled ? "✅ Enabled" : "❌ Disabled";
                        response += `**${categoryName.toUpperCase()} (${status}):**\n`;

                        if (categoryData.words.length === 0) {
                            response += "- No words in this category\n\n";
                        } else {
                            categoryData.words.forEach((word, index) => {
                                response += `- ${word}\n`;
                            });
                            response += "\n";
                        }
                    }
                } else {
                    // Show only the selected category
                    const categoryData = blacklistData.categories[selectedCategory];
                    if (!categoryData) {
                        return interaction.reply({ content: `❌ Category "${selectedCategory}" does not exist.`, ephemeral: true });
                    }

                    const status = categoryData.enabled ? "✅ Enabled" : "❌ Disabled";
                    response += `**${selectedCategory.toUpperCase()} (${status}):**\n`;

                    if (categoryData.words.length === 0) {
                        response += "- No words in this category\n";
                    } else {
                        categoryData.words.forEach((word, index) => {
                            response += `- ${word}\n`;
                        });
                    }
                }

                await interaction.reply({ 
                    content: response,
                    ephemeral: true // Only visible to the command user for privacy
                });
            } catch (error) {
                console.error("Error listing blacklisted words:", error);
                return interaction.reply({ content: "❌ Failed to list blacklisted words.", ephemeral: true });
            }
        }
    },
    "delete-category": {
        data: {
            name: 'delete-category',
            description: 'Delete a custom blacklist category',
            options: [
                { type: 3, name: 'name', description: 'Name of the category to delete', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "❌ You need Administrator permission to delete categories.", ephemeral: true });
            }

            const categoryName = interaction.options.getString('name');
            const guildId = interaction.guildId;

            // Make sure category exists
            if (!blacklistData.categories[categoryName]) {
                return interaction.reply({ 
                    content: `❌ Category "${categoryName}" does not exist.`, 
                    ephemeral: true 
                });
            }

            // Don't allow deletion of default categories
            if (['profanity', 'spam', 'custom'].includes(categoryName)) {
                return interaction.reply({ 
                    content: `❌ Cannot delete default category "${categoryName}".`, 
                    ephemeral: true 
                });
            }

            // Make sure this guild owns the category
            if (blacklistData.categories[categoryName].guildId !== guildId) {
                return interaction.reply({ 
                    content: `❌ This server doesn't own the "${categoryName}" category.`, 
                    ephemeral: true 
                });
            }

            // Delete the category
            delete blacklistData.categories[categoryName];

            // Remove from guild's category list
            if (blacklistData.guildCategories && blacklistData.guildCategories[guildId]) {
                blacklistData.guildCategories[guildId] = blacklistData.guildCategories[guildId].filter(
                    cat => cat !== categoryName
                );
            }

            try {
                fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2));

                await interaction.reply({ 
                    content: `✅ Deleted category "${categoryName}" and all its blacklisted words.`, 
                    ephemeral: false 
                });
            } catch (error) {
                console.error("Error deleting category:", error);
                return interaction.reply({ content: "❌ Failed to delete category.", ephemeral: true });
            }
        }
    },
    "uptime": {
        data: {
            name: 'uptime',
            description: 'Show bot uptime and status information',
        },
        async execute(interaction) {
            // Set the authorized user ID here
            const AUTHORIZED_USER_ID = process.env.OWNER_ID || '1160574083398914189'; // Replace with your Discord user ID

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
            const uptimeEmbed = new EmbedBuilder()
                .setColor(0x2B82EA)
                .setTitle('📊 Bot Health Information')
                .setDescription(`Status information for ${client.user.tag}`)
                .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 128 }))
                .addFields(
                    { name: '⏱️ Uptime', value: uptimeString, inline: true },
                    { name: '🖥️ Servers', value: `${client.guilds.cache.size}`, inline: true },
                    { name: '👥 Users', value: `${client.users.cache.size}`, inline: true },
                    { name: '🔄 Ping', value: `${ping}ms`, inline: true },
                    { name: '🔢 Version', value: version, inline: true },
                    { name: '📅 Last Started', value: `<t:${Math.floor(Date.now() / 1000 - uptime)}:R>`, inline: true },
                    { name: '🔐 Accessed By', value: `<@${interaction.user.id}>`, inline: true },
                )
                .setFooter({ text: `${client.user.tag} Uptime Monitor` })
                .setTimestamp();

            await interaction.reply({ embeds: [uptimeEmbed] });
        }
    },
    "anti-nuke": {
        data: {
            name: 'anti-nuke',
            description: 'Configure anti-nuke protection',
            options: [
                { 
                    type: 1, 
                    name: 'enable', 
                    description: 'Enable anti-nuke protection',
                    options: [
                        { type: 7, name: 'log_channel', description: 'Channel to log anti-nuke events', required: true }
                    ]
                },
                { 
                    type: 1, 
                    name: 'disable', 
                    description: 'Disable anti-nuke protection' 
                },
                { 
                    type: 1, 
                    name: 'settings', 
                    description: 'View or modify anti-nuke settings',
                    options: [
                        { type: 3, name: 'punishment', description: 'Set punishment (ban, kick, strip)', required: false },
                        { type: 4, name: 'max_role_deletes', description: 'Max role deletions before triggering', required: false },
                        { type: 4, name: 'max_channel_deletes', description: 'Max channel deletions before triggering', required: false },
                        { type: 4, name: 'max_bans', description: 'Max bans before triggering', required: false },
                        { type: 4, name: 'timeframe', description: 'Timeframe in seconds to monitor activity', required: false }
                    ]
                },
                { 
                    type: 1, 
                    name: 'whitelist', 
                    description: 'Manage whitelisted users/roles',
                    options: [
                        { type: 6, name: 'add_user', description: 'User to whitelist', required: false },
                        { type: 6, name: 'remove_user', description: 'User to remove from whitelist', required: false },
                        { type: 8, name: 'add_role', description: 'Role to whitelist', required: false },
                        { type: 8, name: 'remove_role', description: 'Role to remove from whitelist', required: false }
                    ]
                },
                { 
                    type: 1, 
                    name: 'status', 
                    description: 'Check current anti-nuke status' 
                }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const guildId = interaction.guildId;
            const subcommand = interaction.options.getSubcommand();

            // Initialize guild settings if they don't exist
            if (!securitySettings[guildId]) {
                securitySettings[guildId] = {
                    antiNuke: JSON.parse(JSON.stringify(DEFAULT_SECURITY_SETTINGS.antiNuke)),
                    antiRaid: JSON.parse(JSON.stringify(DEFAULT_SECURITY_SETTINGS.antiRaid)),
                    antiSpam: JSON.parse(JSON.stringify(DEFAULT_SECURITY_SETTINGS.antiSpam))
                };
            }

            // Reference to guild's anti-nuke settings
            const antiNukeSettings = securitySettings[guildId].antiNuke;

            switch (subcommand) {
                case 'enable': {
                    const logChannel = interaction.options.getChannel('log_channel');
                    
                    if (!logChannel.isTextBased()) {
                        return interaction.reply({ content: "❌ Please select a valid text channel for logging!", ephemeral: true });
                    }

                    antiNukeSettings.enabled = true;
                    antiNukeSettings.logChannel = logChannel.id;

                    try {
                        fs.writeFileSync(SECURITY_SETTINGS_FILE, JSON.stringify(securitySettings, null, 2));
                        await interaction.reply({ content: `✅ Anti-Nuke protection has been **enabled**! Logs will be sent to <#${logChannel.id}>.`, ephemeral: true });
                    } catch (error) {
                        console.error("Error saving security settings:", error);
                        return interaction.reply({ content: "❌ Failed to save security settings.", ephemeral: true });
                    }
                    break;
                }
                case 'disable': {
                    antiNukeSettings.enabled = false;
                    
                    try {
                        fs.writeFileSync(SECURITY_SETTINGS_FILE, JSON.stringify(securitySettings, null, 2));
                        await interaction.reply({ content: "✅ Anti-Nuke protection has been **disabled**.", ephemeral: true });
                    } catch (error) {
                        console.error("Error saving security settings:", error);
                        return interaction.reply({ content: "❌ Failed to save security settings.", ephemeral: true });
                    }
                    break;
                }
                case 'settings': {
                    const punishment = interaction.options.getString('punishment');
                    const maxRoleDeletes = interaction.options.getInteger('max_role_deletes');
                    const maxChannelDeletes = interaction.options.getInteger('max_channel_deletes');
                    const maxBans = interaction.options.getInteger('max_bans');
                    const timeframe = interaction.options.getInteger('timeframe');

                    let updated = false;
                    let response = "";

                    if (punishment) {
                        if (['ban', 'kick', 'strip'].includes(punishment)) {
                            antiNukeSettings.punishment = punishment;
                            updated = true;
                            response += `• Punishment set to: **${punishment}**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Invalid punishment type. Use 'ban', 'kick', or 'strip'.", ephemeral: true });
                        }
                    }

                    if (maxRoleDeletes !== null) {
                        if (maxRoleDeletes > 0) {
                            antiNukeSettings.maxRoleDeletes = maxRoleDeletes;
                            updated = true;
                            response += `• Max role deletions set to: **${maxRoleDeletes}**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Max role deletions must be greater than 0.", ephemeral: true });
                        }
                    }

                    if (maxChannelDeletes !== null) {
                        if (maxChannelDeletes > 0) {
                            antiNukeSettings.maxChannelDeletes = maxChannelDeletes;
                            updated = true;
                            response += `• Max channel deletions set to: **${maxChannelDeletes}**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Max channel deletions must be greater than 0.", ephemeral: true });
                        }
                    }

                    if (maxBans !== null) {
                        if (maxBans > 0) {
                            antiNukeSettings.maxBans = maxBans;
                            updated = true;
                            response += `• Max bans set to: **${maxBans}**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Max bans must be greater than 0.", ephemeral: true });
                        }
                    }

                    if (timeframe !== null) {
                        if (timeframe > 0) {
                            // Convert seconds to milliseconds
                            antiNukeSettings.timeframe = timeframe * 1000;
                            updated = true;
                            response += `• Timeframe set to: **${timeframe} seconds**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Timeframe must be greater than 0 seconds.", ephemeral: true });
                        }
                    }

                    if (updated) {
                        try {
                            fs.writeFileSync(SECURITY_SETTINGS_FILE, JSON.stringify(securitySettings, null, 2));
                            await interaction.reply({ content: `✅ Anti-Nuke settings updated:\n${response}`, ephemeral: true });
                        } catch (error) {
                            console.error("Error saving security settings:", error);
                            return interaction.reply({ content: "❌ Failed to save security settings.", ephemeral: true });
                        }
                    } else {
                        // If no parameters were provided, show current settings
                        const embed = new EmbedBuilder()
                            .setColor('#3498db')
                            .setTitle('Anti-Nuke Settings')
                            .setDescription(`Current configuration for ${interaction.guild.name}`)
                            .addFields(
                                { name: 'Status', value: antiNukeSettings.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                                { name: 'Log Channel', value: antiNukeSettings.logChannel ? `<#${antiNukeSettings.logChannel}>` : 'Not set', inline: true },
                                { name: 'Punishment', value: antiNukeSettings.punishment, inline: true },
                                { name: 'Max Role Deletions', value: antiNukeSettings.maxRoleDeletes.toString(), inline: true },
                                { name: 'Max Channel Deletions', value: antiNukeSettings.maxChannelDeletes.toString(), inline: true },
                                { name: 'Max Bans', value: antiNukeSettings.maxBans.toString(), inline: true },
                                { name: 'Timeframe', value: `${antiNukeSettings.timeframe / 1000} seconds`, inline: true },
                                { name: 'Whitelisted Roles', value: antiNukeSettings.whitelistedRoles.length > 0 
                                    ? antiNukeSettings.whitelistedRoles.map(id => `<@&${id}>`).join(', ') 
                                    : 'None', inline: false },
                                { name: 'Whitelisted Users', value: antiNukeSettings.whitelistedUsers.length > 0 
                                    ? antiNukeSettings.whitelistedUsers.map(id => `<@${id}>`).join(', ') 
                                    : 'None', inline: false }
                            )
                            .setFooter({ text: `${interaction.user.tag} • Anti-Nuke Protection`, iconURL: interaction.user.displayAvatarURL() })
                            .setTimestamp();

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                    break;
                }
                case 'whitelist': {
                    const addUser = interaction.options.getUser('add_user');
                    const removeUser = interaction.options.getUser('remove_user');
                    const addRole = interaction.options.getRole('add_role');
                    const removeRole = interaction.options.getRole('remove_role');

                    let updated = false;
                    let response = "";

                    if (addUser) {
                        if (!antiNukeSettings.whitelistedUsers.includes(addUser.id)) {
                            antiNukeSettings.whitelistedUsers.push(addUser.id);
                            updated = true;
                            response += `• Added <@${addUser.id}> to the whitelist\n`;
                        } else {
                            return interaction.reply({ content: `❌ <@${addUser.id}> is already whitelisted.`, ephemeral: true });
                        }
                    }

                    if (removeUser) {
                        if (antiNukeSettings.whitelistedUsers.includes(removeUser.id)) {
                            antiNukeSettings.whitelistedUsers = antiNukeSettings.whitelistedUsers.filter(id => id !== removeUser.id);
                            updated = true;
                            response += `• Removed <@${removeUser.id}> from the whitelist\n`;
                        } else {
                            return interaction.reply({ content: `❌ <@${removeUser.id}> is not whitelisted.`, ephemeral: true });
                        }
                    }

                    if (addRole) {
                        if (!antiNukeSettings.whitelistedRoles.includes(addRole.id)) {
                            antiNukeSettings.whitelistedRoles.push(addRole.id);
                            updated = true;
                            response += `• Added <@&${addRole.id}> role to the whitelist\n`;
                        } else {
                            return interaction.reply({ content: `❌ <@&${addRole.id}> role is already whitelisted.`, ephemeral: true });
                        }
                    }

                    if (removeRole) {
                        if (antiNukeSettings.whitelistedRoles.includes(removeRole.id)) {
                            antiNukeSettings.whitelistedRoles = antiNukeSettings.whitelistedRoles.filter(id => id !== removeRole.id);
                            updated = true;
                            response += `• Removed <@&${removeRole.id}> role from the whitelist\n`;
                        } else {
                            return interaction.reply({ content: `❌ <@&${removeRole.id}> role is not whitelisted.`, ephemeral: true });
                        }
                    }

                    if (updated) {
                        try {
                            fs.writeFileSync(SECURITY_SETTINGS_FILE, JSON.stringify(securitySettings, null, 2));
                            await interaction.reply({ content: `✅ Anti-Nuke whitelist updated:\n${response}`, ephemeral: true });
                        } catch (error) {
                            console.error("Error saving security settings:", error);
                            return interaction.reply({ content: "❌ Failed to save security settings.", ephemeral: true });
                        }
                    } else {
                        // If no parameters were provided, show current whitelist
                        const embed = new EmbedBuilder()
                            .setColor('#3498db')
                            .setTitle('Anti-Nuke Whitelist')
                            .setDescription(`Current whitelist for ${interaction.guild.name}`)
                            .addFields(
                                { name: 'Whitelisted Roles', value: antiNukeSettings.whitelistedRoles.length > 0 
                                    ? antiNukeSettings.whitelistedRoles.map(id => `<@&${id}>`).join(', ') 
                                    : 'None', inline: false },
                                { name: 'Whitelisted Users', value: antiNukeSettings.whitelistedUsers.length > 0 
                                    ? antiNukeSettings.whitelistedUsers.map(id => `<@${id}>`).join(', ') 
                                    : 'None', inline: false }
                            )
                            .setFooter({ text: `${interaction.user.tag} • Anti-Nuke Protection`, iconURL: interaction.user.displayAvatarURL() })
                            .setTimestamp();

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                    break;
                }
                case 'status': {
                    const embed = new EmbedBuilder()
                        .setColor(antiNukeSettings.enabled ? '#00ff00' : '#ff0000')
                        .setTitle('Anti-Nuke Status')
                        .setDescription(`Anti-Nuke protection is currently **${antiNukeSettings.enabled ? 'ENABLED' : 'DISABLED'}** for ${interaction.guild.name}`)
                        .addFields(
                            { name: 'Log Channel', value: antiNukeSettings.logChannel ? `<#${antiNukeSettings.logChannel}>` : 'Not set', inline: true },
                            { name: 'Punishment', value: antiNukeSettings.punishment, inline: true },
                            { name: 'Protection Thresholds', value: `• ${antiNukeSettings.maxRoleDeletes} role deletions\n• ${antiNukeSettings.maxChannelDeletes} channel deletions\n• ${antiNukeSettings.maxBans} bans\n\nWithin ${antiNukeSettings.timeframe / 1000} seconds`, inline: false }
                        )
                        .setFooter({ text: `${interaction.user.tag} • Anti-Nuke Protection`, iconURL: interaction.user.displayAvatarURL() })
                        .setTimestamp();

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    break;
                }
            }
        }
    },
    "anti-raid": {
        data: {
            name: 'anti-raid',
            description: 'Configure anti-raid protection',
            options: [
                { 
                    type: 1, 
                    name: 'enable', 
                    description: 'Enable anti-raid protection',
                    options: [
                        { type: 7, name: 'log_channel', description: 'Channel to log anti-raid events', required: true }
                    ]
                },
                { 
                    type: 1, 
                    name: 'disable', 
                    description: 'Disable anti-raid protection' 
                },
                { 
                    type: 1, 
                    name: 'settings', 
                    description: 'View or modify anti-raid settings',
                    options: [
                        { type: 3, name: 'action', description: 'Action to take (verification, kick, ban)', required: false },
                        { type: 4, name: 'join_threshold', description: 'Number of joins to trigger protection', required: false },
                        { type: 4, name: 'join_timeframe', description: 'Timeframe in seconds to check join rate', required: false },
                        { type: 4, name: 'account_age', description: 'Minimum account age in days', required: false },
                        { type: 5, name: 'auto_mode', description: 'Auto-enable raid mode on detection', required: false }
                    ]
                },
                { 
                    type: 1, 
                    name: 'raid_mode', 
                    description: 'Toggle raid mode manually',
                    options: [
                        { type: 5, name: 'enable', description: 'Enable or disable raid mode', required: true }
                    ]
                },
                { 
                    type: 1, 
                    name: 'status', 
                    description: 'Check current anti-raid status' 
                }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const guildId = interaction.guildId;
            const subcommand = interaction.options.getSubcommand();

            // Initialize guild settings if they don't exist
            if (!securitySettings[guildId]) {
                securitySettings[guildId] = {
                    antiNuke: JSON.parse(JSON.stringify(DEFAULT_SECURITY_SETTINGS.antiNuke)),
                    antiRaid: JSON.parse(JSON.stringify(DEFAULT_SECURITY_SETTINGS.antiRaid)),
                    antiSpam: JSON.parse(JSON.stringify(DEFAULT_SECURITY_SETTINGS.antiSpam))
                };
            }

            // Reference to guild's anti-raid settings
            const antiRaidSettings = securitySettings[guildId].antiRaid;

            switch (subcommand) {
                case 'enable': {
                    const logChannel = interaction.options.getChannel('log_channel');
                    
                    if (!logChannel.isTextBased()) {
                        return interaction.reply({ content: "❌ Please select a valid text channel for logging!", ephemeral: true });
                    }

                    antiRaidSettings.enabled = true;
                    antiRaidSettings.logChannel = logChannel.id;

                    try {
                        fs.writeFileSync(SECURITY_SETTINGS_FILE, JSON.stringify(securitySettings, null, 2));
                        await interaction.reply({ content: `✅ Anti-Raid protection has been **enabled**! Logs will be sent to <#${logChannel.id}>.`, ephemeral: true });
                    } catch (error) {
                        console.error("Error saving security settings:", error);
                        return interaction.reply({ content: "❌ Failed to save security settings.", ephemeral: true });
                    }
                    break;
                }
                case 'disable': {
                    antiRaidSettings.enabled = false;
                    
                    try {
                        fs.writeFileSync(SECURITY_SETTINGS_FILE, JSON.stringify(securitySettings, null, 2));
                        await interaction.reply({ content: "✅ Anti-Raid protection has been **disabled**.", ephemeral: true });
                    } catch (error) {
                        console.error("Error saving security settings:", error);
                        return interaction.reply({ content: "❌ Failed to save security settings.", ephemeral: true });
                    }
                    break;
                }
                case 'settings': {
                    const action = interaction.options.getString('action');
                    const joinThreshold = interaction.options.getInteger('join_threshold');
                    const joinTimeframe = interaction.options.getInteger('join_timeframe');
                    const accountAge = interaction.options.getInteger('account_age');
                    const autoMode = interaction.options.getBoolean('auto_mode');

                    let updated = false;
                    let response = "";

                    if (action) {
                        if (['verification', 'kick', 'ban'].includes(action)) {
                            antiRaidSettings.action = action;
                            updated = true;
                            response += `• Action set to: **${action}**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Invalid action type. Use 'verification', 'kick', or 'ban'.", ephemeral: true });
                        }
                    }

                    if (joinThreshold !== null) {
                        if (joinThreshold > 0) {
                            antiRaidSettings.joinThreshold = joinThreshold;
                            updated = true;
                            response += `• Join threshold set to: **${joinThreshold} joins**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Join threshold must be greater than 0.", ephemeral: true });
                        }
                    }

                    if (joinTimeframe !== null) {
                        if (joinTimeframe > 0) {
                            // Convert seconds to milliseconds
                            antiRaidSettings.joinTimeframe = joinTimeframe * 1000;
                            updated = true;
                            response += `• Join timeframe set to: **${joinTimeframe} seconds**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Join timeframe must be greater than 0 seconds.", ephemeral: true });
                        }
                    }

                    if (accountAge !== null) {
                        if (accountAge >= 0) {
                            antiRaidSettings.accountAgeDays = accountAge;
                            updated = true;
                            response += `• Minimum account age set to: **${accountAge} days**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Account age must be 0 or greater.", ephemeral: true });
                        }
                    }

                    if (autoMode !== null) {
                        antiRaidSettings.autoRaidMode = autoMode;
                        updated = true;
                        response += `• Auto raid mode: **${autoMode ? 'Enabled' : 'Disabled'}**\n`;
                    }

                    if (updated) {
                        try {
                            fs.writeFileSync(SECURITY_SETTINGS_FILE, JSON.stringify(securitySettings, null, 2));
                            await interaction.reply({ content: `✅ Anti-Raid settings updated:\n${response}`, ephemeral: true });
                        } catch (error) {
                            console.error("Error saving security settings:", error);
                            return interaction.reply({ content: "❌ Failed to save security settings.", ephemeral: true });
                        }
                    } else {
                        // If no parameters were provided, show current settings
                        const embed = new EmbedBuilder()
                            .setColor('#3498db')
                            .setTitle('Anti-Raid Settings')
                            .setDescription(`Current configuration for ${interaction.guild.name}`)
                            .addFields(
                                { name: 'Status', value: antiRaidSettings.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                                { name: 'Raid Mode', value: antiRaidSettings.raidMode ? '⚠️ ACTIVE' : '✅ Inactive', inline: true },
                                { name: 'Log Channel', value: antiRaidSettings.logChannel ? `<#${antiRaidSettings.logChannel}>` : 'Not set', inline: true },
                                { name: 'Join Threshold', value: `${antiRaidSettings.joinThreshold} joins`, inline: true },
                                { name: 'Join Timeframe', value: `${antiRaidSettings.joinTimeframe / 1000} seconds`, inline: true },
                                { name: 'Minimum Account Age', value: `${antiRaidSettings.accountAgeDays} days`, inline: true },
                                { name: 'Action on Raid', value: antiRaidSettings.action, inline: true },
                                { name: 'Auto Raid Mode', value: antiRaidSettings.autoRaidMode ? 'Enabled' : 'Disabled', inline: true }
                            )
                            .setFooter({ text: `${interaction.user.tag} • Anti-Raid Protection`, iconURL: interaction.user.displayAvatarURL() })
                            .setTimestamp();

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                    break;
                }
                case 'raid_mode': {
                    const enableRaidMode = interaction.options.getBoolean('enable');
                    
                    antiRaidSettings.raidMode = enableRaidMode;
                    
                    try {
                        fs.writeFileSync(SECURITY_SETTINGS_FILE, JSON.stringify(securitySettings, null, 2));
                        
                        // If there's a log channel, send message there as well
                        if (antiRaidSettings.logChannel) {
                            const logChannel = interaction.guild.channels.cache.get(antiRaidSettings.logChannel);
                            if (logChannel) {
                                const embed = new EmbedBuilder()
                                    .setColor(enableRaidMode ? '#ff0000' : '#00ff00')
                                    .setTitle(`Raid Mode ${enableRaidMode ? 'Activated' : 'Deactivated'}`)
                                    .setDescription(`Raid mode has been ${enableRaidMode ? 'activated' : 'deactivated'} by ${interaction.user}`)
                                    .setTimestamp();
                                
                                await logChannel.send({ embeds: [embed] });
                            }
                        }
                        
                        await interaction.reply({ 
                            content: `⚠️ Raid Mode has been **${enableRaidMode ? 'ACTIVATED' : 'DEACTIVATED'}**.\n${enableRaidMode ? 'The server is now in lockdown mode. New joins will be restricted.' : 'The server has returned to normal operation.'}`, 
                            ephemeral: true 
                        });
                    } catch (error) {
                        console.error("Error saving security settings:", error);
                        return interaction.reply({ content: "❌ Failed to update raid mode status.", ephemeral: true });
                    }
                    break;
                }
                case 'status': {
                    const embed = new EmbedBuilder()
                        .setColor(antiRaidSettings.enabled ? (antiRaidSettings.raidMode ? '#ff0000' : '#00ff00') : '#ff0000')
                        .setTitle('Anti-Raid Status')
                        .setDescription(`Anti-Raid protection is currently **${antiRaidSettings.enabled ? 'ENABLED' : 'DISABLED'}** for ${interaction.guild.name}`)
                        .addFields(
                            { name: 'Raid Mode', value: antiRaidSettings.raidMode ? '⚠️ ACTIVE' : '✅ Inactive', inline: true },
                            { name: 'Log Channel', value: antiRaidSettings.logChannel ? `<#${antiRaidSettings.logChannel}>` : 'Not set', inline: true },
                            { name: 'Auto Raid Mode', value: antiRaidSettings.autoRaidMode ? 'Enabled' : 'Disabled', inline: true },
                            { name: 'Protection Settings', value: `• ${antiRaidSettings.joinThreshold} joins within ${antiRaidSettings.joinTimeframe / 1000} seconds\n• Minimum account age: ${antiRaidSettings.accountAgeDays} days\n• Action: ${antiRaidSettings.action}`, inline: false }
                        )
                        .setFooter({ text: `${interaction.user.tag} • Anti-Raid Protection`, iconURL: interaction.user.displayAvatarURL() })
                        .setTimestamp();

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    break;
                }
            }
        }
    },
    "anti-spam": {
        data: {
            name: 'anti-spam',
            description: 'Configure anti-spam protection',
            options: [
                { 
                    type: 1, 
                    name: 'enable', 
                    description: 'Enable anti-spam protection',
                    options: [
                        { type: 7, name: 'log_channel', description: 'Channel to log anti-spam events', required: true }
                    ]
                },
                { 
                    type: 1, 
                    name: 'disable', 
                    description: 'Disable anti-spam protection' 
                },
                { 
                    type: 1, 
                    name: 'settings', 
                    description: 'View or modify anti-spam settings',
                    options: [
                        { type: 3, name: 'punishment', description: 'Set punishment (mute, kick, ban)', required: false },
                        { type: 4, name: 'message_threshold', description: 'Number of messages before spam detection', required: false },
                        { type: 4, name: 'duplicate_threshold', description: 'Number of duplicate messages before spam detection', required: false },
                        { type: 4, name: 'mention_limit', description: 'Maximum mentions in a single message', required: false },
                        { type: 4, name: 'timeframe', description: 'Timeframe in seconds for message rate', required: false },
                        { type: 4, name: 'punishment_duration', description: 'Punishment duration in minutes (for mutes)', required: false }
                    ]
                },
                { 
                    type: 1, 
                    name: 'status', 
                    description: 'Check current anti-spam status' 
                }
            ],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const guildId = interaction.guildId;
            const subcommand = interaction.options.getSubcommand();

            // Initialize guild settings if they don't exist
            if (!securitySettings[guildId]) {
                securitySettings[guildId] = {
                    antiNuke: JSON.parse(JSON.stringify(DEFAULT_SECURITY_SETTINGS.antiNuke)),
                    antiRaid: JSON.parse(JSON.stringify(DEFAULT_SECURITY_SETTINGS.antiRaid)),
                    antiSpam: JSON.parse(JSON.stringify(DEFAULT_SECURITY_SETTINGS.antiSpam))
                };
            }

            // Reference to guild's anti-spam settings
            const antiSpamSettings = securitySettings[guildId].antiSpam;

            switch (subcommand) {
                case 'enable': {
                    const logChannel = interaction.options.getChannel('log_channel');
                    
                    if (!logChannel.isTextBased()) {
                        return interaction.reply({ content: "❌ Please select a valid text channel for logging!", ephemeral: true });
                    }

                    antiSpamSettings.enabled = true;
                    antiSpamSettings.logChannel = logChannel.id;

                    try {
                        fs.writeFileSync(SECURITY_SETTINGS_FILE, JSON.stringify(securitySettings, null, 2));
                        await interaction.reply({ content: `✅ Anti-Spam protection has been **enabled**! Logs will be sent to <#${logChannel.id}>.`, ephemeral: true });
                    } catch (error) {
                        console.error("Error saving security settings:", error);
                        return interaction.reply({ content: "❌ Failed to save security settings.", ephemeral: true });
                    }
                    break;
                }
                case 'disable': {
                    antiSpamSettings.enabled = false;
                    
                    try {
                        fs.writeFileSync(SECURITY_SETTINGS_FILE, JSON.stringify(securitySettings, null, 2));
                        await interaction.reply({ content: "✅ Anti-Spam protection has been **disabled**.", ephemeral: true });
                    } catch (error) {
                        console.error("Error saving security settings:", error);
                        return interaction.reply({ content: "❌ Failed to save security settings.", ephemeral: true });
                    }
                    break;
                }
                case 'settings': {
                    const punishment = interaction.options.getString('punishment');
                    const messageThreshold = interaction.options.getInteger('message_threshold');
                    const duplicateThreshold = interaction.options.getInteger('duplicate_threshold');
                    const mentionLimit = interaction.options.getInteger('mention_limit');
                    const timeframe = interaction.options.getInteger('timeframe');
                    const punishmentDuration = interaction.options.getInteger('punishment_duration');

                    let updated = false;
                    let response = "";

                    if (punishment) {
                        if (['mute', 'kick', 'ban'].includes(punishment)) {
                            antiSpamSettings.punishment = punishment;
                            updated = true;
                            response += `• Punishment set to: **${punishment}**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Invalid punishment type. Use 'mute', 'kick', or 'ban'.", ephemeral: true });
                        }
                    }

                    if (messageThreshold !== null) {
                        if (messageThreshold > 0) {
                            antiSpamSettings.messageThreshold = messageThreshold;
                            updated = true;
                            response += `• Message threshold set to: **${messageThreshold} messages**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Message threshold must be greater than 0.", ephemeral: true });
                        }
                    }

                    if (duplicateThreshold !== null) {
                        if (duplicateThreshold > 0) {
                            antiSpamSettings.messageDuplicateThreshold = duplicateThreshold;
                            updated = true;
                            response += `• Duplicate message threshold set to: **${duplicateThreshold} messages**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Duplicate threshold must be greater than 0.", ephemeral: true });
                        }
                    }

                    if (mentionLimit !== null) {
                        if (mentionLimit > 0) {
                            antiSpamSettings.mentionLimit = mentionLimit;
                            updated = true;
                            response += `• Mention limit set to: **${mentionLimit} mentions**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Mention limit must be greater than 0.", ephemeral: true });
                        }
                    }

                    if (timeframe !== null) {
                        if (timeframe > 0) {
                            // Convert seconds to milliseconds
                            antiSpamSettings.timeframe = timeframe * 1000;
                            updated = true;
                            response += `• Timeframe set to: **${timeframe} seconds**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Timeframe must be greater than 0 seconds.", ephemeral: true });
                        }
                    }

                    if (punishmentDuration !== null) {
                        if (punishmentDuration > 0) {
                            // Convert minutes to milliseconds
                            antiSpamSettings.punishmentDuration = punishmentDuration * 60000;
                            updated = true;
                            response += `• Punishment duration set to: **${punishmentDuration} minutes**\n`;
                        } else {
                            return interaction.reply({ content: "❌ Punishment duration must be greater than 0 minutes.", ephemeral: true });
                        }
                    }

                    if (updated) {
                        try {
                            fs.writeFileSync(SECURITY_SETTINGS_FILE, JSON.stringify(securitySettings, null, 2));
                            await interaction.reply({ content: `✅ Anti-Spam settings updated:\n${response}`, ephemeral: true });
                        } catch (error) {
                            console.error("Error saving security settings:", error);
                            return interaction.reply({ content: "❌ Failed to save security settings.", ephemeral: true });
                        }
                    } else {
                        // If no parameters were provided, show current settings
                        const embed = new EmbedBuilder()
                            .setColor('#3498db')
                            .setTitle('Anti-Spam Settings')
                            .setDescription(`Current configuration for ${interaction.guild.name}`)
                            .addFields(
                                { name: 'Status', value: antiSpamSettings.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                                { name: 'Log Channel', value: antiSpamSettings.logChannel ? `<#${antiSpamSettings.logChannel}>` : 'Not set', inline: true },
                                { name: 'Punishment', value: antiSpamSettings.punishment, inline: true },
                                { name: 'Message Threshold', value: `${antiSpamSettings.messageThreshold} messages`, inline: true },
                                { name: 'Duplicate Threshold', value: `${antiSpamSettings.messageDuplicateThreshold} messages`, inline: true },
                                { name: 'Mention Limit', value: `${antiSpamSettings.mentionLimit} mentions`, inline: true },
                                { name: 'Timeframe', value: `${antiSpamSettings.timeframe / 1000} seconds`, inline: true },
                                { name: 'Punishment Duration', value: `${antiSpamSettings.punishmentDuration / 60000} minutes`, inline: true }
                            )
                            .setFooter({ text: `${interaction.user.tag} • Anti-Spam Protection`, iconURL: interaction.user.displayAvatarURL() })
                            .setTimestamp();

                        await interaction.reply({ embeds: [embed], ephemeral: true });
                    }
                    break;
                }
                case 'status': {
                    const embed = new EmbedBuilder()
                        .setColor(antiSpamSettings.enabled ? '#00ff00' : '#ff0000')
                        .setTitle('Anti-Spam Status')
                        .setDescription(`Anti-Spam protection is currently **${antiSpamSettings.enabled ? 'ENABLED' : 'DISABLED'}** for ${interaction.guild.name}`)
                        .addFields(
                            { name: 'Log Channel', value: antiSpamSettings.logChannel ? `<#${antiSpamSettings.logChannel}>` : 'Not set', inline: true },
                            { name: 'Punishment', value: antiSpamSettings.punishment, inline: true },
                            { name: 'Punishment Duration', value: `${antiSpamSettings.punishmentDuration / 60000} minutes`, inline: true },
                            { name: 'Protection Settings', value: `• ${antiSpamSettings.messageThreshold} messages within ${antiSpamSettings.timeframe / 1000} seconds\n• ${antiSpamSettings.messageDuplicateThreshold} duplicate messages\n• ${antiSpamSettings.mentionLimit} max mentions per message`, inline: false }
                        )
                        .setFooter({ text: `${interaction.user.tag} • Anti-Spam Protection`, iconURL: interaction.user.displayAvatarURL() })
                        .setTimestamp();

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    break;
                }
            }
        }
    },
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

// Server statistics
const serverStats = {};

function updateServerStats(guildId) {
    serverStats[guildId] = {
        messageCount: 0,
        memberCount: 0
    };
}


// Create maps to track user messages for anti-spam
const userMessageMap = new Map();
const userDuplicateMessageMap = new Map();
const mutedUsers = new Map();

// Filter messages for blacklisted words and anti-spam
client.on('messageCreate', async message => {
    // Don't process non-guild messages
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    // Update server statistics
    if (!serverStats[guildId]) {
        updateServerStats(guildId);
    }
    serverStats[guildId].messageCount++;
    
    // Anti-Spam Protection
    if (securitySettings[guildId]?.antiSpam?.enabled) {
        const antiSpamSettings = securitySettings[guildId].antiSpam;
        
        // Skip if user is already muted
        if (mutedUsers.has(`${guildId}-${userId}`)) {
            return;
        }
        
        // Check messages for spam
        if (!userMessageMap.has(`${guildId}-${userId}`)) {
            userMessageMap.set(`${guildId}-${userId}`, []);
        }
        
        // Get user's messages
        const userMessages = userMessageMap.get(`${guildId}-${userId}`);
        
        // Add current message with timestamp
        userMessages.push({
            content: message.content,
            timestamp: Date.now()
        });
        
        // Clean up old messages outside the timeframe
        const timeThreshold = Date.now() - antiSpamSettings.timeframe;
        while (userMessages.length > 0 && userMessages[0].timestamp < timeThreshold) {
            userMessages.shift();
        }
        
        // Check for spam based on message frequency
        if (userMessages.length >= antiSpamSettings.messageThreshold) {
            await handleSpam(message, 'message_frequency', antiSpamSettings);
            return;
        }
        
        // Check for duplicate messages
        if (!userDuplicateMessageMap.has(`${guildId}-${userId}`)) {
            userDuplicateMessageMap.set(`${guildId}-${userId}`, new Map());
        }
        
        const userDuplicates = userDuplicateMessageMap.get(`${guildId}-${userId}`);
        const messageContent = message.content.toLowerCase();
        
        // Skip very short messages for duplicate checking
        if (messageContent.length > 5) {
            if (!userDuplicates.has(messageContent)) {
                userDuplicates.set(messageContent, { count: 1, timestamp: Date.now() });
            } else {
                const duplicateInfo = userDuplicates.get(messageContent);
                
                // If the message is within timeframe, increment count
                if (duplicateInfo.timestamp > timeThreshold) {
                    duplicateInfo.count++;
                    duplicateInfo.timestamp = Date.now();
                    
                    // Check for duplicate message spam
                    if (duplicateInfo.count >= antiSpamSettings.messageDuplicateThreshold) {
                        await handleSpam(message, 'duplicate_messages', antiSpamSettings);
                        return;
                    }
                } else {
                    // Reset if outside timeframe
                    userDuplicates.set(messageContent, { count: 1, timestamp: Date.now() });
                }
            }
            
            // Clean up old duplicates
            for (const [content, info] of userDuplicates.entries()) {
                if (info.timestamp < timeThreshold) {
                    userDuplicates.delete(content);
                }
            }
        }
        
        // Check for mention spam
        if (message.mentions.users.size + message.mentions.roles.size > antiSpamSettings.mentionLimit) {
            await handleSpam(message, 'mention_spam', antiSpamSettings);
            return;
        }
    }

    // Enhanced Auto-Moderation System
    if (blacklistData && blacklistData.categories) {
        const content = message.content.toLowerCase();
        let foundBlacklisted = false;
        let category = '';

        // Check each category
        for (const [categoryName, categoryData] of Object.entries(blacklistData.categories)) {
            if (categoryData.enabled && categoryData.words.length > 0) {
                for (const word of categoryData.words) {
                    // Using a regex that matches word boundaries to prevent false positives
                    const regex = new RegExp(`\\b${word}\\b`, 'i');
                    if (regex.test(content)) {
                        foundBlacklisted = true;
                        category = categoryName;
                        break;
                    }
                }
                if (foundBlacklisted) break;
            }
        }

        if (foundBlacklisted) {
            // Delete the message containing blacklisted words
            await message.delete().catch(error => {
                console.error(`Failed to delete message: ${error}`);
            });

            // Send a warning to the user
            const warningEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Message Removed')
                .setDescription(`Your message was removed because it contained a blacklisted word from the "${category}" category.`)
                .setFooter({ text: `${client.user.tag} Auto-Moderation` })
                .setTimestamp();

            // Try to send a DM to the user
            try {
                await message.author.send({ embeds: [warningEmbed] });
            } catch (error) {
                console.log(`Could not send DM to ${message.author.tag}: ${error}`);
                // Try sending in the channel if DM fails
                try {
                    await message.channel.send({ 
                        content: `${message.author}, your message was removed due to containing blacklisted content.`,
                        ephemeral: true
                    });
                } catch (channelError) {
                    console.error(`Also failed to send in channel: ${channelError}`);
                }
            }

            // Log to moderation channel if configured
            const modLogChannel = message.guild.channels.cache.find(
                channel => channel.name === 'mod-logs' || channel.name === 'moderation-logs'
            );

            if (modLogChannel && modLogChannel.isTextBased()) {
                const logEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Message Removed - Blacklisted Word')
                    .setDescription(`A message by ${message.author} was removed.`)
                    .addFields(
                        { name: 'Channel', value: `${message.channel}`, inline: true },
                        { name: 'Category', value: category, inline: true },
                        { name: 'Content', value: `||${message.content}||` }
                    )
                    .setFooter({ text: `${client.user.tag} Auto-Moderation` })
                    .setTimestamp();

                await modLogChannel.send({ embeds: [logEmbed] });
            }
        }
    }

    // Spam detection - Check for message frequency
    const SPAM_THRESHOLD = 5; // 5 messages
    const SPAM_WINDOW = 5000; // 5 seconds

    // Get recent messages by this user
    try {
        const recentMessages = await message.channel.messages.fetch({ limit: 10 });
        const userMessages = recentMessages.filter(m => 
            m.author.id === message.author.id && 
            (Date.now() - m.createdTimestamp) < SPAM_WINDOW
        );

        if (userMessages.size >= SPAM_THRESHOLD) {
            // User is spamming
            await message.channel.send(`${message.author}, please slow down! You're sending messages too quickly.`);

            // Timeout the user for 30 seconds if the bot has permission
            if (message.member.moderatable) {
                await message.member.timeout(30000, 'Spam detection: Sending messages too quickly')
                    .catch(console.error);
            }
        }
    } catch (error) {
        console.error('Error in spam detection:', error);
    }
});

// Function to handle spam detection
async function handleSpam(message, spamType, antiSpamSettings) {
    try {
        const { guild, author, channel, member } = message;
        let spamReason = '';
        
        switch (spamType) {
            case 'message_frequency':
                spamReason = 'Sending messages too quickly';
                break;
            case 'duplicate_messages':
                spamReason = 'Sending duplicate messages';
                break;
            case 'mention_spam':
                spamReason = 'Mentioning too many users/roles';
                break;
            default:
                spamReason = 'Spam detected';
        }
        
        // Delete the message
        await message.delete().catch(err => console.error(`Could not delete spam message: ${err}`));
        
        // Apply punishment
        const punishmentDuration = antiSpamSettings.punishmentDuration;
        
        switch (antiSpamSettings.punishment) {
            case 'mute':
                if (member.moderatable) {
                    await member.timeout(punishmentDuration, `Auto-mod: ${spamReason}`)
                        .catch(err => console.error(`Could not timeout member: ${err}`));
                    
                    // Add to muted users Map
                    mutedUsers.set(`${guild.id}-${author.id}`, Date.now() + punishmentDuration);
                    
                    // Remove from muted users after duration
                    setTimeout(() => {
                        mutedUsers.delete(`${guild.id}-${author.id}`);
                    }, punishmentDuration);
                }
                break;
            case 'kick':
                if (member.kickable) {
                    await member.kick(`Auto-mod: ${spamReason}`)
                        .catch(err => console.error(`Could not kick member: ${err}`));
                }
                break;
            case 'ban':
                if (member.bannable) {
                    await member.ban({ reason: `Auto-mod: ${spamReason}`, deleteMessageSeconds: 86400 })
                        .catch(err => console.error(`Could not ban member: ${err}`));
                }
                break;
        }
        
        // Send a message to the channel
        await channel.send(`${author}, your messages have been detected as spam (${spamReason.toLowerCase()}).`);
        
        // Log to the designated channel
        if (antiSpamSettings.logChannel) {
            const logChannel = guild.channels.cache.get(antiSpamSettings.logChannel);
            if (logChannel && logChannel.isTextBased()) {
                const logEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Anti-Spam Action')
                    .setDescription(`Action taken against ${author.tag} (${author.id})`)
                    .addFields(
                        { name: 'Reason', value: spamReason, inline: true },
                        { name: 'Action', value: antiSpamSettings.punishment, inline: true },
                        { name: 'Channel', value: `${channel}`, inline: true },
                        { name: 'Duration', value: antiSpamSettings.punishment === 'mute' ? `${punishmentDuration / 60000} minutes` : 'N/A', inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: `Anti-Spam Protection`, iconURL: guild.iconURL() });
                
                await logChannel.send({ embeds: [logEmbed] });
            }
        }
        
    } catch (error) {
        console.error(`Error in handleSpam: ${error}`);
    }
}

// Track recent joins for anti-raid
const recentJoins = new Map();

client.on('guildMemberAdd', async (member) => {
    const guildId = member.guild.id;
    
    // Anti-Raid Protection
    if (securitySettings[guildId]?.antiRaid?.enabled) {
        const antiRaidSettings = securitySettings[guildId].antiRaid;
        
        // Initialize recent joins tracking for this guild
        if (!recentJoins.has(guildId)) {
            recentJoins.set(guildId, []);
        }
        
        const guildJoins = recentJoins.get(guildId);
        
        // Add current join with timestamp
        guildJoins.push({
            userId: member.id,
            timestamp: Date.now(),
            accountCreated: member.user.createdTimestamp
        });
        
        // Clean up old joins outside the timeframe
        const timeThreshold = Date.now() - antiRaidSettings.joinTimeframe;
        while (guildJoins.length > 0 && guildJoins[0].timestamp < timeThreshold) {
            guildJoins.shift();
        }
        
        // Check if join rate exceeds threshold
        if (guildJoins.length >= antiRaidSettings.joinThreshold) {
            if (antiRaidSettings.autoRaidMode && !antiRaidSettings.raidMode) {
                // Automatically enable raid mode
                antiRaidSettings.raidMode = true;
                
                try {
                    fs.writeFileSync(SECURITY_SETTINGS_FILE, JSON.stringify(securitySettings, null, 2));
                    
                    // Log raid mode activation
                    if (antiRaidSettings.logChannel) {
                        const logChannel = member.guild.channels.cache.get(antiRaidSettings.logChannel);
                        if (logChannel && logChannel.isTextBased()) {
                            const embed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setTitle('⚠️ RAID MODE ACTIVATED')
                                .setDescription(`Raid mode has been automatically activated due to high join rate.`)
                                .addFields(
                                    { name: 'Join Rate', value: `${guildJoins.length} joins in ${antiRaidSettings.joinTimeframe / 1000} seconds`, inline: true },
                                    { name: 'Threshold', value: `${antiRaidSettings.joinThreshold} joins`, inline: true }
                                )
                                .setTimestamp();
                            
                            await logChannel.send({ embeds: [embed] });
                        }
                    }
                } catch (error) {
                    console.error("Error saving security settings:", error);
                }
            }
        }
        
        // Take action if in raid mode or account is too new
        if (antiRaidSettings.raidMode || 
            (antiRaidSettings.accountAgeDays > 0 && 
             (Date.now() - member.user.createdTimestamp) < (antiRaidSettings.accountAgeDays * 86400000))) {
            
            // Account too new or raid mode active
            switch (antiRaidSettings.action) {
                case 'verification':
                    // Log verification requirement
                    if (antiRaidSettings.logChannel) {
                        const logChannel = member.guild.channels.cache.get(antiRaidSettings.logChannel);
                        if (logChannel && logChannel.isTextBased()) {
                            const embed = new EmbedBuilder()
                                .setColor('#FFA500')
                                .setTitle('Anti-Raid: Verification Required')
                                .setDescription(`New member ${member.user.tag} (${member.id}) requires verification.`)
                                .addFields(
                                    { name: 'Reason', value: antiRaidSettings.raidMode ? 'Raid Mode Active' : 'New Account', inline: true },
                                    { name: 'Account Age', value: `${Math.floor((Date.now() - member.user.createdTimestamp) / 86400000)} days`, inline: true }
                                )
                                .setTimestamp();
                            
                            await logChannel.send({ embeds: [embed] });
                        }
                    }
                    
                    // Try to DM the user
                    try {
                        await member.user.send(`⚠️ **${member.guild.name} is currently in heightened security mode**\n\nPlease contact a moderator to gain access to the server. This is a security measure to protect against raids.`);
                    } catch (error) {
                        console.log(`Could not send verification DM to ${member.user.tag}: ${error}`);
                    }
                    break;
                    
                case 'kick':
                    if (member.kickable) {
                        await member.kick('Anti-raid protection').catch(console.error);
                        
                        // Log kick
                        if (antiRaidSettings.logChannel) {
                            const logChannel = member.guild.channels.cache.get(antiRaidSettings.logChannel);
                            if (logChannel && logChannel.isTextBased()) {
                                const embed = new EmbedBuilder()
                                    .setColor('#FF0000')
                                    .setTitle('Anti-Raid: Member Kicked')
                                    .setDescription(`${member.user.tag} (${member.id}) was kicked.`)
                                    .addFields(
                                        { name: 'Reason', value: antiRaidSettings.raidMode ? 'Raid Mode Active' : 'New Account', inline: true },
                                        { name: 'Account Age', value: `${Math.floor((Date.now() - member.user.createdTimestamp) / 86400000)} days`, inline: true }
                                    )
                                    .setTimestamp();
                                
                                await logChannel.send({ embeds: [embed] });
                            }
                        }
                    }
                    break;
                    
                case 'ban':
                    if (member.bannable) {
                        await member.ban({ reason: 'Anti-raid protection', deleteMessageSeconds: 86400 }).catch(console.error);
                        
                        // Log ban
                        if (antiRaidSettings.logChannel) {
                            const logChannel = member.guild.channels.cache.get(antiRaidSettings.logChannel);
                            if (logChannel && logChannel.isTextBased()) {
                                const embed = new EmbedBuilder()
                                    .setColor('#FF0000')
                                    .setTitle('Anti-Raid: Member Banned')
                                    .setDescription(`${member.user.tag} (${member.id}) was banned.`)
                                    .addFields(
                                        { name: 'Reason', value: antiRaidSettings.raidMode ? 'Raid Mode Active' : 'New Account', inline: true },
                                        { name: 'Account Age', value: `${Math.floor((Date.now() - member.user.createdTimestamp) / 86400000)} days`, inline: true }
                                    )
                                    .setTimestamp();
                                
                                await logChannel.send({ embeds: [embed] });
                            }
                        }
                    }
                    break;
            }
        }
    }

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

// Anti-Nuke tracking maps
const roleDeleteMap = new Map();
const channelDeleteMap = new Map();
const banMap = new Map();

// Handler for user and role checks
function isWhitelisted(userId, guildId, member) {
    if (!securitySettings[guildId]?.antiNuke?.enabled) return true;
    
    const antiNukeSettings = securitySettings[guildId].antiNuke;
    
    // Check if user is directly whitelisted
    if (antiNukeSettings.whitelistedUsers.includes(userId)) return true;
    
    // Check if user has a whitelisted role
    if (member && antiNukeSettings.whitelistedRoles.length > 0) {
        return member.roles.cache.some(role => antiNukeSettings.whitelistedRoles.includes(role.id));
    }
    
    return false;
}

// Anti-Nuke action handler
async function handleNukeAttempt(executor, guild, reason) {
    try {
        if (!securitySettings[guild.id]?.antiNuke?.enabled) return;
        
        const antiNukeSettings = securitySettings[guild.id].antiNuke;
        const punishment = antiNukeSettings.punishment;
        const member = await guild.members.fetch(executor.id).catch(() => null);
        
        if (!member) return;
        
        // Log the action
        if (antiNukeSettings.logChannel) {
            const logChannel = guild.channels.cache.get(antiNukeSettings.logChannel);
            if (logChannel && logChannel.isTextBased()) {
                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⚠️ ANTI-NUKE: Suspicious Activity Detected')
                    .setDescription(`Action taken against ${executor.tag} (${executor.id})`)
                    .addFields(
                        { name: 'Reason', value: reason, inline: true },
                        { name: 'Action', value: punishment, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Anti-Nuke Protection', iconURL: guild.iconURL() });
                
                await logChannel.send({ embeds: [embed] });
            }
        }
        
        // Apply punishment
        switch (punishment) {
            case 'ban':
                if (member.bannable) {
                    await member.ban({ reason: `Anti-Nuke: ${reason}`, deleteMessageSeconds: 86400 })
                        .catch(err => console.error(`Anti-Nuke: Could not ban member: ${err}`));
                }
                break;
                
            case 'kick':
                if (member.kickable) {
                    await member.kick(`Anti-Nuke: ${reason}`)
                        .catch(err => console.error(`Anti-Nuke: Could not kick member: ${err}`));
                }
                break;
                
            case 'strip':
                if (member.manageable) {
                    // Get the @everyone role
                    const everyoneRole = guild.roles.everyone;
                    
                    // Remove all roles except those that can't be removed
                    for (const [_, role] of member.roles.cache) {
                        if (role.id !== everyoneRole.id && role.position < guild.me.roles.highest.position) {
                            await member.roles.remove(role, `Anti-Nuke: ${reason}`)
                                .catch(err => console.error(`Anti-Nuke: Could not remove role: ${err}`));
                        }
                    }
                }
                break;
        }
        
        // Try to send a DM to the user
        try {
            await executor.send(`⚠️ Your permissions have been revoked in **${guild.name}** due to suspicious activity: ${reason}`);
        } catch (error) {
            console.log(`Could not send DM to ${executor.tag}: ${error}`);
        }
        
    } catch (error) {
        console.error(`Error in handleNukeAttempt: ${error}`);
    }
}

// Listen for role deletions
client.on('roleDelete', async (role) => {
    try {
        const guild = role.guild;
        const guildId = guild.id;
        
        if (!securitySettings[guildId]?.antiNuke?.enabled) return;
        
        const antiNukeSettings = securitySettings[guildId].antiNuke;
        
        // Fetch audit logs to get who deleted the role
        const auditLogs = await guild.fetchAuditLogs({ type: 'ROLE_DELETE', limit: 1 });
        const logEntry = auditLogs.entries.first();
        
        if (!logEntry || Date.now() - logEntry.createdTimestamp > 5000) return; // Only check recent actions
        
        const executor = logEntry.executor;
        
        if (!executor || executor.id === client.user.id) return; // Skip if bot or unknown
        if (isWhitelisted(executor.id, guildId)) return; // Skip if whitelisted
        
        // Track role deletions
        if (!roleDeleteMap.has(guildId)) {
            roleDeleteMap.set(guildId, new Map());
        }
        
        const guildRoleDeletes = roleDeleteMap.get(guildId);
        if (!guildRoleDeletes.has(executor.id)) {
            guildRoleDeletes.set(executor.id, []);
        }
        
        const userRoleDeletes = guildRoleDeletes.get(executor.id);
        userRoleDeletes.push(Date.now());
        
        // Cleanup old entries outside the timeframe
        const timeThreshold = Date.now() - antiNukeSettings.timeframe;
        while (userRoleDeletes.length > 0 && userRoleDeletes[0] < timeThreshold) {
            userRoleDeletes.shift();
        }
        
        // Check if threshold is exceeded
        if (userRoleDeletes.length >= antiNukeSettings.maxRoleDeletes) {
            await handleNukeAttempt(executor, guild, `Deleted ${userRoleDeletes.length} roles in ${antiNukeSettings.timeframe / 1000} seconds`);
        }
    } catch (error) {
        console.error(`Error in roleDelete event: ${error}`);
    }
});

// Listen for channel deletions
client.on('channelDelete', async (channel) => {
    if (!channel.guild) return; // Ignore DMs
    
    try {
        const guild = channel.guild;
        const guildId = guild.id;
        
        if (!securitySettings[guildId]?.antiNuke?.enabled) return;
        
        const antiNukeSettings = securitySettings[guildId].antiNuke;
        
        // Fetch audit logs to get who deleted the channel
        const auditLogs = await guild.fetchAuditLogs({ type: 'CHANNEL_DELETE', limit: 1 });
        const logEntry = auditLogs.entries.first();
        
        if (!logEntry || Date.now() - logEntry.createdTimestamp > 5000) return; // Only check recent actions
        
        const executor = logEntry.executor;
        
        if (!executor || executor.id === client.user.id) return; // Skip if bot or unknown
        if (isWhitelisted(executor.id, guildId)) return; // Skip if whitelisted
        
        // Track channel deletions
        if (!channelDeleteMap.has(guildId)) {
            channelDeleteMap.set(guildId, new Map());
        }
        
        const guildChannelDeletes = channelDeleteMap.get(guildId);
        if (!guildChannelDeletes.has(executor.id)) {
            guildChannelDeletes.set(executor.id, []);
        }
        
        const userChannelDeletes = guildChannelDeletes.get(executor.id);
        userChannelDeletes.push(Date.now());
        
        // Cleanup old entries outside the timeframe
        const timeThreshold = Date.now() - antiNukeSettings.timeframe;
        while (userChannelDeletes.length > 0 && userChannelDeletes[0] < timeThreshold) {
            userChannelDeletes.shift();
        }
        
        // Check if threshold is exceeded
        if (userChannelDeletes.length >= antiNukeSettings.maxChannelDeletes) {
            await handleNukeAttempt(executor, guild, `Deleted ${userChannelDeletes.length} channels in ${antiNukeSettings.timeframe / 1000} seconds`);
        }
    } catch (error) {
        console.error(`Error in channelDelete event: ${error}`);
    }
});

// Listen for member bans
client.on('guildBanAdd', async (ban) => {
    try {
        const guild = ban.guild;
        const guildId = guild.id;
        
        if (!securitySettings[guildId]?.antiNuke?.enabled) return;
        
        const antiNukeSettings = securitySettings[guildId].antiNuke;
        
        // Fetch audit logs to get who banned the member
        const auditLogs = await guild.fetchAuditLogs({ type: 'MEMBER_BAN_ADD', limit: 1 });
        const logEntry = auditLogs.entries.first();
        
        if (!logEntry || Date.now() - logEntry.createdTimestamp > 5000) return; // Only check recent actions
        
        const executor = logEntry.executor;
        
        if (!executor || executor.id === client.user.id) return; // Skip if bot or unknown
        if (isWhitelisted(executor.id, guildId)) return; // Skip if whitelisted
        
        // Track bans
        if (!banMap.has(guildId)) {
            banMap.set(guildId, new Map());
        }
        
        const guildBans = banMap.get(guildId);
        if (!guildBans.has(executor.id)) {
            guildBans.set(executor.id, []);
        }
        
        const userBans = guildBans.get(executor.id);
        userBans.push(Date.now());
        
        // Cleanup old entries outside the timeframe
        const timeThreshold = Date.now() - antiNukeSettings.timeframe;
        while (userBans.length > 0 && userBans[0] < timeThreshold) {
            userBans.shift();
        }
        
        // Check if threshold is exceeded
        if (userBans.length >= antiNukeSettings.maxBans) {
            await handleNukeAttempt(executor, guild, `Banned ${userBans.length} members in ${antiNukeSettings.timeframe / 1000} seconds`);
        }
    } catch (error) {
        console.error(`Error in guildBanAdd event: ${error}`);
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
