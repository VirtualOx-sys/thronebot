const { MessageEmbed, MessageAttachment } = require("discord.js");
const { Command, CommandContext } = require("@src/structures");
const { downloadImage } = require("@utils/httpUtils");
const { getImageFromCommand, getFilter } = require("@utils/imageUtils");
const { EMBED_COLORS } = require("@root/config.js");

module.exports = class Filters extends Command {
  constructor(client) {
    super(client, {
      name: "filter",
      aliases: ["blur", "burn", "gay", "greyscale", "invert", "pixelate", "sepia", "sharpen"],
      description: "Añade un filtro a la imagen proporcionada",
      category: "IMAGE",
      botPermissions: ["EMBED_LINKS", "ATTACH_FILES"],
    });
  }

  /**
   * @param {CommandContext} ctx
   */
  async run(ctx) {
    const { message, args, invoke } = ctx;
    const image = await getImageFromCommand(message, args);

    // use invoke as an endpoint
    const url = getFilter(invoke.toLowerCase(), image);
    const buffer = await downloadImage(url);

    if (!buffer) return ctx.reply("No se pudo generar la imagen");

    const attachment = new MessageAttachment(buffer, "attachment.png");
    const embed = new MessageEmbed()
      .setColor(EMBED_COLORS.TRANSPARENT_EMBED)
      .setImage("attachment://attachment.png")
      .setFooter("Solicitado por: " + message.author.tag);

    ctx.reply({ embeds: [embed], files: [attachment] });
  }
};
