const { Client, GatewayIntentBits, ActivityType, PermissionsBitField, REST, Routes } = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SETTINGS_DIR = path.join(__dirname, "maintenance");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "welcomeSettings.json");
const BLACKLIST_FILE = path.join(SETTINGS_DIR, "blacklist.json");

if (!fs.existsSync(SETTINGS_DIR)) fs.mkdirSync(SETTINGS_DIR);
let welcomeSettings = fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) : {};
let blacklistData = fs.existsSync(BLACKLIST_FILE) ? JSON.parse(fs.readFileSync(BLACKLIST_FILE, "utf8")) : {};

const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(3000, () => console.log(`HTTP server running on port 3000`));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent // Added for message-related commands
    ]
});

// Commands Definition
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
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const backgroundImage = interaction.options.getString('background_image') || "";
            const welcomeMessage = interaction.options.getString('welcome_message') || "";
            const channel = interaction.options.getChannel('channel');

            welcomeSettings[interaction.guildId] = {
                backgroundImage,
                welcomeMessage,
                channelId: channel.id
            };

            try {
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(welcomeSettings, null, 2));
                await interaction.reply(`✅ Welcome setup complete! Messages will be sent in <#${channel.id}>.`);
            } catch (error) {
                console.error("Error saving welcome settings:", error);
                return interaction.reply("❌ Failed to save welcome settings.");
            }
        }
    },

    ping: {
        data: { name: 'ping', description: 'Replies with Pong!' },
        async execute(interaction) {
            await interaction.reply('Pong! 🏓');
        },
    },

    purge: {
        data: {
            name: 'purge',
            description: 'Deletes messages in bulk',
            options: [{ type: 4, name: 'amount', description: 'Number of messages to delete (1-100)', required: true }],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: 'You lack permission to manage messages.', ephemeral: true });
            }

            const amount = interaction.options.getInteger('amount') || 1;
            if (amount < 1 || amount > 100) return interaction.reply('❌ You can delete between 1 and 100 messages.');

            try {
                await interaction.channel.bulkDelete(amount, true);
                await interaction.reply(`🗑️ Deleted ${amount} messages.`);
            } catch (error) {
                console.error("Error deleting messages:", error);
                await interaction.reply("❌ Unable to delete messages. Ensure they are not older than 14 days.");
            }
        },
    },

    blacklistword: {
        data: {
            name: 'blacklistword',
            description: 'Blacklists a word from being used in chat',
            options: [{ type: 3, name: 'word', description: 'Word to blacklist', required: true }],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            const word = interaction.options.getString('word')?.toLowerCase();
            if (!word) return interaction.reply("❌ Please provide a valid word.");

            if (!blacklistData[interaction.guildId]) blacklistData[interaction.guildId] = { blacklisted: [] };

            if (!blacklistData[interaction.guildId].blacklisted.includes(word)) {
                blacklistData[interaction.guildId].blacklisted.push(word);
                try {
                    fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2));
                    return interaction.reply(`🚫 The word **"${word}"** has been blacklisted.`);
                } catch (error) {
                    console.error("Error saving blacklist:", error);
                    return interaction.reply("❌ Failed to update the blacklist.");
                }
            } else {
                return interaction.reply(`⚠️ The word **"${word}"** is already blacklisted.`);
            }
        },
    },

    whitelistword: {
        data: {
            name: 'whitelistword',
            description: 'Removes a word from the blacklist',
            options: [{ type: 3, name: 'word', description: 'Word to whitelist', required: true }],
        },
        async execute(interaction) {
            if (!interaction.guild) return interaction.reply({ content: "❌ This command can only be used in a server.", ephemeral: true });

            const word = interaction.options.getString('word')?.toLowerCase();
            if (!word) return interaction.reply("❌ Please provide a valid word.");

            if (!blacklistData[interaction.guildId] || !blacklistData[interaction.guildId].blacklisted.includes(word)) {
                return interaction.reply(`⚠️ The word **"${word}"** is not in the blacklist.`);
            }

            blacklistData[interaction.guildId].blacklisted = blacklistData[interaction.guildId].blacklisted.filter(w => w !== word);
            try {
                fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2));
                return interaction.reply(`✅ The word **"${word}"** has been removed from the blacklist.`);
            } catch (error) {
                console.error("Error saving whitelist:", error);
                return interaction.reply("❌ Failed to update the blacklist.");
            }
        },
    }
};

// Register Commands Globally
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: Object.values(commands).map(cmd => cmd.data) });
        console.log('✅ Successfully registered global slash commands.');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
})();

client.login(process.env.TOKEN);
