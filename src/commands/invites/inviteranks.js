const { Command, CommandContext } = require("@src/structures");
const { MessageEmbed } = require("discord.js");
const { getSettings } = require("@schemas/guild-schema");
const { EMBED_COLORS, EMOJIS } = require("@root/config");

module.exports = class InviteRanks extends Command {
  constructor(client) {
    super(client, {
      name: "inviteranks",
      description: "Muestra los rangos de invitación configurados en este gremio",
      category: "INVITE",
      botPermissions: ["EMBED_LINKS"],
    });
  }

  /**
   * @param {CommandContext} ctx
   */
  async run(ctx) {
    let settings = await getSettings(ctx.guild);
    if (settings.invite.ranks.length == 0) return await ctx.reply("No hay rangos de invitación configurados en este servidor");
    let str = "";
    settings.invite.ranks.forEach((data) => {
      let roleName = ctx.guild.roles.cache.get(data._id)?.toString();
      if (roleName) {
        str += `${roleName}: ${data.invites} invitaciones\n`;
      }
    });

    const embed = new MessageEmbed().setAuthor("Rangos De Invitación").setColor(EMBED_COLORS.BOT_EMBED).setDescription(str);

    ctx.reply({ embeds: [embed] });
  }
};
