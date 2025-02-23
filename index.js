const { Client, GatewayIntentBits, ActivityType, PermissionsBitField, REST, Routes, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
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

const commands = [
    new SlashCommandBuilder().setName('welcome-setup').setDescription('Setup the welcome message')
        .addStringOption(option => option.setName('background_image').setDescription('Enter the background image URL').setRequired(true))
        .addStringOption(option => option.setName('welcome_message').setDescription('Enter the welcome message').setRequired(true))
        .addChannelOption(option => option.setName('channel').setDescription('Select the welcome channel').setRequired(true)),
    
    new SlashCommandBuilder().setName('kick').setDescription('Kick a user')
        .addUserOption(option => option.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for kick'))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    new SlashCommandBuilder().setName('ban').setDescription('Ban a user')
        .addUserOption(option => option.setName('user').setDescription('User to ban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for ban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder().setName('unban').setDescription('Unban a user')
        .addStringOption(option => option.setName('userid').setDescription('ID of user to unban').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder().setName('mute').setDescription('Mute a user')
        .addUserOption(option => option.setName('user').setDescription('User to mute').setRequired(true))
        .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder().setName('timeout').setDescription('Apply timeout to a user')
        .addUserOption(option => option.setName('user').setDescription('User to timeout').setRequired(true))
        .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder().setName('purge').setDescription('Delete messages')
        .addIntegerOption(option => option.setName('amount').setDescription('Number of messages').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder().setName('invite').setDescription('Get bot invite link'),

    new SlashCommandBuilder().setName('ping').setDescription('Get bot latency'),

    new SlashCommandBuilder().setName('mcstatus').setDescription('Get Minecraft server status')
        .addStringOption(option => option.setName('server_ip').setDescription('Server IP').setRequired(true))
].map(command => command.toJSON());

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    if (interaction.commandName === 'welcome-setup') {
        await interaction.deferReply({ ephemeral: true });
        
        const backgroundImage = interaction.options.getString('background_image');
        const welcomeMessage = interaction.options.getString('welcome_message');
        const channel = interaction.options.getChannel('channel');

        if (!channel.isTextBased()) {
            return interaction.editReply("❌ Please select a valid text channel.");
        }

        welcomeSettings[interaction.guild.id] = {
            backgroundImage,
            welcomeMessage,
            channelId: channel.id
        };

        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(welcomeSettings, null, 4));

        await interaction.editReply("✅ Welcome system configured!");
    }
});

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

// Register Commands Globally
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
    try {
        console.log('Registering slash commands...');
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('Slash commands registered!');
    } catch (error) {
        console.error(error);
    }
})();

client.login(process.env.TOKEN);
 
