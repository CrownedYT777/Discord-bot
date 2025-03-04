const { Client, GatewayIntentBits, PermissionsBitField, REST, Routes } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

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

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = commands[interaction.commandName];
    if (command) {
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);
            await interaction.reply({ content: "❌ An error occurred while executing this command.", ephemeral: true });
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
        console.log(`✅ Welcome image sent to ${member.user.username} in ${member.guild.name}`);
    } catch (error) {
        console.error(`❌ Failed to send welcome image:`, error);
    }
});

client.login(process.env.TOKEN);
