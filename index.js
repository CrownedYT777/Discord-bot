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

// HTTP Server for UptimeRobot
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(3000, () => console.log(`HTTP server running on port 3000`));

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages]
});

// Commands Definition
const commands = {
    welcomesetup: {
        data: {
            name: 'welcome-setup',
            discription: 'setup the welcome message',
            options: [
                { type: 3, name: 'background_image', discription: 'Enter background image URL', required: true },
                { type: 3, name: 'welcome_message', discription: 'Enter the welcome message', required: true },
                { type: 7, name: 'channel', discription: 'Set the welcome message channel', required: true }
            ],
        },
        async execute(interaction) {
            if (!interaction.member.permission.has(PermissionsBitField.Flags.Administrator)) {
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

            await interaction.channel.bulkDelete(amount, true);
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
            if (!blacklistData[interaction.guildId]) blacklistData[interaction.guildId] = { blacklisted: [] };

            const word = interaction.options.getString('word').toLowerCase();
            if (!blacklistData[interaction.guildId].blacklisted.includes(word)) {
                blacklistData[interaction.guildId].blacklisted.push(word);
                fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2));
                return interaction.reply(`🚫 The word **"${word}"** has been blacklisted.`);
            } else {
                return interaction.reply(`⚠️ The word **"${word}"** is already blacklisted.`);
            }
        },
    },

    whitelistWord: {
        data: {
            name: 'whitelist-word',
            description: 'Removes a word from the blacklist',
            options: [{ type: 3, name: 'word', description: 'Word to whitelist', required: true }],
        },
        async execute(interaction) {
            if (!blacklistData[interaction.guildId] || !blacklistData[interaction.guildId].blacklisted.includes(word)) {
                return interaction.reply(`⚠️ The word **"${word}"** is not in the blacklist.`);
            }

            blacklistData[interaction.guildId].blacklisted = blacklistData[interaction.guildId].blacklisted.filter(w => w !== word);
            fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(blacklistData, null, 2));
            return interaction.reply(`✅ The word **"${word}"** has been removed from the blacklist.`);
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

// Status & Heartbeat Logging
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);

    const statusMessages = ["🎧 Listening to Music", "🎮 Playing Minecraft", "👾 Moderating Chat"];
    const statusTypes = ['dnd', 'idle', 'online'];
    let currentStatusIndex = 0;
    let currentTypeIndex = 0;

    function updateStatus() {
        client.user.setPresence({
            activities: [{ name: statusMessages[currentStatusIndex], type: ActivityType.Custom }],
            status: statusTypes[currentTypeIndex],
        });

        console.log(`[ STATUS ] Updated to: ${statusMessages[currentStatusIndex]} (${statusTypes[currentTypeIndex]})`);

        currentStatusIndex = (currentStatusIndex + 1) % statusMessages.length;
        currentTypeIndex = (currentTypeIndex + 1) % statusTypes.length;
    }

    function heartbeat() {
        console.log('[ HEARTBEAT ] Bot is alive');
    }

    updateStatus();
    setInterval(updateStatus, 30000);
    setInterval(heartbeat, 30000);
});

client.login(process.env.TOKEN);
                
