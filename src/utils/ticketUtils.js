const { Channel, Guild, GuildMember, TextBasedChannels, MessageEmbed, User } = require("discord.js");
const { postToBin } = require("@utils/httpUtils");
const { EMBED_COLORS, EMOJIS } = require("@root/config.js");
const outdent = require("outdent");
const { getSettings } = require("@schemas/guild-schema");
const { sendMessage } = require("@utils/botUtils");

const PERMS = [
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "EMBED_LINKS",
  "READ_MESSAGE_HISTORY",
  "ADD_REACTIONS",
  "MANAGE_CHANNELS",
  "MANAGE_MESSAGES",
];

/**
 * @param {Channel} channel
 */
function isTicketChannel(channel) {
  return (
    channel.type === "GUILD_TEXT" &&
    channel.name.startsWith("tіcket-") &&
    channel.topic &&
    channel.topic.startsWith("tіcket|")
  );
}

/**
 * @param {Guild} guild
 */
function getTicketChannels(guild) {
  return guild.channels.cache.filter((ch) => isTicketChannel(ch));
}

/**
 * @param {GuildMember} member
 */
function getExistingTicketChannel(guild, userId) {
  const tktChannels = getTicketChannels(guild);
  return tktChannels.filter((ch) => ch.topic.split("|")[1] === userId).first();
}

/**
 * @param {TextBasedChannels} channel
 */
async function parseTicketDetails(channel) {
  if (!channel.topic) return;
  const split = channel.topic?.split("|");
  const userId = split[1];
  const title = split[2];
  const user = await channel.client.users.fetch(userId, { cache: false }).catch((err) => {});
  return {
    title,
    user,
  };
}

/**
 * @param {TextBasedChannels} channel
 * @param {User} closedBy
 * @param {String} reason
 */
async function closeTicket(channel, closedBy, reason) {
  if (
    !channel.deletable ||
    !channel.permissionsFor(channel.guild.me).has(["MANAGE_CHANNELS", "READ_MESSAGE_HISTORY", "MANAGE_MESSAGES"])
  ) {
    return {
      success: false,
      message: "Permisos faltantes",
    };
  }

  try {
    const config = await getSettings(channel.guild);
    const messages = await channel.messages.fetch();
    let reversed = Array.from(messages.values()).reverse();

    let content = "";
    reversed.forEach((m) => {
      content += "[" + new Date(m.createdAt).toLocaleString("en-US") + "] - " + m.author.tag + "\n";
      if (m.cleanContent !== "") content += m.cleanContent + "\n";
      if (m.attachments.size > 0) content += m.attachments.map((att) => att.proxyURL).join(", ") + "\n";
      content += "\n";
    });

    const logsUrl = await postToBin(content, "Registros de tickets para " + channel.name);
    const ticketDetails = await parseTicketDetails(channel);

    const desc = outdent`
    ${EMOJIS.ARROW} **Título:** ${ticketDetails.title}
    ${EMOJIS.ARROW} **Abierto Por:** ${ticketDetails.user ? ticketDetails.user.tag : "El usuario abandono el servidor"}
    ${EMOJIS.ARROW} **Cerrado Por:** ${closedBy ? closedBy.tag : "El usuario abandono el servidor"}
    ${EMOJIS.ARROW} **Razón:** ${reason != null ? reason : "No se proporcionó ninguna razón"}
    ${logsUrl == null ? "" : "\n[Ver Los Registros](" + logsUrl + ")"}
    `;

    await channel.delete();
    const embed = new MessageEmbed().setAuthor("Ticket Cerrado").setColor(EMBED_COLORS.BOT_EMBED).setDescription(desc);

    // send embed to user
    if (ticketDetails.user) ticketDetails.user.send({ embeds: [embed] }).catch((ex) => {});

    // send embed to log channel
    if (config && config.ticket.log_channel) {
      let logChannel = channel.guild.channels.cache.find((ch) => ch.id === config.ticket.log_channel);
      if (logChannel) sendMessage(logChannel, { embeds: [embed] });
    }

    return {
      success: true,
      message: "éxito",
    };
  } catch (ex) {
    console.log(ex);
    return {
      success: false,
      message: "Ocurrió un error inesperado",
    };
  }
}

/**
 * @param {Guild} guild
 * @param {User} author
 */
async function closeAllTickets(guild, author) {
  const channels = getTicketChannels(guild);
  let success = 0;
  let failed = 0;

  for (const [id, ch] of channels) {
    const status = await closeTicket(ch, author, "Forzar el cierre de todos los tickets abiertos");
    if (status.success) success++;
    else failed++;
  }
  return [success, failed];
}

/**
 * @param {Guild} guild
 * @param {User} user
 */
async function openTicket(guild, user, title, supportRole) {
  try {
    const existing = getTicketChannels(guild).size;
    const ticketNumber = (existing + 1).toString();
    const permissionOverwrites = [
      {
        id: guild.roles.everyone,
        deny: ["VIEW_CHANNEL"],
      },
      {
        id: user.id,
        allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY"],
      },
      {
        id: guild.me.roles.highest.id,
        allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY"],
      },
    ];

    if (supportRole)
      permissionOverwrites.push({
        id: supportRole,
        allow: ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY"],
      });

    const tktChannel = await guild.channels.create(`tіcket-${ticketNumber}`, {
      type: "GUILD_TEXT",
      topic: `tіcket|${user.id}|${title}`,
      permissionOverwrites,
    });

    let embed = new MessageEmbed()
      .setAuthor("Ticket #" + ticketNumber)
      .setDescription(
        outdent`
        Hola ${user.toString()}
        El soporte estará con usted en breve
        
      **Razón del ticket:**
      ${title}`
      )
      .setFooter("Para cerrar su boleto, reaccione al candado a continuación");

    const sent = await sendMessage(tktChannel, { content: user.toString(), embeds: [embed] });
    await sent.react(EMOJIS.TICKET_CLOSE);

    const desc = outdent`
    ${EMOJIS.ARROW} **Nombre Del Servidor:** ${guild.name}
    ${EMOJIS.ARROW} **Título:** ${title}
    ${EMOJIS.ARROW} **Ticket:** #${ticketNumber}
    
    [Ver Canal](${sent.url})
  `;
    const dmEmbed = new MessageEmbed()
      .setColor(EMBED_COLORS.BOT_EMBED)
      .setAuthor("Ticket Creado")
      .setDescription(desc);

    user.send({ embeds: [dmEmbed] }).catch((err) => {});
    return true;
  } catch (ex) {
    console.log(ex);
    return false;
  }
}

module.exports = {
  PERMS,
  getTicketChannels,
  getExistingTicketChannel,
  isTicketChannel,
  closeTicket,
  closeAllTickets,
  openTicket,
};
