const { Client, GatewayIntentBits, ActivityType, PermissionsBitField, REST, Routes } = require('discord.js');
const axios = require('axios');
const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const SETTINGS_DIR = path.join(__dirname, "maintenance");
const SETTINGS_FILE = path.join(SETTINGS_DIR, "welcomeSettings.json");

// Ensure maintenance directory exists
if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR);
}

// Load existing settings
let welcomeSettings = fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) : {};

// HTTP Server to Keep the Bot Running
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
const PORT = 3000;
app.listen(PORT, () => console.log(`HTTP server running on port ${PORT}`));

// Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages
    ]
});

// Commands Definition
const commands = {
    welcomeSetup: {
        data: {
            name: 'welcome-setup',
            description: 'Setup the welcome message',
            options: [
                { type: 3, name: 'background_image', description: 'Enter background image URL', required: true },
                { type: 3, name: 'welcome_message', description: 'Enter the welcome message', required: true },
                { type: 7, name: 'channel', description: 'Select the welcome channel', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
            }

            const backgroundImage = interaction.options.getString('background_image');
            const welcomeMessage = interaction.options.getString('welcome_message');
            const channel = interaction.options.getChannel('channel');

            welcomeSettings[interaction.guildId] = {
                backgroundImage,
                welcomeMessage,
                channelId: channel.id
            };

            // Save settings to file
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(welcomeSettings, null, 2));

            await interaction.reply(`✅ Welcome setup complete! Messages will be sent in <#${channel.id}>.`);
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
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({ content: 'You lack permission to manage messages.', ephemeral: true });
            }

            const amount = interaction.options.getInteger('amount');
            if (amount < 1 || amount > 100) return interaction.reply('You can delete between 1 and 100 messages.');

            const channel = interaction.channel;
            await channel.bulkDelete(amount, true);
            await interaction.reply(`🗑️ Deleted ${amount} messages.`);
        },
    },

    addrole: {
        data: {
            name: 'addrole',
            description: 'Adds a role to a user',
            options: [
                { type: 6, name: 'user', description: 'User to assign role', required: true },
                { type: 8, name: 'role', description: 'Role to assign', required: true },
            ],
        },
        async execute(interaction) {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                return interaction.reply({ content: 'You lack permission to manage roles.', ephemeral: true });
            }

            const user = interaction.options.getMember('user');
            const role = interaction.options.getRole('role');

            await user.roles.add(role);
            await interaction.reply(`✅ ${role.name} role added to ${user.user.tag}.`);
        },
    },

    removerole: {
        data: {
            name: 'removerole',
            description: 'Removes a role from a user',
            options: [
                { type: 6, name: 'user', description: 'User to remove role from', required: true },
                { type: 8, name: 'role', description: 'Role to remove', required: true },
            ],
        },
        async execute(interaction) {
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                return interaction.reply({ content: 'You lack permission to manage roles.', ephemeral: true });
            }

            const user = interaction.options.getMember('user');
            const role = interaction.options.getRole('role');

            await user.roles.remove(role);
            await interaction.reply(`✅ ${role.name} role removed from ${user.user.tag}.`);
        },
    },

    blacklistWord: {
        data: {
            name: 'blacklist-word',
            description: 'Blacklists a word from being used in chat',
            options: [{ type: 3, name: 'word', description: 'Word to blacklist', required: true }],
        },
        async execute(interaction) {
            const word = interaction.options.getString('word');
            // Implement blacklist logic here
            await interaction.reply(`🚫 Blacklisted word: ${word}`);
        },
    },

    whitelistWord: {
        data: {
            name: 'whitelist-word',
            description: 'Removes a word from the blacklist',
            options: [{ type: 3, name: 'word', description: 'Word to whitelist', required: true }],
        },
        async execute(interaction) {
            const word = interaction.options.getString('word');
            // Implement whitelist logic here
            await interaction.reply(`✅ Whitelisted word: ${word}`);
        },
    },
};

// Register Commands
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
    try {
        const commandsData = Object.values(commands).map(command => command.data);
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commandsData });
        console.log('✅ Successfully registered slash commands.');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
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
        await interaction.reply({ content: '⚠️ There was an error executing this command.', ephemeral: true });
    }
});

// Welcome Message Handler (Fixed PNG Issue)
client.on('guildMemberAdd', async (member) => {
    const settings = welcomeSettings[member.guild.id];
    if (!settings) return;

    const welcomeChannel = member.guild.channels.cache.get(settings.channelId);
    if (!welcomeChannel) return;

    const welcomeImageURL = `https://api.popcat.xyz/welcomecard?background=${encodeURIComponent(settings.backgroundImage)}&text1=${encodeURIComponent(member.user.username)}&text2=${encodeURIComponent(settings.welcomeMessage)}&text3=Member+%23${member.guild.memberCount}&avatar=${member.user.displayAvatarURL()}`.replace('.webp', '.png');

    welcomeChannel.send(welcomeImageURL);
});

client.once('ready', () => console.log(`✅ Logged in as ${client.user.tag}!`));
client.login(process.env.TOKEN);
